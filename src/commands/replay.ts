import { Command, flags } from '@oclif/command';
import * as fs from 'fs';
import { URL } from 'url';
import stream, { Stream } from 'stream';
import { logger } from '../logger';
import { PCAPParser } from '../stream/PCAPParser';
import { StripHeaders } from '../stream/StripHeaders';
import { AsterixTransform } from '../stream/AsterixChunkTransform';
import {
  createReadStream,
  createWriteStream,
  DestinationStreamConfig,
} from '../utils';

import { promisify } from 'util';
const pipeline = promisify(stream.pipeline);

export default class Replay extends Command {
  static description =
    'Forwards ASTERIX packets from a pcap file to a unix or udp socket';

  static flags = {
    version: flags.version(),
    help: flags.help({ char: 'h' }),
    destination: flags.string({
      char: 'd',
      default: 'udp4://localhost:8600',
      description:
        'The destination to forward the ASTERIX messages to.\n' +
        'e.g: unix:/tmp/asterix.socket or udp4://localhost:8600',
    }),
    'max-count': flags.integer({
      char: 'n',
      description: 'Number of messages forwarded before exiting',
      default: Infinity,
    }),
    verbose: flags.boolean({
      char: 'v',
      description: 'Verbose output',
      default: false,
    }),
    'source-format': flags.string({
      description: 'Source format (udp4 or MAC/LLC)',
      default: 'udp4',
      options: ['udp4', 'macllc'],
    }),
    'time-compression': flags.integer({
      description:
        'Time compression factor.\n' +
        'For instance, a value of 2 will process the file twice at fast as it was record.',
      default: 1,
    }),
  };

  static args = [
    {
      name: 'source_file',
      required: true,
      description:
        'Source PCAP file.\n' +
        '(note: the file can only contain ASTERIX traffic)',
    },
  ];

  private async readAndForward({
    destination,
  }: {
    destination: DestinationStreamConfig;
  }): Promise<void> {
    const { args, flags } = this.parse(Replay);

    // eslint-disable-next-line no-async-promise-executor
    await new Promise(async (resolve, reject) => {
      try {
        const sourceSt = await createReadStream(args.source_file);
        const destSocket = await createWriteStream(destination);

        let itemCount = 0;
        await pipeline(
          sourceSt,
          new PCAPParser({ timeCompressionFactor: flags['time-compression'] }),
          new StripHeaders({
            mode: flags['source-format'] === 'macllc' ? 'macllc' : 'udp',
          }),
          new AsterixTransform(),
          new Stream.Writable({
            objectMode: true,
            async write(obj, encoding, cb): Promise<void> {
              if (itemCount >= flags['max-count']) {
                logger.trace(
                  `Count is ${itemCount}, higher than ${flags['max-count']}`,
                );

                cb();
                this.end();
                return;
              }

              logger.debug(`${obj.ts.toISOString()}: CAT ${obj.cat}`);

              try {
                await destSocket.send(obj.asterix);
                itemCount++;
              } catch (error) {
                cb(error);
                return;
              }

              cb();
            },
          }),
        );

        destSocket.client.close();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async run(): Promise<void> {
    const { flags } = this.parse(Replay);
    const verbose = flags.verbose;
    if (verbose) {
      logger.level = 'trace';
    }

    /**
     * Check destination
     */
    let destination: DestinationStreamConfig | null = null;

    try {
      const url = new URL(flags.destination);

      switch (url.protocol) {
        case 'udp:':
        case 'udp4:':
        case 'udp6:': {
          destination = {
            type: 'udp',
            port: parseInt(url.port || `8600`, 10),
            hostname: url.hostname,
          };
          break;
        }
        case 'unix:': {
          destination = {
            type: 'unix',
            pathname: url.pathname,
          };
          break;
        }
        default:
          throw new Error(
            `${url.protocol} is not a supported destination protocole.`,
          );
      }
    } catch (error) {
      this.error(
        `${flags.destination} is not a validation destination: ${error.message}`,
      );
    }

    logger.trace(`Destination is %o`, destination);

    /**
     * Check destination socket existence if applicable
     */
    if (destination.type === 'unix') {
      try {
        const stats = fs.statSync(destination.pathname);

        if (!stats.isSocket()) {
          this.error(`${destination.pathname} is not a unix socket !`);
        }
      } catch (error) {
        this.error(`Could not read ${destination.pathname}: ${error.message}`);
      }

      logger.trace(`${destination.pathname} is a proper socket`);
    }

    try {
      await this.readAndForward({ destination });
    } catch (error) {
      this.error(error);
    }
  }
}
