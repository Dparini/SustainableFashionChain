#!/bin/bash

# Exit on first error
set -e

# Import utility functions
. scripts/utils.sh

# Initialize variables
CHANNEL_NAME="sustainchannel"
CC_NAME="supplychain"
CC_SRC_PATH="../chaincode/supplychain"
CC_SRC_LANGUAGE="go"
CC_VERSION="1.0"
CC_SEQUENCE="1"
CC_INIT_FCN="InitLedger"
CC_END_POLICY="OR('Org1MSP.peer','Org2MSP.peer')"
CC_COLL_CONFIG=""
DELAY="3"
MAX_RETRY="5"
VERBOSE="false"

# Define functions for network operations
function networkUp() {
  # Make sure that the script knows where it is running from
  pushd "${PWD}" >/dev/null

  # Generate crypto material and channel artifacts if they don't exist
  if [ ! -d "organizations/peerOrganizations" ]; then
    infoln "Generating crypto material..."
    ./scripts/generateCrypto.sh
  fi

  if [ ! -f "system-genesis-block/genesis.block" ]; then
    infoln "Generating genesis block..."
    ./scripts/generateGenesis.sh ${CHANNEL_NAME}
  fi

  # Start the network
  infoln "Starting the Hyperledger Fabric network..."
  docker-compose up -d

  # Wait for network to start
  sleep ${DELAY}

  # Verify network is running
  docker ps -a

  popd >/dev/null
}

function networkDown() {
  # Bring down the network
  infoln "Stopping the Hyperledger Fabric network..."
  docker-compose down --volumes --remove-orphans

  # Remove generated files
  infoln "Removing generated files..."
  rm -rf organizations/peerOrganizations
  rm -rf organizations/ordererOrganizations
  rm -rf system-genesis-block
  rm -rf channel-artifacts
}

function createChannel() {
  pushd "${PWD}" >/dev/null

  # Create the channel
  infoln "Creating channel ${CHANNEL_NAME}..."
  ./scripts/createChannel.sh ${CHANNEL_NAME}

  popd >/dev/null
}

function deployCC() {
  pushd "${PWD}" >/dev/null

  # Deploy the chaincode
  infoln "Deploying chaincode ${CC_NAME}..."
  ./scripts/deployCC.sh ${CHANNEL_NAME} ${CC_NAME} ${CC_SRC_PATH} ${CC_SRC_LANGUAGE} ${CC_VERSION} ${CC_SEQUENCE} ${CC_INIT_FCN} ${CC_END_POLICY} ${CC_COLL_CONFIG}

  popd >/dev/null
}

function printHelp() {
  println "Usage: "
  println "  network.sh <command> [flags]"
  println
  println "Commands:"
  println "  up - Start the Hyperledger Fabric network"
  println "  down - Stop the Hyperledger Fabric network"
  println "  createChannel - Create a channel"
  println "  deployCC - Deploy chaincode"
  println
  println "Flags:"
  println "  -c <channel name> - Channel name (default \"sustainchannel\")"
  println "  -ccn <name> - Chaincode name (default \"supplychain\")"
  println "  -ccp <path> - Path to chaincode (default \"../chaincode/supplychain\")"
  println "  -ccl <language> - Chaincode language (default \"go\")"
  println "  -ccv <version> - Chaincode version (default \"1.0\")"
  println "  -ccs <sequence> - Chaincode sequence (default 1)"
  println "  -cci <function> - Chaincode initialization function (default \"InitLedger\")"
  println "  -ccep <policy> - Chaincode endorsement policy (default \"OR('Org1MSP.peer','Org2MSP.peer')\")"
  println "  -cccg <config> - Chaincode collection configuration file"
  println "  -v - Verbose mode"
  println
}

# Parse command line arguments
while [[ $# -ge 1 ]] ; do
  key="$1"
  case $key in
  -h )
    printHelp
    exit 0
    ;;
  -c )
    CHANNEL_NAME="$2"
    shift
    ;;
  -ccn )
    CC_NAME="$2"
    shift
    ;;
  -ccp )
    CC_SRC_PATH="$2"
    shift
    ;;
  -ccl )
    CC_SRC_LANGUAGE="$2"
    shift
    ;;
  -ccv )
    CC_VERSION="$2"
    shift
    ;;
  -ccs )
    CC_SEQUENCE="$2"
    shift
    ;;
  -cci )
    CC_INIT_FCN="$2"
    shift
    ;;
  -ccep )
    CC_END_POLICY="$2"
    shift
    ;;
  -cccg )
    CC_COLL_CONFIG="$2"
    shift
    ;;
  -v )
    VERBOSE=true
    ;;
  up )
    infoln "Starting network"
    networkUp
    ;;
  down )
    infoln "Stopping network"
    networkDown
    ;;
  createChannel )
    infoln "Creating channel ${CHANNEL_NAME}"
    createChannel
    ;;
  deployCC )
    infoln "Deploying chaincode ${CC_NAME}"
    deployCC
    ;;
  * )
    errorln "Unknown flag: $key"
    printHelp
    exit 1
    ;;
  esac
  shift
done

# Execute the script
if [[ $# -lt 1 ]] ; then
  printHelp
  exit 0
fi