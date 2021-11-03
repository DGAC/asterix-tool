import pino from 'pino';

export const logger = pino({
  prettyPrint: {
    ignore: 'pid,hostname',
    translateTime: true,
  },
  level: process.env.LOG_LEVEL || 'info',
});
