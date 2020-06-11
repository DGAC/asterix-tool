import { Command, flags } from '@oclif/command';
import stream, { Stream } from 'stream';
import { logger } from '../logger';
import ipAddr from 'ipaddr.js';
import dgram from 'dgram';
import os from 'os';
import { AsterixTransform } from '../stream/AsterixChunkTransform';
import { promisify } from 'util';
const pipeline = promisify(stream.pipeline);
import * as appFlags from '../flags';
import { parseDestination, createWriteStream } from '../utils';

export default class Proxy extends Command {
  static description = 'Proxies UDP multicast ASTERIX to a UNIX socket';

  static flags = {
    verbose: appFlags.verbose(),
    destination: appFlags.destination(),
    port: flags.integer({
      char: 'p',
      default: 8600,
      description: 'Port number to listen to.',
    }),
    interface: flags.string({
      char: 'i',
      description: 'Network interface.\n' + "Default value is 'all'",
      default: 'all',
    }),
  };

  static args = [
    {
      name: 'multicast-group',
      required: true,
      description: 'Multicast group address.\n' + 'e.g: 232.1.1.1 or ff02::fb',
    },
  ];

  async run(): Promise<void> {
    const { args, flags } = this.parse(Proxy);
    const verbose = flags.verbose;
    if (verbose) {
      logger.level = 'trace';
    }

    try {
      /**
       * Validate data source
       */
      if (!ipAddr.isValid(args['multicast-group'])) {
        throw new Error(
          `${args['multicast-group']} is not a valid IP address !`,
        );
      }

      const mcastGroup = ipAddr.parse(args['multicast-group']);
      const range = mcastGroup.range();
      if (range !== 'multicast') {
        throw new Error(
          `${args['multicast-group']} is not a multicast IP address !`,
        );
      }

      /**
       * Validate destination
       */

      const destination = parseDestination(flags.destination);
      logger.info(`Destination is %o`, destination);

      const destinationStream = await createWriteStream(destination);

      /**
       * Create input stream
       */
      const client = dgram.createSocket({
        type: mcastGroup.kind() === 'ipv4' ? 'udp4' : 'udp6',
        reuseAddr: true,
      });

      client.on('error', (error) => {
        this.error(error);
      });

      client.bind(
        {
          port: flags.port,
          exclusive: false,
        },
        () => {
          logger.info('Socket bound');
        },
      );

      client.once('listening', () => {
        const knownInterfaces = os.networkInterfaces();

        const netifs = Object.entries(knownInterfaces).filter(
          ([netif, addresses]) => {
            if (!addresses) {
              return false;
            }

            if (flags.interface === 'all') {
              return true;
            }

            return netif === flags.interface;
          },
        );

        if (netifs.length === 0) {
          this.error(
            `Could not find network interface ${
              flags.interface
            }. Valid values are ${Object.keys(knownInterfaces).join(', ')}`,
          );
        }

        let oneInterfaceBound = false;
        netifs.forEach(([netif, addresses]) => {
          if (!addresses || addresses.length === 0) {
            return;
          }

          const membershipAddr = addresses.find((addr) => {
            if (
              (addr.family === 'IPv4' && mcastGroup.kind() === 'ipv6') ||
              (addr.family === 'IPv6' && mcastGroup.kind() === 'ipv4')
            ) {
              return false;
            }

            return true;
          });

          if (!membershipAddr) {
            logger.info(`Interface ${netif} has no valid IP addr`);
            return;
          }

          client.addMembership(mcastGroup.toString(), membershipAddr.address);
          oneInterfaceBound = true;
          logger.info(
            `Listening on interface ${netif}/${membershipAddr.address}`,
          );
        });

        if (!oneInterfaceBound) {
          this.error('No suitable network interface could be found');
        }
      });

      // let itemCount = 0;
      const sourceSt = new Stream.Transform({
        readableObjectMode: true,
        transform(chunk: Buffer, encoding, cb) {
          this.push({ ts: new Date(), packet: chunk });
          cb();
        },
      });

      client.on('message', (message, remote) => {
        sourceSt.write(message);
        logger.trace(
          `Received ${message.length} bytes from ${remote.address} (${remote.port})`,
        );
      });

      await pipeline(
        sourceSt,
        new AsterixTransform({ errorOnInvalid: false }),
        new Stream.Writable({
          objectMode: true,
          async write(obj, encoding, cb): Promise<void> {
            // if (itemCount >= flags['max-count']) {
            //   logger.trace(
            //     `Count is ${itemCount}, higher than ${flags['max-count']}`,
            //   );

            //   cb();
            //   this.end();
            //   return;
            // }

            try {
              await destinationStream.send(obj.asterix);
              logger.debug(
                `Forwarded: CAT ${obj.cat} (${obj.asterix.length} bytes)`,
              );
              // itemCount++;
            } catch (error) {
              cb(error);
              return;
            }

            cb();
          },
        }),
      );
    } catch (error) {
      this.error(error);
    }
  }
}
