# Netlify Env Example

Ejemplo listo para copiar y revisar antes de cargar variables en Netlify.

Usa esto como referencia para `Site configuration -> Environment variables`.

```env
NODE_ENV=production

# Base de datos
# Si Netlify DB / Neon ya provisiono la base, normalmente Netlify inyecta NETLIFY_DATABASE_URL.
# Si no, puedes usar DATABASE_URL manualmente.
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/rey30?schema=public

# Cifrado del servidor
REY30_ENCRYPTION_KEY=replace_with_stable_secret
# APP_ENCRYPTION_KEY=replace_with_same_value_if_you_prefer_the_alias
# NEXTAUTH_SECRET=replace_with_strong_secret

# Auth / registro
REY30_REGISTRATION_MODE=invite_only
REY30_REGISTRATION_INVITE_TOKEN=replace_with_invite_token
REY30_BOOTSTRAP_OWNER_TOKEN=replace_with_owner_bootstrap_token
REY30_ALLOWED_ORIGINS=https://rey303dengine.netlify.app

# Allowlists
REY30_REMOTE_FETCH_ALLOWLIST_OPENAI=api.openai.com
REY30_REMOTE_FETCH_ALLOWLIST_MESHY=api.meshy.ai
REY30_REMOTE_FETCH_ALLOWLIST_RUNWAY=api.dev.runwayml.com
REY30_REMOTE_FETCH_ALLOWLIST_ASSETS=cdn.your-domain.com

# Rate limit
REY30_UPSTASH_REDIS_REST_URL=https://your-upstash-instance.upstash.io
REY30_UPSTASH_REDIS_REST_TOKEN=replace_with_upstash_token
# REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true

# Shared token / collaborators
OPENAI_API_KEY=replace_with_openai_key
MESHY_API_KEY=replace_with_meshy_key
INVITE_PROFILE_OPENAI_API_KEY=replace_with_openai_key_for_shared_profile
REY30_SHARED_ACCESS_TOKEN=replace_with_shared_access_token
REY30_SHARED_ACCESS_EMAIL=shared-access@rey30.local
REY30_SHARED_ACCESS_NAME=REY30 Shared Access
REY30_SHARED_ACCESS_ROLE=OWNER

# Netlify Blobs
REY30_SCRIPT_STORAGE_BACKEND=netlify-blobs
REY30_SCRIPT_BLOB_STORE=rey30-scripts
REY30_GALLERY_STORAGE_BACKEND=netlify-blobs
REY30_GALLERY_BLOB_STORE=rey30-gallery
REY30_MODULAR_CHARACTER_STORAGE_BACKEND=netlify-blobs
REY30_MODULAR_CHARACTER_BLOB_STORE=rey30-modular-characters

# Ops / smoke
REY30_OPS_TOKEN=replace_with_ops_token
SMOKE_USER_EMAIL=replace_with_smoke_email
SMOKE_USER_PASSWORD=replace_with_smoke_password
```

Notas:

- No cambies `REY30_ENCRYPTION_KEY` / `APP_ENCRYPTION_KEY` a la ligera.
- `INVITE_PROFILE_OPENAI_API_KEY` es la key que puedes rotar con `npx tsx scripts/rotate-invite-openai-key.ts`.
- Si usas un solo nodo solo para prueba, puedes activar `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true`.
- Para revision rapida tambien tienes [NETLIFY_MINI_CHECKLIST.md](/C:/Users/rey30/REY30_3dengine/docs/NETLIFY_MINI_CHECKLIST.md).
