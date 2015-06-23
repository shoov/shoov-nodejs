[![Build Status](https://travis-ci.org/shoov/shoov.svg?branch=master)](https://travis-ci.org/shoov/shoov)
# Node.js backend server for [Shoov](https://github.com/shoov/shoov)

> This server is responsible for creating PRs for visual regressions, and executing live monitor tests.

## Installation

Install all node dependencies:

```bash
# Install packages
$ npm install

# Pull docker containers
docker pull amitaibu/php-ci
docker pull elgalu/selenium:v2.46.0-base1
```

## Execute

```bash
$ BACKEND_URL=http://example.local \
  LOGGLY_TOKEN=<token> \
  LOGGLY_SUBDOMAIN=<subdomain> \
  pm2 start bin/www --name=shoov-nodejs
```

Possible environments:

* __BACKEND_URL__ - The url address of backend server. When used locally it should be the IP address and not the site alias.
* __LOGGLY_TOKEN__ - Private token for Loggly service. 
* __LOGGLY_SUBDOMAIN__ - Subdomain for Loggly service. 
* __DEBUG__ - Enable debug mode, display debug messages and safe logs for each ci build in logs. _(optional)_
* __VNC_PASSOWRD__ - The password to connect to VNC. _(optional)_
* __DOCKER_STARTUP_TIMEOUT__ - Determines the time in seconds which the docker may spend in starting up, and getting ready for execution. Defaults to 30 seconds.
* __DOCKER_RUN_TIMEOUT__ - Determines the time in seconds which the docker may execute the tests. Defaults to 1200 seconds (20 minutes).
