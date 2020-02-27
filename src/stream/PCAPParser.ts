import { Transform, TransformCallback } from 'stream';
import { logger } from '../logger';
import { delay } from '../utils';

type GlobalHeaders = {
  magicNumber: Buffer;
  versionMajor: number;
  versionMinor: number;
  thiszone: number;
  sigfigs: number;
  snaplen: number;
  network: number;
};

export type RawPacket = { packet: Buffer; ts: Date };

export class PCAPParser extends Transform {
  private count: number = 0;
  private content: Buffer = Buffer.from([]);
  private globalHeaders: undefined | GlobalHeaders;
  private lastPacketTs: undefined | Date;
  private shouldCancel: boolean = false;
  private timeCompressionFactor: number = 1;

  private log = logger.child({ name: 'PCAPParser' });

  constructor({
    timeCompressionFactor = 1,
    ...options
  }: { timeCompressionFactor?: number } = {}) {
    super({
      ...options,
      readableObjectMode: true,
    });

    this.timeCompressionFactor = timeCompressionFactor;
  }

  _destroy(err: null | Error, cb: Function) {
    logger.trace('[PCAP]: Destroying !');
    this.shouldCancel = true;
    cb(err);
  }

  async _transform(chunk: unknown, encoding: string, cb: TransformCallback) {
    if (!Buffer.isBuffer(chunk)) {
      throw new Error('Transformer only works on binary streams');
    }

    this.content = Buffer.concat([
      this.content || Buffer.from([]),
      chunk as Buffer,
    ]);

    if (this.count === 0) {
      this.globalHeaders = this.parseHeaders();
    }

    const asyncIter = this.parsePackets();
    for await (const packet of asyncIter) {
      if (this.shouldCancel) {
        break;
      }

      this.log.trace(`[PCAP]: Pushing ${this.count}`);
      this.push(packet);
      this.count++;
    }

    cb();
  }

  _flush(cb: TransformCallback) {
    this.log.debug(`Successfully parsed ${this.count} captured packets`);
    cb();
  }

  private readBytes(n: number): Buffer {
    if (this.content.length < n) {
      throw new Error(
        `Could not read ${n} bytes. Buffered content is only ${this.content.length} bytes long.`,
      );
    }

    const r = this.content.slice(0, n);
    this.content = this.content.slice(n);
    return r;
  }

  parseHeaders(): GlobalHeaders {
    const magicNumber = this.readBytes(4);
    const versionMajor = this.readBytes(2).readUInt16LE(0);
    const versionMinor = this.readBytes(2).readUInt16LE(0);
    const thiszone = this.readBytes(4).readInt32LE(0);
    const sigfigs = this.readBytes(4).readUInt32LE(0);
    const snaplen = this.readBytes(4).readUInt32LE(0);
    const network = this.readBytes(4).readUInt32LE(0);

    // Valid magic numbers:
    // https://osqa-ask.wireshark.org/questions/51702/magic-numbers-for-supported-capture-files-for-wireshark/51709

    if (magicNumber.toString('hex') !== 'd4c3b2a1') {
      this.destroy(
        new Error(
          `Invalid PCAP magic number: ${magicNumber.toString(
            'hex',
          )}. Are you sure the source input is a pcap file ?`,
        ),
      );
    }

    return {
      magicNumber,
      versionMajor,
      versionMinor,
      thiszone,
      sigfigs,
      snaplen,
      network,
    };
  }

  parsePackets(): AsyncIterable<RawPacket> {
    return {
      [Symbol.asyncIterator]: () => {
        return {
          next: async () => {
            try {
              if (this.content.length === 0 || this.shouldCancel) {
                return { done: true, value: null };
              }

              const tsSec = this.content.readUInt32LE(0);
              const tsUSec = this.content.readUInt32LE(4);
              const inclLen = this.content.readUInt32LE(8);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const origLen = this.content.readUInt32LE(12);

              if (this.content.length < 16 + inclLen) {
                return { done: true, value: null };
              }

              const packet = this.content.slice(16, inclLen + 16);
              const ts = new Date(tsSec * 1000 + Math.floor(tsUSec / 1000));

              this.content = this.content.slice(inclLen + 16);
              if (this.lastPacketTs) {
                const timeOffset = ts.getTime() - this.lastPacketTs.getTime();
                await delay(timeOffset / this.timeCompressionFactor);
              }

              this.lastPacketTs = ts;

              return {
                done: false,
                value: {
                  packet,
                  ts,
                },
              };
            } catch (err) {
              logger.fatal('Unable to parse packet:', err.message);
              process.exit(1);
              return { done: true, value: null };
            }
          },
        };
      },
    };
  }
}
