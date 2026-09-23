// Run from any directory: node scripts/audit-dependencies.cjs
// Audit every committed npm project, including development dependencies.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projects = [
  'ethereum', 'bridging', 'fabric/application',
  'fabric/network/fabric/application', 'fabric/chaincode/supplychain', 'frontend',
];
let failed = false;
for (const project of projects) {
  console.log(`\nAuditing ${project}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--package-lock-only'], {
      cwd: path.resolve(__dirname, '..', project), stdio: 'inherit',
    });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
