import { Command, flags } from '@oclif/command';
import stream, { Stream } from 'stream';
import { logger } from '../logger';
import { PCAPParser } from '../stream/PCAPParser';
import { StripHeaders } from '../stream/StripHeaders';
import { AsterixTransform } from '../stream/AsterixChunkTransform';
import { createReadStream } from '../utils';
import cliProgress from 'cli-progress';
import cli from 'cli-ux';
import fs from 'fs';
import { sortBy } from 'ramda';
import { formatDistance } from 'date-fns';

import { promisify } from 'util';
const pipeline = promisify(stream.pipeline);

type AsterixFileInfo = {
  asterix: {
    totalMessages: number;
    categories: { [key: string]: number };
    timeOfFirstMessage?: Date;
    timeOfLastMessage?: Date;
  };
};

export default class Info extends Command {
  static description =
    'Prints statistics about a PCAP package containing ASTERIX messages';

  static flags = {
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

  private async computeStatistics(): Promise<AsterixFileInfo> {
    const { args, flags } = this.parse(Info);

    const progress = new cliProgress.SingleBar(
      {
        format: '[{bar}] {percentage}% | ETA: {eta}s | {value}/{total} KB',
      },
      cliProgress.Presets.shades_classic,
    );

    // eslint-disable-next-line no-async-promise-executor
    return await new Promise(async (resolve, reject) => {
      try {
        const statistics: AsterixFileInfo = {
          asterix: {
            totalMessages: 0,
            categories: {},
          },
        };

        const sourceSt = await createReadStream(args.source_file);
        const metadata = fs.statSync(args.source_file);
        const size = metadata.size;

        progress.start(Math.floor(size / 1024), 0);

        let readBytes = 0;
        sourceSt.on('data', (buf) => {
          readBytes += buf.length;
          progress.update(Math.floor(readBytes / 1024));
        });

        await pipeline(
          sourceSt,
          new PCAPParser({ timeCompressionFactor: null }),
          new StripHeaders({
            mode: flags['source-format'] === 'macllc' ? 'macllc' : 'udp',
          }),
          new AsterixTransform(),
          new Stream.Writable({
            objectMode: true,
            async write(obj, encoding, cb): Promise<void> {
              console.log(obj);
              statistics.asterix.totalMessages++;
              statistics.asterix.categories[obj.cat] =
                (statistics.asterix.categories[obj.cat] || 0) + 1;

              if (!statistics.asterix.timeOfFirstMessage) {
                statistics.asterix.timeOfFirstMessage = new Date(obj.ts);
              }

              statistics.asterix.timeOfLastMessage = new Date(obj.ts);
              // await delay(0);
              cb();
            },
          }),
        );

        progress.stop();
        resolve(statistics);
      } catch (error) {
        progress.stop();
        reject(error);
      }
    });
  }

  async run(): Promise<void> {
    const { flags } = this.parse(Info);
    const verbose = flags.verbose;
    if (verbose) {
      logger.level = 'trace';
    }

    try {
      const stats = await this.computeStatistics();

      this.log('\n');

      const categories = sortBy(
        (a) => -a[1],
        Object.entries(stats.asterix.categories),
      );

      const metadata = [
        [
          'Capture started:',
          stats.asterix.timeOfFirstMessage?.toISOString() || 'UNKNOWN',
        ],
        [
          'Capture ended:',
          stats.asterix.timeOfLastMessage?.toISOString() || 'UNKNOWN',
        ],
        [
          'Capture duration:',
          !!stats.asterix.timeOfFirstMessage && stats.asterix.timeOfLastMessage
            ? formatDistance(
                stats.asterix.timeOfFirstMessage,
                stats.asterix.timeOfLastMessage,
              )
            : 'UNKNOWN',
        ],
      ];

      cli.table(
        metadata,
        {
          name: {
            get: (row) => row[0],
          },
          value: {
            get: (row) => row[1],
          },
        },
        {
          'no-header': true,
        },
      );

      this.log('');

      cli.table(categories, {
        category: {
          get: (row) => `CAT${row[0].toString().padStart(3, '0')}`,
        },
        count: {
          get: (row) => row[1],
        },
      });
    } catch (error) {
      this.error(error);
    }
  }
}
