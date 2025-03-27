cd ~/Documents/SustainableFashionChain

cat > scripts/check-sync.sh << 'EOF'
#!/bin/bash

# Verifica che le cartelle originali e quelle in packages/ siano sincronizzate

PROJECT_ROOT=$(pwd)
echo "Confronto delle strutture nel progetto: $PROJECT_ROOT"

# Funzione per confrontare due directory
compare_dirs() {
  local original_dir="$1"
  local package_dir="$2"

  echo "Confronto tra $original_dir e $package_dir:"

  if [ ! -d "$original_dir" ]; then
    echo "  ❌ Directory originale $original_dir non esiste!"
    return
  fi

  if [ ! -d "$package_dir" ]; then
    echo "  ❌ Directory package $package_dir non esiste!"
    return
  }

  # Conta i file in ciascuna directory
  local original_count=$(find "$original_dir" -type f | wc -l)
  local package_count=$(find "$package_dir" -type f | wc -l)

  echo "  - File in $original_dir: $original_count"
  echo "  - File in $package_dir: $package_count"

  if [ $original_count -eq $package_count ]; then
    echo "  ✅ Le directory hanno lo stesso numero di file"
  else
    echo "  ❌ Le directory hanno un numero diverso di file"
  fi
}

# Confronta le directory
compare_dirs "$PROJECT_ROOT/bridging" "$PROJECT_ROOT/packages/bridging"
compare_dirs "$PROJECT_ROOT/ethereum" "$PROJECT_ROOT/packages/ethereum"
compare_dirs "$PROJECT_ROOT/fabric" "$PROJECT_ROOT/packages/network"
compare_dirs "$PROJECT_ROOT/frontend" "$PROJECT_ROOT/packages/frontend"

echo ""
echo "Cosa vuoi fare?"
echo "1. Continuare con la struttura originale (senza packages/)"
echo "2. Passare alla nuova struttura (in packages/)"
read -p "Scegli un'opzione (1 o 2): " choice

case $choice in
  1)
    echo "Hai scelto di continuare con la struttura originale."
    echo "Per sicurezza, manteniamo entrambe le strutture per ora."
    ;;
  2)
    echo "Hai scelto di passare alla nuova struttura."
    echo "Prima di rimuovere le cartelle originali, assicurati che tutto funzioni con la nuova struttura."
    echo "Puoi testare la nuova struttura con: cd packages/bridging && npm start"
    ;;
  *)
    echo "Scelta non valida. Non verrà apportata alcuna modifica."
    ;;
esac
EOF

chmod +x scripts/check-sync.sh