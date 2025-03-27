#!/bin/bash

# Hyperledger Fabric network configuration
export FABRIC_CFG_PATH=${PWD}/config
export CHANNEL_NAME=mychannel
export CHAINCODE_NAME=supplychain
export CHAINCODE_VERSION=1.0
export CHAINCODE_PATH=../chaincode/supplychain
export CHAINCODE_LANG=node
export ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem

# Organization variables
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Helper function to package chaincode
packageChaincode() {
  peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
    --path ${CHAINCODE_PATH} \
    --lang ${CHAINCODE_LANG} \
    --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}
}

# Helper function to install chaincode
installChaincode() {
  peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz
}

# Helper function to approve chaincode
approveChaincode() {
  PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep ${CHAINCODE_NAME} | awk '{print $3}' | sed 's/,//')

  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls \
    --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --init-required \
    --package-id ${PACKAGE_ID} \
    --sequence 1
}

# Helper function to commit chaincode
commitChaincode() {
  peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls \
    --cafile $ORDERER_CA \
    --channelID $CHANNEL_NAME \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence 1 \
    --init-required
}