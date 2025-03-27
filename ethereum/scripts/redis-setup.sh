#!/bin/bash

# Wait for Redis nodes to be ready
echo "Waiting for Redis nodes to be ready..."
sleep 10

# Create Redis cluster
echo "Creating Redis cluster..."
redis-cli --cluster create \
    redis-1:6379 \
    redis-2:6380 \
    redis-3:6381 \
    --cluster-replicas 0 \
    --cluster-yes

# Verify cluster status
echo "Verifying cluster status..."
redis-cli -h redis-1 -p 6379 cluster info
redis-cli -h redis-1 -p 6379 cluster nodes

echo "Redis cluster setup complete!"

# Configure persistence
echo "Configuring persistence..."
for port in 6379 6380 6381; do
    redis-cli -h redis-1 -p $port config set save "900 1 300 10 60 10000"
    redis-cli -h redis-1 -p $port config set appendonly yes
    redis-cli -h redis-1 -p $port config set appendfsync everysec
done

# Configure memory limits
echo "Configuring memory limits..."
for port in 6379 6380 6381; do
    redis-cli -h redis-1 -p $port config set maxmemory 1gb
    redis-cli -h redis-1 -p $port config set maxmemory-policy allkeys-lru
done

# Configure security
echo "Configuring security..."
for port in 6379 6380 6381; do
    redis-cli -h redis-1 -p $port config set protected-mode yes
done

echo "Redis configuration complete!"