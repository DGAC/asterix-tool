import { Transform, TransformOptions, TransformCallback } from 'stream';
import { RawPacket } from './PCAPParser';

export class AsterixTransform extends Transform {
  private shouldCancel = false;
  private count = 0;

  constructor(options: TransformOptions = {}) {
    super({
      ...options,
      allowHalfOpen: false,
      readableObjectMode: true,
      writableObjectMode: true,
    });
  }

  static readCategory(chunk: Buffer): number {
    return chunk.readUInt8(0);
  }

  static readLen(chunk: Buffer): number {
    return chunk.readUInt16BE(1);
  }

  async _transform(
    { ts, packet }: RawPacket,
    encoding: string,
    done: TransformCallback,
  ): Promise<void> {
    try {
      let start = 0;

      do {
        if (start >= packet.length) {
          break;
        }

        const remainder = packet.slice(start);

        const cat = AsterixTransform.readCategory(remainder);
        const len = AsterixTransform.readLen(remainder);
        if (!len) {
          throw new Error(
            'Could not extract length from ASTERIX packet. Is the file format right ?',
          );
        }

        const asterix = remainder.slice(0, len);
        start += len;

        this.push({
          ts,
          cat,
          len,
          asterix,
        });
      } while (true);

      this.count++;
      done();
    } catch (error) {
      done(error);
    }
  }
}
