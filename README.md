# NodeJs backend server for Shoov.

This server is responsible for creating PRs for visual regressions, and executing live monitor tests.

## Install

Install all node dependencies:

    $ npm install

## Execute

    $ BACKEND_URL=http://192.168.1.32/shoov.local DEBUG=true pm2 start bin/www --name=node-server

Possible environments:

* __BACKEND_URL__ - url address of backend server. It's can't be alias for your ip (for example shoov.local) because docker doesn't know about your hosts. 
* __DEBUG__ - enable debug mode, output all docker logs to stdout. _(optional)_
* __VNC_PASSOWRD__ - password for connect to VNC. _(optional)_
* __TIMEOUT_LIMIT__ - timeout in __seconds__ to start silenium container _(optional)_, by default 30 seconds.
* __UPTIME_LIMIT__ - timeout in __minutes__ for maximum server uptime _(optional)_, by default 20 minutes.
