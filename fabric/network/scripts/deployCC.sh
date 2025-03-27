#!/bin/bash

set -e

CHANNEL_NAME=$1
CC_NAME=$2
CC_SRC_PATH=$3
CC_SRC_LANGUAGE=$4
CC_VERSION=$5
CC_SEQUENCE=$6
CC_INIT_FCN=$7
CC_END_POLICY=$8
CC_COLL_CONFIG=$9

echo ">>> Deploying chaincode $CC_NAME to channel $CHANNEL_NAME"

peer lifecycle chaincode package ${CC_NAME}.tar.gz --path "$CC_SRC_PATH" --lang "$CC_SRC_LANGUAGE" --label ${CC_NAME}_${CC_VERSION}
peer lifecycle chaincode install ${CC_NAME}.tar.gz

# Add more steps here based on your network structure

echo "✔️  Chaincode deployed (package & install done)."