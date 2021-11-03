import { Transform, TransformCallback, TransformOptions } from 'stream';
import { logger } from '../logger';

import { RawPacket } from './PCAPParser';

const OFFSETS = {
  ETHERNET: 14,
  IPV4: 20,
  LLC: 3,
  UDP: 8,
};

export class StripHeaders extends Transform {
  private offset: number = 0;
  private mode: 'udp' | 'macllc';
  private count: number = 0;
  private log = logger.child({ name: 'NetworkHeadersStripper' });

  constructor({
    mode = 'udp',
    ...rest
  }: TransformOptions & { mode?: 'macllc' | 'udp' } = {}) {
    super({
      ...rest,
      allowHalfOpen: false,
      readableObjectMode: true,
      writableObjectMode: true,
    });

    this.mode = mode;

    if (mode === 'udp') {
      this.offset = OFFSETS.ETHERNET + OFFSETS.IPV4 + OFFSETS.UDP;
    } else if (mode === 'macllc') {
      this.offset = OFFSETS.ETHERNET + OFFSETS.LLC;
    }
  }

  _transform(rawPacket: RawPacket, enc: string, cb: TransformCallback): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const etherType = rawPacket.packet.readUInt16BE(12);

    let packet = rawPacket.packet.slice(this.offset);

    if (this.mode === 'macllc') {
      const etherLen = rawPacket.packet.readUInt16BE(12);
      packet = packet.slice(0, etherLen - 3);
    }

    this.log.trace(
      `[StripHeaders]: Packet ${this.count} length=${packet.length}`,
    );

    this.push({
      ...rawPacket,
      packet,
    });
    this.count++;

    cb();
  }
}
