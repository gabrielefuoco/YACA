#!/bin/sh
# Start Redis in background, then launch the Node.js application.
# Configured for non-root environments (e.g., Hugging Face Spaces)

echo "🔧 Starting Redis server..."
redis-server --dir /tmp --maxmemory 2048mb --maxmemory-policy allkeys-lru --save "" --appendonly no &

# Wait for Redis to be ready
for i in 1 2 3 4 5; do
    redis-cli ping > /dev/null 2>&1 && break
    echo "Waiting for Redis..."
    sleep 1
done

echo "✅ Redis is ready."

# Start the Node.js application (Express + Next.js custom server)
exec node --expose-gc server.js
