#!/bin/bash

# Start Redis with TLS configuration
echo "Starting Redis with TLS on port 6379..."

# Check if Redis is already running
if pgrep -f "redis-server.*tls" > /dev/null; then
    echo "Redis with TLS is already running"
    exit 1
fi

# Start Redis with TLS config
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"
redis-server redis-tls.conf