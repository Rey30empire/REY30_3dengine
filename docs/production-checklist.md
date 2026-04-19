# REY30 production checklist

Use this checklist before promoting a release.

## 1. Required environment and secrets

- `NODE_ENV=production`
- `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/rey30?schema=public`
- On Netlify DB / Neon, `NETLIFY_DATABASE_URL` can be used instead and the repo now maps it to `DATABASE_URL` automatically
- `REY30_ENCRYPTION_KEY` or `APP_ENCRYPTION_KEY` or `NEXTAUTH_SECRET`
- `REY30_REGISTRATION_MODE=invite_only`
- `REY30_REGISTRATION_INVITE_TOKEN`
- `REY30_BOOTSTRAP_OWNER_TOKEN`
- `REY30_ALLOWED_ORIGINS`
- `REY30_REMOTE_FETCH_ALLOWLIST_OPENAI`
- `REY30_REMOTE_FETCH_ALLOWLIST_MESHY`
- `REY30_REMOTE_FETCH_ALLOWLIST_RUNWAY`
- `REY30_REMOTE_FETCH_ALLOWLIST_ASSETS`
- Leave `REY30_LOCAL_PROVIDER_ALLOW_REMOTE` unset or `false` unless the deployment is an intentional single-user/local-provider setup
- If you intentionally expose server-local Ollama/vLLM/llama.cpp, pin each allowed host:port with:
  - `REY30_LOCAL_PROVIDER_ALLOWLIST_OLLAMA`
  - `REY30_LOCAL_PROVIDER_ALLOWLIST_VLLM`
  - `REY30_LOCAL_PROVIDER_ALLOWLIST_LLAMACPP`
- Optional on Netlify if you want to force the backend explicitly:
  - `REY30_SCRIPT_STORAGE_BACKEND=netlify-blobs`
  - `REY30_SCRIPT_BLOB_STORE=rey30-scripts`
  - `REY30_GALLERY_STORAGE_BACKEND=netlify-blobs`
  - `REY30_GALLERY_BLOB_STORE=rey30-gallery`

## 2. Required rate-limit backend

- `REY30_UPSTASH_REDIS_REST_URL`
- `REY30_UPSTASH_REDIS_REST_TOKEN`
- Leave `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION` unset or `false`
- Only set `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true` for an intentional single-node deployment

Optional auth tuning:

- `REY30_RATE_LIMIT_AUTH_WINDOW_MS`
- `REY30_RATE_LIMIT_LOGIN_MAX_REQUESTS`
- `REY30_RATE_LIMIT_REGISTER_MAX_REQUESTS`

## 3. Optional ops and smoke credentials

- `REY30_OPS_TOKEN` for protected ops endpoints
- `ROLLBACK_WEBHOOK_URL` for automatic rollback workflow
- `SMOKE_USER_EMAIL` for post-deploy authenticated smoke
- `SMOKE_USER_PASSWORD` for post-deploy authenticated smoke

For `seal:target`, these values must be real explicit env values, not generated defaults from rehearsal:

- HTTPS `PRODUCTION_BASE_URL` or `--base-url`
- Networked `DATABASE_URL` or `NETLIFY_DATABASE_URL`
- `REY30_ENCRYPTION_KEY` or `APP_ENCRYPTION_KEY` or `NEXTAUTH_SECRET`
- `REY30_BOOTSTRAP_OWNER_TOKEN`
- `REY30_REGISTRATION_INVITE_TOKEN` when using `invite_only`
- `REY30_OPS_TOKEN`
- `SMOKE_USER_EMAIL` and `SMOKE_USER_PASSWORD`
- `REY30_UPSTASH_REDIS_REST_URL` and `REY30_UPSTASH_REDIS_REST_TOKEN`
- All storage backends set to durable/shared storage, not `filesystem`

## 4. Build and release gate

Run these before or during promotion:

```bash
pnpm install --frozen-lockfile
pnpm run db:deploy
pnpm run preflight:production
pnpm run security:deps
pnpm run test:prod-critical
pnpm run release:check
pnpm run build
```

Notes:

- CI now validates migrations with `pnpm run db:deploy`
- For Netlify DB + Neon, provision the site database first and then run `pnpm run db:deploy:netlify`
- `pnpm run preflight:production` validates production env posture and can also check health/backup drill when run with `--base-url`
- `pnpm run security:deps` validates the resolved production tree against pinned minimum security versions for `next`, `next-intl` and selected transitive packages
- `pnpm run test:prod-critical` enforces coverage floors on production-critical health/auth/proxy/remote-fetch paths
- `pnpm run release:check` already includes `security:deps`, so CI and final seal inherit the same dependency floor automatically
- `pnpm run start` expects production env vars to already be injected by the deploy platform
- For a local production-like rehearsal, use `pnpm run start:production:local`
- `pnpm run seal:final` now bootstraps a local mock Upstash-compatible rate-limit backend and a local smoke user only for rehearsal; remote production still requires real Upstash plus real smoke credentials
- `pnpm run seal:target` is the stricter target-real seal: it fails fast before the long suite unless the target uses HTTPS, real smoke credentials, real distributed rate limit, no generated defaults, and shared durable storage posture
- Netlify + Neon solves the database layer, and Script Workspace plus Gallery can now persist through Netlify Blobs on Netlify runtimes
- Persistent asset/package/backup storage still needs a separate production strategy
- GitHub promotion path:
  - run `CI Quality Gate` for branch validation
  - deploy on your platform
  - run `Promotion Gate` to chain release seal plus post-deploy smoke/rollback against the live URL
  - if `base_url` is omitted, configure `PRODUCTION_BASE_URL` in GitHub vars or secrets

## 5. Health and smoke expectations

- `/api/health/live` must return `200`
- `/api/health/ready` must return `200` and `status=ready`
- `pnpm run preflight:production -- --base-url https://your-app.example.com` should pass before promotion
- Post-deploy smoke should cover:
  - home page
  - unauthenticated session check
  - provider status endpoints
  - real login
  - authenticated session
  - authenticated `GET /api/user/usage-policy`
  - authenticated `PUT /api/user/usage-policy` with CSRF

## 6. Production safety checks

- Terminal API stays disabled unless explicitly needed:
  - `REY30_ENABLE_TERMINAL_API=false`
  - `REY30_ENABLE_TERMINAL_API_REMOTE=false`
- `REY30_TRUST_PROXY` stays disabled unless the proxy chain is trusted and sanitizes forwarded IP headers
- Local provider loopback should stay disabled on normal multi-user deployments; prefer `REY30_LOCAL_OWNER_MODE=true` for intentional single-user setups and keep `REY30_LOCAL_PROVIDER_ALLOW_REMOTE` unset otherwise
- If `/api/integrations/events` is exposed across multiple instances, configure `REY30_UPSTASH_REDIS_REST_URL` and `REY30_UPSTASH_REDIS_REST_TOKEN` so signed nonces are enforced cluster-wide
- Security audit DB writes are still preferred, but critical events now also have a durable filesystem fallback; keep persistent disk available long enough to export or reconcile those logs after an incident
- Registration remains closed unless there is a deliberate launch plan
- Rotate any repo-supplied local production secrets before a real remote deployment

## 7. Deployment complete when

- `pnpm run release:check` passes
- `pnpm run preflight:production` passes with the target env
- production build passes
- readiness is green
- authenticated smoke passes
- rollback webhook is configured or a manual rollback path is documented
