// Read public workflow state without credentials or side effects.
const repository = 'Dparini/SustainableFashionChain';
const sha = process.argv[2];
(async () => {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/runs`);
  url.searchParams.set('per_page', '10');
  if (sha) url.searchParams.set('head_sha', sha);
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  const data = await response.json();
  for (const run of data.workflow_runs) {
    console.log(JSON.stringify({ id: run.id, name: run.name, status: run.status,
      conclusion: run.conclusion, sha: run.head_sha, url: run.html_url }));
    if (run.name !== 'Verify RWA boundaries') continue;
    const jobsResponse = await fetch(run.jobs_url);
    if (!jobsResponse.ok) throw new Error(`Jobs HTTP ${jobsResponse.status}`);
    const jobs = await jobsResponse.json();
    for (const job of jobs.jobs) console.log(JSON.stringify({ job: job.name, status: job.status,
      conclusion: job.conclusion, failedSteps: job.steps.filter(s => s.conclusion === 'failure').map(s => s.name) }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
