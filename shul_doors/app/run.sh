#!/bin/sh
# Keep the box running: if the program ever stops, start it again after a few seconds.
while true; do
  node /app/server.js
  echo "Shul Doors stopped (exit $?). Restarting in 10 seconds."
  sleep 10
done
