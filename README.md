# @dgac/asterix-tool

DGAC ASTERIX toolkit

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@dgac/asterix-replay.svg)](https://npmjs.org/package/@dgac/asterix-replay)
[![CircleCI](https://circleci.com/gh/kouak/asterix-replay/tree/master.svg?style=shield)](https://circleci.com/gh/kouak/asterix-replay/tree/master)
[![Codecov](https://codecov.io/gh/kouak/asterix-replay/branch/master/graph/badge.svg)](https://codecov.io/gh/kouak/asterix-replay)
[![Downloads/week](https://img.shields.io/npm/dw/@dgac/asterix-replay.svg)](https://npmjs.org/package/@dgac/asterix-replay)
[![License](https://img.shields.io/npm/l/@dgac/asterix-replay.svg)](https://github.com/kouak/asterix-replay/blob/master/package.json)

<!-- toc -->
* [@dgac/asterix-tool](#dgacasterix-tool)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @dgac/asterix-tool
$ asterix-tool COMMAND
running command...
$ asterix-tool (-v|--version|version)
@dgac/asterix-tool/0.1.0 linux-x64 node-v13.9.0
$ asterix-tool --help [COMMAND]
USAGE
  $ asterix-tool COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`asterix-tool help [COMMAND]`](#asterix-tool-help-command)
* [`asterix-tool replay SOURCE_FILE`](#asterix-tool-replay-source_file)

## `asterix-tool help [COMMAND]`

display help for asterix-tool

```
USAGE
  $ asterix-tool help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src/commands/help.ts)_

## `asterix-tool replay SOURCE_FILE`

Forwards ASTERIX packets from a pcap file to a unix or udp socket

```
USAGE
  $ asterix-tool replay SOURCE_FILE

ARGUMENTS
  SOURCE_FILE  Source PCAP file.
               (note: the file can only contain ASTERIX traffic)

OPTIONS
  -d, --destination=destination        [default: udp4://localhost:8600] The destination to forward the ASTERIX messages
                                       to.
                                       e.g: unix:/tmp/asterix.socket or udp4://localhost:8600

  -h, --help                           show CLI help

  -n, --max-count=max-count            [default: Infinity] Number of messages forwarded before exiting

  -v, --verbose                        Verbose output

  --source-format=udp4|macllc          [default: udp4] Source format (udp4 or MAC/LLC)

  --time-compression=time-compression  [default: 1] Time compression factor.
                                       For instance, a value of 2 will process the file twice at fast as it was record.

  --version                            show CLI version
```

_See code: [src/commands/replay.ts](https://github.com/DGAC/asterix-tool/blob/v0.1.0/src/commands/replay.ts)_
<!-- commandsstop -->
