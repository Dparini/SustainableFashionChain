#!/bin/bash

# Wait for mongos to be ready
echo "Waiting for mongos to be ready..."
sleep 30

# Initialize config server replica set
echo "Initializing config server replica set..."
mongosh --host sustainablefashionchain-mongo-config-1-1 --port 27017 <<EOF_MONGOSH
rs.initiate({
  _id: "configReplSet",
  configsvr: true,
  members: [
    { _id: 0, host: "sustainablefashionchain-mongo-config-1-1:27017" },
    { _id: 1, host: "sustainablefashionchain-mongo-config-2-1:27017" },
    { _id: 2, host: "sustainablefashionchain-mongo-config-3-1:27017" }
  ]
})
EOF_MONGOSH

sleep 20

# Initialize shard1 replica set
echo "Initializing shard 1 replica set..."
mongosh --host sustainablefashionchain-mongo-shard1-1-1 --port 27017 <<EOF_MONGOSH
rs.initiate({
  _id: "shard1",
  members: [
    { _id: 0, host: "sustainablefashionchain-mongo-shard1-1-1:27017" },
    { _id: 1, host: "sustainablefashionchain-mongo-shard1-2-1:27017" },
    { _id: 2, host: "sustainablefashionchain-mongo-shard1-3-1:27017" }
  ]
})
EOF_MONGOSH

sleep 20

# Initialize shard2 replica set
echo "Initializing shard 2 replica set..."
mongosh --host sustainablefashionchain-mongo-shard2-1-1 --port 27017 <<EOF_MONGOSH
rs.initiate({
  _id: "shard2",
  members: [
    { _id: 0, host: "sustainablefashionchain-mongo-shard2-1-1:27017" },
    { _id: 1, host: "sustainablefashionchain-mongo-shard2-2-1:27017" },
    { _id: 2, host: "sustainablefashionchain-mongo-shard2-3-1:27017" }
  ]
})
EOF_MONGOSH

sleep 20

# Add shards to cluster
echo "Adding shards to cluster..."
mongosh --host sustainablefashionchain-mongos1-1 --port 27017 <<EOF_MONGOSH
sh.addShard("shard1/sustainablefashionchain-mongo-shard1-1-1:27017,sustainablefashionchain-mongo-shard1-2-1:27017,sustainablefashionchain-mongo-shard1-3-1:27017")
sh.addShard("shard2/sustainablefashionchain-mongo-shard2-1-1:27017,sustainablefashionchain-mongo-shard2-2-1:27017,sustainablefashionchain-mongo-shard2-3-1:27017")
EOF_MONGOSH

sleep 10

# Enable sharding for database and collections
echo "Enabling sharding for database and collections..."
mongosh --host sustainablefashionchain-mongos1-1 --port 27017 <<EOF_MONGOSH
// Enable sharding for database
sh.enableSharding("sustainablefashionchain")

// Enable sharding for collections
sh.shardCollection("sustainablefashionchain.batches", { "farmId": "hashed" })
sh.shardCollection("sustainablefashionchain.products", { "manufacturer": "hashed" })
sh.shardCollection("sustainablefashionchain.users", { "organization": "hashed" })
sh.shardCollection("sustainablefashionchain.transactions", { "timestamp": 1 })

// Create indexes
db.batches.createIndex({ "farmId": "hashed" })
db.products.createIndex({ "manufacturer": "hashed" })
db.users.createIndex({ "organization": "hashed" })
db.transactions.createIndex({ "timestamp": 1 })

// Output status
sh.status()
EOF_MONGOSH

echo "MongoDB sharded cluster setup complete!"
