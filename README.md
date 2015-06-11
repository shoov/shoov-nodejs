# NodeJs backend server for Shoov.

This server is responsible for creating PRs for visual regressions, and executing live monitor tests.

## Install

Install all node dependencies:

    $ npm install

## Execute

    $ BACKEND_URL=https://backend.com pm2 start bin/www --name=node-server

Possible environments:

* __BACKEND_URL__ - url address of backend server. 
* __DEBUG__ - enable debug mode, output all docker logs to stdout. _(optional)_
* __VNC_PASSOWRD__ - password for connect to VNC. _(optional)_
* __TIMEOUT_LIMIT__ - timeout in seconds to start silenium container _(optional)_, default 30 seconds.
