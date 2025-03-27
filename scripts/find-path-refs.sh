# Crea uno script per cercare riferimenti relativi
cat > scripts/find-path-refs.sh << 'EOF'
#!/bin/bash
echo "Cercando riferimenti ai percorsi che potrebbero dover essere aggiornati..."
echo ""

echo "Riferimenti a 'bridging/' o 'ethereum/' o 'fabric/' o 'frontend/':"
grep -r --include="*.js" --include="*.json" --include="*.sh" "bridging/\|ethereum/\|fabric/\|frontend/" packages/

echo ""
echo "Completo. Verifica questi file per possibili aggiornamenti dei percorsi."
EOF

chmod +x scripts/find-path-refs.sh