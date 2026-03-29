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
  const webhookUrl = args.get('webhook-url') || process.env.ALERT_WEBHOOK_URL || '';
  const severity = args.get('severity') || process.env.ALERT_SEVERITY || 'critical';
  const message = args.get('message') || process.env.ALERT_MESSAGE || 'REY30 monitor detected an incident.';
  const environment = args.get('environment') || process.env.DEPLOY_ENV || 'production';
  const runUrl = args.get('run-url') || process.env.GITHUB_RUN_URL || '';

  if (!webhookUrl) {
    throw new Error('Missing alert webhook URL. Use --webhook-url or ALERT_WEBHOOK_URL.');
  }

  const payload = {
    source: 'rey30-slo-monitor',
    severity,
    message,
    environment,
    runUrl,
    at: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Alert webhook failed with ${response.status}: ${errorBody}`);
  }

  process.stdout.write('Alert webhook triggered successfully.\n');
}

main().catch((error) => {
  process.stderr.write(`trigger-alert-webhook failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});

