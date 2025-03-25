#!/bin/bash

# Wait for mongos to be ready
echo "Waiting for mongos to be ready..."
sleep 30

# Initialize config server replica set
echo "Initializing config server replica set..."
mongosh --host mongo-config-1 --port 27017 <<EOF
rs.initiate({
  _id: "configReplSet",
  configsvr: true,
  members: [
    { _id: 0, host: "mongo-config-1:27017" },
    { _id: 1, host: "mongo-config-2:27017" },
    { _id: 2, host: "mongo-config-3:27017" }
  ]
})
EOF

sleep 20

# Initialize shard1 replica set
echo "Initializing shard 1 replica set..."
mongosh --host mongo-shard1-1 --port 27017 <<EOF
rs.initiate({
  _id: "shard1",
  members: [
    { _id: 0, host: "mongo-shard1-1:27017" },
    { _id: 1, host: "mongo-shard1-2:27017" },
    { _id: 2, host: "mongo-shard1-3:27017" }
  ]
})
EOF

sleep 20

# Initialize shard2 replica set
echo "Initializing shard 2 replica set..."
mongosh --host mongo-shard2-1 --port 27017 <<EOF
rs.initiate({
  _id: "shard2",
  members: [
    { _id: 0, host: "mongo-shard2-1:27017" },
    { _id: 1, host: "mongo-shard2-2:27017" },
    { _id: 2, host: "mongo-shard2-3:27017" }
  ]
})
EOF

sleep 20

# Add shards to cluster
echo "Adding shards to cluster..."
mongosh --host mongos1 --port 27017 <<EOF
sh.addShard("shard1/mongo-shard1-1:27017,mongo-shard1-2:27017,mongo-shard1-3:27017")
sh.addShard("shard2/mongo-shard2-1:27017,mongo-shard2-2:27017,mongo-shard2-3:27017")
EOF

sleep 10

# Enable sharding for database and collections
echo "Enabling sharding for database and collections..."
mongosh --host mongos1 --port 27017 <<EOF
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
EOF

echo "MongoDB sharded cluster setup complete!"