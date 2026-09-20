#!/bin/bash
set -e

echo "Starting YACA Node app..."
# Redis vive in un container separato (v. docker-compose.yml), non qui dentro.
exec node --expose-gc index.js
