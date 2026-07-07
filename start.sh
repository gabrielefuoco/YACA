#!/bin/bash
set -e

echo "Starting Redis server..."
# Avvia Redis in background, limitando la memoria a 1GB con logica LRU
redis-server --daemonize yes --maxmemory 1gb --maxmemory-policy allkeys-lru

echo "Waiting for Redis to be ready..."
sleep 2

echo "Starting YACA Node app..."
# Esegue Node in foreground così il container rimane attivo
exec node --expose-gc index.js
