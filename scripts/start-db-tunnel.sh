#!/bin/zsh
set -euo pipefail

exec /usr/bin/ssh \
  -N \
  -L 5433:127.0.0.1:5432 \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o TCPKeepAlive=yes \
  -o StrictHostKeyChecking=accept-new \
  root@144.124.249.201
