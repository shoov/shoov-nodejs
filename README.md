# NodeJs backend server for Shoov.

This server is responsible for creating PRs for visual regressions, and executing live monitor tests.

## Install

Install all node dependencies:

    $ npm install

## Execute

    $ BACKEND_URL=http://192.168.1.32/shoov.local \
      LOGGLY_TOKEN=802390n3-c3d4-4d44-a022-0nv7a34n8934 \
      DEBUG=true \
      pm2 start bin/www --name=node-server

Possible environments:

* __BACKEND_URL__ - The url address of backend server. It's can't be alias for your ip (for example shoov.local) because docker doesn't know about your hosts. 
* __LOGGLY_TOKEN__ - Private token to Loggly service. 
* __DEBUG__ - Enable debug mode, display debug messages and safe logs for each ci build in logs. _(optional)_
* __VNC_PASSOWRD__ - The password to connect to VNC. _(optional)_
* __DOCKER_STARTUP_TIMEOUT__ - Determines the time in seconds which the docker may spend in starting up, and getting ready for execution. Defaults to 30 seconds.
* __DOCKER_RUN_TIMEOUT__ - Determines the time in seconds which the docker may execute the tests. Defaults to 1200 seconds (20 minutes).
