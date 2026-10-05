const fs = require('node:fs');
const path = require('node:path');
const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../.github/repository-metadata.json')));
const apply = process.argv.includes('--apply');
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (apply && !token) {
  console.error('GH_TOKEN or GITHUB_TOKEN with repository metadata permissions is required. Never paste it in chat.');
  process.exit(1);
}
async function api(route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${metadata.repository}${route}`, {
    method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${route || '/repository'}: HTTP ${response.status}`);
  return response.json();
}
(async () => {
  if (apply) {
    await api('', 'PATCH', { description: metadata.description });
    await api('/topics', 'PUT', { names: metadata.topics });
  }
  const repo = await api('');
  const topics = await api('/topics');
  const correct = repo.description === metadata.description &&
    [...topics.names].sort().join(',') === [...metadata.topics].sort().join(',');
  console.log(correct ? 'Repository description and topics verified.' : 'Repository metadata differs from the prepared configuration.');
  if (!correct) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
