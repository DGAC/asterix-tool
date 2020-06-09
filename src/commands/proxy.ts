import { Command, flags } from '@oclif/command';
import stream from 'stream';
import { logger } from '../logger';
import ipAddr from 'ipaddr.js';
import dgram from 'dgram';
import os from 'os';

import { promisify } from 'util';
const pipeline = promisify(stream.pipeline);

export default class Proxy extends Command {
  static description = 'Proxies UDP multicast ASTERIX to a UNIX socket';

  static flags = {
    verbose: flags.boolean({
      char: 'v',
      description: 'Verbose output',
      default: false,
    }),
    // destination: flags.string({
    //   char: 'd',
    //   default: 'udp4://localhost:8600',
    //   description:
    //     'The destination to forward the ASTERIX messages to.\n' +
    //     'e.g: unix:/tmp/asterix.socket or udp4://localhost:8600',
    // }),
    port: flags.integer({
      char: 'p',
      default: 8600,
      description: 'port.',
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

      const client = dgram.createSocket({
        type: mcastGroup.kind() === 'ipv4' ? 'udp4' : 'udp6',
        reuseAddr: true,
      });

      client.bind({
        port: flags.port,
      });

      client.once('listening', () => {
        const netifs = os.networkInterfaces();

        Object.entries(netifs).forEach(([netif, addresses]) => {
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
            console.log(`Interface ${netif} has no valid IP addr`);
            return;
          }

          client.addMembership(mcastGroup.toString(), membershipAddr.address);
          console.log(
            `Listening on interface ${netif}/${membershipAddr.address}`,
          );
        });
      });

      client.on('message', (message, remote) => {
        console.log(
          `Received ${message.length} bytes from ${remote.address} (${remote.port})`,
        );
      });

      console.log('Socket bound !');
    } catch (error) {
      this.error(error);
    }
  }
}
