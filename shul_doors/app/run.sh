#!/bin/sh
# Pass on the key Home Assistant gives this app, if the start-up hid it from the environment.
for k in SUPERVISOR_TOKEN HASSIO_TOKEN; do
  eval "v=\${$k}"
  if [ -z "$v" ] && [ -r "/run/s6/container_environment/$k" ]; then export "$k=$(cat /run/s6/container_environment/$k)"; fi
done
# Keep the box running: if the program ever stops, start it again after a few seconds.
while true; do
  node /app/server.js
  echo "Shul Doors stopped (exit $?). Restarting in 10 seconds."
  sleep 10
done
