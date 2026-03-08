#!/bin/sh
# Start Redis in background, then launch the Node.js application.
# Configurato per ambienti non-root (es. Hugging Face Spaces)

echo "🔧 Starting Redis server..."
redis-server --dir /tmp --maxmemory 2048mb --maxmemory-policy allkeys-lru --save "" --appendonly no &

# Wait for Redis to be ready
for i in 1 2 3 4 5; do
    redis-cli ping > /dev/null 2>&1 && break
    echo "Waiting for Redis..."
    sleep 1
done

echo "✅ Redis is ready."

# Start the Node.js application
exec node --expose-gc index.js
