#!/bin/bash

set -e

CHANNEL_NAME=$1

echo ">>> Generating genesis block for channel: ${CHANNEL_NAME}"

configtxgen -profile TwoOrgsApplicationGenesis -channelID "$CHANNEL_NAME" -outputBlock ./system-genesis-block/genesis.block

echo "✔️  Genesis block generated successfully."