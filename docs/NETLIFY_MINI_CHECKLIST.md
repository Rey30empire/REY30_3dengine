# Netlify Mini Checklist

Copy these values into `Site configuration -> Environment variables` for `rey303dengine`.

## 1. Required production base

Use one encryption key name and keep it stable:

```env
REY30_ENCRYPTION_KEY=replace_with_your_stable_secret
REY30_REGISTRATION_MODE=invite_only
REY30_REGISTRATION_INVITE_TOKEN=replace_with_invite_token
REY30_BOOTSTRAP_OWNER_TOKEN=replace_with_owner_bootstrap_token
REY30_ALLOWED_ORIGINS=https://rey303dengine.netlify.app
REY30_REMOTE_FETCH_ALLOWLIST_OPENAI=api.openai.com
REY30_REMOTE_FETCH_ALLOWLIST_MESHY=api.meshy.ai
REY30_REMOTE_FETCH_ALLOWLIST_RUNWAY=api.dev.runwayml.com
REY30_REMOTE_FETCH_ALLOWLIST_ASSETS=cdn.your-domain.com
```

If you already standardize on a different name for the encryption secret, this alias is also accepted:

```env
APP_ENCRYPTION_KEY=replace_with_the_same_secret_value
```

## 2. Shared token + provider access

```env
OPENAI_API_KEY=replace_with_your_openai_key
MESHY_API_KEY=replace_with_your_meshy_key
REY30_SHARED_ACCESS_TOKEN=replace_with_shared_access_token
REY30_SHARED_ACCESS_EMAIL=shared-access@rey30.local
REY30_SHARED_ACCESS_NAME=REY30 Shared Access
REY30_SHARED_ACCESS_ROLE=VIEWER
```

Optional bootstrap/fallback for the shared invite OpenAI profile:

```env
INVITE_PROFILE_OPENAI_API_KEY=replace_with_same_openai_key_or_leave_empty
```

## 3. Rate limiting

Fast single-node test:

```env
REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true
```

Preferred production setup:

```env
REY30_UPSTASH_REDIS_REST_URL=https://your-upstash-instance.upstash.io
REY30_UPSTASH_REDIS_REST_TOKEN=replace_with_upstash_token
```

## 4. Optional smoke / ops

## 4b. Netlify Blobs stores

```env
REY30_SCRIPT_STORAGE_BACKEND=netlify-blobs
REY30_SCRIPT_BLOB_STORE=rey30-scripts
REY30_GALLERY_STORAGE_BACKEND=netlify-blobs
REY30_GALLERY_BLOB_STORE=rey30-gallery
REY30_MODULAR_CHARACTER_STORAGE_BACKEND=netlify-blobs
REY30_MODULAR_CHARACTER_BLOB_STORE=rey30-modular-characters
```

## 5. Optional smoke / ops

```env
REY30_OPS_TOKEN=replace_with_ops_token
SMOKE_USER_EMAIL=replace_with_smoke_email
SMOKE_USER_PASSWORD=replace_with_smoke_password
```

## 6. After pasting vars

1. Trigger a new deploy.
2. Open `/api/health/live` and confirm `200`.
3. Open `/api/health/ready` and confirm `200`.
4. In the app, go to `Usuario / Config APIs`.
5. Choose `Token de acceso`.
6. Paste `REY30_SHARED_ACCESS_TOKEN`.

## 7. Rotate only the shared OpenAI key

Local:

```powershell
$env:INVITE_PROFILE_OPENAI_API_KEY="sk-proj-tu-clave-nueva"
npx tsx scripts/rotate-invite-openai-key.ts
```

Do not rotate `REY30_ENCRYPTION_KEY` / `APP_ENCRYPTION_KEY` lightly. That key protects all saved provider credentials.
