import { Transform, TransformOptions, TransformCallback } from 'stream';
import { RawPacket } from './PCAPParser';
import { logger } from '../logger';

export class AsterixTransform extends Transform {
  private shouldCancel = false;
  private count = 0;
  private errorOnInvalid = false;

  constructor({
    errorOnInvalid = true,
    ...options
  }: TransformOptions & { errorOnInvalid?: boolean } = {}) {
    super({
      ...options,
      allowHalfOpen: false,
      readableObjectMode: true,
      writableObjectMode: true,
    });

    this.errorOnInvalid = errorOnInvalid;
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

        if (remainder.length < 3) {
          break;
        }

        logger.trace(`Reading packet length=${remainder.length}`);
        const cat = AsterixTransform.readCategory(remainder);
        const len = AsterixTransform.readLen(remainder);
        if (!len || !cat) {
          if (this.errorOnInvalid) {
            throw new Error(
              'Could not extract length from ASTERIX packet. Is the file format right ?',
            );
          }

          logger.debug(`Non-ASTERIX packet found (${packet.length}bytes)`);
          break;
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
      done(error as Error);
    }
  }
}
