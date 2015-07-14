[![Build Status](https://travis-ci.org/shoov/shoov.svg?branch=master)](https://travis-ci.org/shoov/shoov)
# Node.js backend server for [Shoov](https://github.com/shoov/shoov)

> This server is responsible for creating PRs for visual regressions, and executing live monitor tests.

## Installation

Install all node dependencies:

```bash
# Install pm2
$ npm install pm2 -g

# Install packages
$ npm install

# Pull docker containers
$ docker pull amitaibu/php-ci
$ docker pull elgalu/selenium:v2.46.0-base1
```

## Configuration

Make copy of default config and edit it.

    $ cp config.json.example config.json

Environment variables have more priority then configuration.

Possible properties:

* __BACKEND_URL__ - The url address of backend server. When used locally it should be the IP address and not the site alias.
* __LOGGLY_TOKEN__ - Private token for Loggly service. 
* __LOGGLY_SUBDOMAIN__ - Subdomain for Loggly service. 
* __LOGGLY_UUID__ - The UUID for Loggly service. For development environment use `nodejs-dev` for production `nodejs-live`. Default set to development. _(optional)_
* __DEBUG__ - Enable debug mode, display debug messages and safe logs for each ci build in logs. _(optional)_
* __VNC_PASSOWRD__ - The password to connect to VNC. _(optional)_
* __DOCKER_STARTUP_TIMEOUT__ - Determines the time in seconds which the docker may spend in starting up, and getting ready for execution. Defaults to 30 seconds.
* __DOCKER_RUN_TIMEOUT__ - Determines the time in seconds which the docker may execute the tests. Defaults to 1200 seconds (20 minutes).

## Execute

```bash
$ BACKEND_URL=http://example.local \
  node bin/www
```
## Debug

Possible different debug levels:
* `DEBUG=*` - display all debug information (express, http, logs, docker, builds)
* `DEBUG=true` - display only developer information (docker, builds)
* `DEBUG=<express_component>`
