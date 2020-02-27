import pino from 'pino';

export const logger = pino({
  prettyPrint: {
    ignore: 'pid,hostname',
    translateTime: true,
  },
  level: 'info',
});
