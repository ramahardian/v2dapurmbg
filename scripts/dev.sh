#!/bin/bash
set -e

node scripts/build.js --dev

trap 'kill 0' SIGINT SIGTERM EXIT

nodemon --watch public/modul --ext js --exec "node scripts/build.js --dev" &

exec nodemon --watch server.js --watch routes --watch views --ext js,json,ejs server.js
