#!/bin/sh
set -eu
umask 077
# The chainstate, RPC cookie, and any future wallet data live on the attached disk.
install -d -m 0700 -o litecoin -g litecoin /var/data/litecoin
gosu litecoin python3 /opt/litecoin/readiness.py &
exec gosu litecoin litecoind -chain=main -conf=/dev/null -datadir=/var/data/litecoin -server=1 -listen=0 -rpcbind=127.0.0.1 -rpcallowip=127.0.0.1 -prune=4096 -dbcache=256 -printtoconsole=1
