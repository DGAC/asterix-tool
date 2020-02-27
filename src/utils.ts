import fs from 'fs';
import dgram from 'dgram';
import unixDgram from 'unix-dgram';

export const delay = (d: number, { unref = false }: { unref?: boolean } = {}) =>
  new Promise(resolve => {
    const t = setTimeout(() => {
      resolve();
    }, d);

    if (unref) {
      t.unref();
    }
  });

export async function createReadStream(
  ...args: Parameters<typeof fs.createReadStream>
): Promise<ReturnType<typeof fs.createReadStream>> {
  return new Promise((resolve, reject) => {
    const st = fs.createReadStream(...args);
    st.on('open', () => {
      resolve(st);
    });

    st.on('error', err => {
      reject(err);
    });
  });
}

export type DestinationStreamConfig =
  | {
      type: 'unix';
      pathname: string;
    }
  | {
      type: 'udp';
      hostname: string;
      port: number;
    };

interface Forwarder {
  client: unixDgram.UnixSocket | dgram.Socket;
  send(buf: Buffer): Promise<void>;
}

export async function createWriteStream<T extends Forwarder>(
  config: DestinationStreamConfig,
): Promise<Forwarder> {
  switch (config.type) {
    case 'udp': {
      const client = dgram.createSocket({ type: 'udp4' });
      client.unref();

      return {
        client,
        send: (msg: Buffer) =>
          new Promise((resolve, reject) => {
            client.send(
              msg,
              0,
              msg.length,
              config.port,
              config.hostname,
              err => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              },
            );
          }),
      };
    }
    case 'unix': {
      const stats = fs.statSync(config.pathname);

      if (!stats.isSocket()) {
        throw new Error(`${config.pathname} is not a unix socket !`);
      }

      return new Promise((resolve, reject) => {
        const client = unixDgram.createSocket('unix_dgram');

        client.on('error', err => {
          reject(err);
        });

        client.on('connect', () => {
          resolve({
            client,
            send: (msg: Buffer) =>
              new Promise((resolve, reject) => {
                client.send(msg, err => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  resolve();
                });
              }),
          });
        });

        client.connect(config.pathname);
      });
    }
    default:
      throw new Error('Unimplemented');
  }
}
