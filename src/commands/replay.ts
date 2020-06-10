import { Command, flags } from '@oclif/command';
import stream, { Stream } from 'stream';
import { logger } from '../logger';
import { PCAPParser } from '../stream/PCAPParser';
import { StripHeaders } from '../stream/StripHeaders';
import { AsterixTransform } from '../stream/AsterixChunkTransform';
import {
  createReadStream,
  createWriteStream,
  DestinationStreamConfig,
  parseDestination,
} from '../utils';
import * as appFlags from '../flags';

import { promisify } from 'util';
const pipeline = promisify(stream.pipeline);

export default class Replay extends Command {
  static description =
    'Forwards ASTERIX packets from a pcap file to a unix or udp socket';

  static flags = {
    destination: appFlags.destination(),
    'max-count': flags.integer({
      char: 'n',
      description: 'Number of messages forwarded before exiting',
      default: Infinity,
    }),
    verbose: appFlags.verbose(),
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

    if (flags.destination == null) {
      throw new Error('flags.destination is not set, should never happen.');
    }

    const verbose = flags.verbose;
    if (verbose) {
      logger.level = 'trace';
    }

    /**
     * Parse destination
     */
    const destination = parseDestination(flags.destination);
    logger.info(`Destination is %o`, destination);

    try {
      await this.readAndForward({ destination });
    } catch (error) {
      this.error(error);
    }
  }
}
