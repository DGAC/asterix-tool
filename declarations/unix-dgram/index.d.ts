declare module 'unix-dgram' {
  import { EventEmitter } from 'events';
  import { Socket } from 'dgram';

  export interface UnixSocket extends Omit<EventEmitter, 'bind' | 'send'> {
    bind(path: string): any;
    connect(path: string): void;
    send(
      msg: Buffer,
      callback: Parameters<Socket['send']>[5],
    ): ReturnType<Socket['send']>;
    send(
      msg: Buffer,
      offset: number,
      length: number,
      path: string,
      callback: Parameters<Socket['send']>[5],
    ): ReturnType<Socket['send']>;
    close(): void;
  }

  function createSocket(
    type: 'unix_dgram',
    cb?: (data: Buffer) => void,
  ): UnixSocket;
}
