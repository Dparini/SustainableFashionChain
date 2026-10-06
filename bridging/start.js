require('dotenv').config();
const { createConfiguredBridge } = require('./runtime');
async function main() {
  const bridge = createConfiguredBridge();
  await bridge.initialize();
  bridge.on('streamFailed', error => {
    console.error(error.message);
    bridge.stop().finally(() => { process.exitCode = 1; });
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => bridge.stop().then(() => process.exit(0)).catch(error => {
      console.error(error.message); process.exit(1);
    }));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
