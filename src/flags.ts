import { flags } from '@oclif/command';

export const destination = flags.build({
  char: 'd',
  default: 'udp4://localhost:8600',
  description:
    'The destination to forward the ASTERIX messages to.\n' +
    'e.g: unix:/tmp/asterix.socket or udp4://localhost:8600',
});

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const verbose = () =>
  flags.boolean({
    char: 'v',
    description: 'Verbose output',
    default: false,
  });
