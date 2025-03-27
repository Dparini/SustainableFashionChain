#!/bin/bash

# Script semplificato per avviare i componenti essenziali

echo "Avvio di SustainableFashionChain in modalità semplificata..."

# Avvia bridging
cd bridging
echo "Avvio del bridge..."
node bridge.js &
BRIDGE_PID=$!
cd ..

# Avvia frontend
cd frontend
echo "Avvio del frontend..."
npm start &
FRONTEND_PID=$!
cd ..

echo "Componenti avviati:"
echo "Bridge PID: $BRIDGE_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Premi Ctrl+C per terminare"

# Attendi che l'utente prema Ctrl+C
wait
