function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      map.set(key, 'true');
      continue;
    }
    map.set(key, next);
    i += 1;
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const webhookUrl = args.get('webhook-url') || process.env.ROLLBACK_WEBHOOK_URL || '';
  const reason = args.get('reason') || process.env.ROLLBACK_REASON || 'post-deploy smoke failed';
  const releaseVersion =
    args.get('release-version') ||
    process.env.REY30_RELEASE_VERSION ||
    process.env.GITHUB_SHA ||
    'unknown';
  const environment = args.get('environment') || process.env.DEPLOY_ENV || 'production';

  if (!webhookUrl) {
    throw new Error('Missing rollback webhook URL. Use --webhook-url or ROLLBACK_WEBHOOK_URL.');
  }

  const payload = {
    action: 'rollback',
    reason,
    releaseVersion,
    environment,
    triggeredAt: new Date().toISOString(),
    source: 'rey30-postdeploy-smoke',
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Rollback webhook failed with ${response.status}: ${errorBody}`);
  }

  process.stdout.write('Rollback webhook triggered successfully.\n');
}

main().catch((error) => {
  process.stderr.write(`trigger-rollback failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});

