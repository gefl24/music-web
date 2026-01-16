#!/bin/sh
set -e

echo "Starting LX Music Web Application..."

if [ ! -d "/app/data" ]; then
    echo "Creating data directory..."
    mkdir -p /app/data/sources /app/data/downloads
fi

echo "Starting Nginx..."
nginx

sleep 2

if ! pgrep nginx > /dev/null; then
    echo "ERROR: Nginx failed to start"
    exit 1
fi

echo "Nginx started successfully"
cd /app/backend

echo "Starting Node.js application..."
exec node src/app.js
