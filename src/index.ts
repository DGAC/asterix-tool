export { run } from '@oclif/command';

function exit() {
  process.exit(0);
}

process.on('SIGINT', exit);
process.on('SIGTERM', exit);
