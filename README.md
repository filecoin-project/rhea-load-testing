# rhea-load-testing

> A simple load tester for booster-http

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Overview

This is a simple docker setup that uses [K6](k6.io) to run a series of load tests of finding providers and fetching content against the Saturn most common CIDs list:
- The Kubo HTTP API for finding providers
- The Network Indexer for finding providers (with DHT fallback)
- A Lassie Daemon for fetching content
- A Kubo Gateway URL for fetching content

## Setup

### Prequisites

- Docker Engine must be installed on the machine running load tests, along with the Docker Compose plugin. See [Docker Engine installation overview](https://docs.docker.com/engine/install/)
- Running Kubo Daemon
- Running Lassie Daemon

### Configuration

#### Docker .env

The load test reads configuration from environment variables in the .env file .

Before you run the load test for the first time, you should run:

```
$ cp .env.example .env
```

You will need to edit .env to set the relevant config options

e.g:

```
KUBO_API_BASE=http://127.0.0.1:5001
LASSIE_FETCH_URL=http://127.0.0.1:8888
KUBO_GATEWAY_URL=http://127.0.0.1:8080
```

These values can be determined a few ways. Kubo daemon startup output typically looks like this:

```
Initializing daemon...
Kubo version: 0.17.0
Repo version: 12
System version: arm64/darwin
Golang version: go1.19.1
Swarm listening on /ip4/10.0.0.8/tcp/4001
Swarm listening on /ip4/10.0.0.8/udp/4001/quic
Swarm listening on /ip4/127.0.0.1/tcp/4001
Swarm listening on /ip4/127.0.0.1/udp/4001/quic
Swarm listening on /ip6/::1/tcp/4001
Swarm listening on /ip6/::1/udp/4001/quic
Swarm listening on /p2p-circuit
Swarm announcing /ip4/10.0.0.8/tcp/4001
Swarm announcing /ip4/10.0.0.8/udp/4001/quic
Swarm announcing /ip4/127.0.0.1/tcp/4001
Swarm announcing /ip4/127.0.0.1/udp/4001/quic
Swarm announcing /ip6/::1/tcp/4001
Swarm announcing /ip6/::1/udp/4001/quic
API server listening on /ip4/127.0.0.1/tcp/5001
WebUI: http://127.0.0.1:5001/webui
Gateway (readonly) server listening on /ip4/127.0.0.1/tcp/8080
Daemon is ready
```

The relevant lines to pull from are `API Server Listening on ...` for KUBO_API_BASE and `Gateway (readonly) server listening on ...` for KUBO_GATEWAY_URL

For lassie, start the API daemon with `-p` and use the values you used for port at startup.

## Load Testing

To run a load test using the host machine's local k6 runner, run:

```
$ ./loadtest.sh
```

Your load test will display output as it runs. Once it's complete, you can view
performance data in grafana, which will remain running after the load test shuts down.

Alternatively, a load test summary CSV file will also be created in the `/results` directory of the project.

## Contribute

Early days PRs are welcome!

## License

This library is dual-licensed under Apache 2.0 and MIT terms.

Copyright 2022. Protocol Labs, Inc.
