const SERVICE_NAME = 'rey30-3dengine';

function normalizeVersion(): string {
  const explicit =
    process.env.REY30_RELEASE_VERSION ||
    process.env.RELEASE_VERSION ||
    process.env.npm_package_version;

  if (explicit && explicit.trim()) return explicit.trim();

  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.RENDER_GIT_COMMIT;

  if (commit && commit.trim()) {
    return `sha-${commit.trim().slice(0, 8)}`;
  }

  return 'dev';
}

export function getReleaseInfo() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    null;

  return {
    service: SERVICE_NAME,
    version: normalizeVersion(),
    commit,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

