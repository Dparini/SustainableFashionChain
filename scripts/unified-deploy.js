// File: scripts/unified-deploy.js
const { execSync } = require('child_process');
const path = require('path');

// Percorsi principali
const PROJECT_ROOT = path.resolve(__dirname, '..');
const COMPONENTS = {
  ethereum: path.join(PROJECT_ROOT, 'packages/ethereum'),
  bridging: path.join(PROJECT_ROOT, 'packages/bridging'),
  fabric: path.join(PROJECT_ROOT, 'packages/network'),
  frontend: path.join(PROJECT_ROOT, 'packages/frontend')
};

// Funzione per eseguire comandi
function execute(command, cwd) {
  console.log(`\n>> Esecuzione di: ${command} in ${cwd}`);
  try {
    execSync(command, { cwd, stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Errore nell'esecuzione di ${command}:`, error.message);
    return false;
  }
}

// Avvia i servizi di database
async function setupDatabases() {
  console.log('=== AVVIO DATABASE ===');
  execute('bash mongo-setup.sh', path.join(PROJECT_ROOT, 'scripts'));
  execute('bash redis-setup.sh', path.join(PROJECT_ROOT, 'scripts'));
  execute('bash rabbitmq-setup.sh', path.join(PROJECT_ROOT, 'scripts'));
}

// Avvia la rete blockchain
async function setupBlockchain() {
  console.log('=== AVVIO BLOCKCHAIN ===');
  execute('npm install', COMPONENTS.fabric);
  execute('bash network.sh up', path.join(COMPONENTS.fabric, 'scripts'));
}

// Avvia i contratti Ethereum
async function setupEthereum() {
  console.log('=== DEPLOY CONTRATTI ETHEREUM ===');
  execute('npm install', COMPONENTS.ethereum);
  execute('node scripts/deploy-contracts.js', COMPONENTS.ethereum);
}

// Avvia il bridging
async function setupBridging() {
  console.log('=== AVVIO BRIDGING ===');
  execute('npm install', COMPONENTS.bridging);
  execute('node bridge.js', COMPONENTS.bridging);
}

// Avvia il frontend
async function setupFrontend() {
  console.log('=== AVVIO FRONTEND ===');
  execute('npm install', COMPONENTS.frontend);
  execute('npm run build', COMPONENTS.frontend);
  execute('bash setup.sh', COMPONENTS.frontend);
}

// Funzione principale
async function main() {
  try {
    console.log('Avvio del progetto SustainableFashionChain...');

    await setupDatabases();
    await setupBlockchain();
    await setupEthereum();
    await setupBridging();
    await setupFrontend();

    console.log('\n✅ Progetto avviato con successo!');
    console.log('Puoi accedere all\'applicazione all\'indirizzo: http://localhost:3000');
  } catch (error) {
    console.error('❌ Avvio fallito:', error);
  }
}

// Avvia lo script
main();