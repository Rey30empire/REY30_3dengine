# Shared Access Token

This app can run in a shared-access mode for collaborators who should not create an account or manage their own API keys.

## What it does

- A collaborator pastes one shared token in the app.
- The app creates a normal session cookie behind the scenes.
- OpenAI and Meshy credentials come from server env vars.
- Collaborators can also call shared-token-enabled API routes directly with `Authorization: Bearer <token>`.

## Required env vars

```env
OPENAI_API_KEY=sk-...
MESHY_API_KEY=msy_...
REY30_SHARED_ACCESS_TOKEN=replace_with_shared_access_token
REY30_SHARED_ACCESS_EMAIL=shared-access@rey30.local
REY30_SHARED_ACCESS_NAME=REY30 Shared Access
REY30_SHARED_ACCESS_ROLE=VIEWER
```

Shared-token sessions are always capped to collaborator/`VIEWER` permissions. Higher values are ignored.

## Invite profile OpenAI rotation

The shared/invite profile now prefers a credential stored in the database for OpenAI.

Bootstrap or fallback env:

```env
INVITE_PROFILE_OPENAI_API_KEY=sk-...
```

Rotate it without changing the bootstrap owner flow:

```powershell
$env:INVITE_PROFILE_OPENAI_API_KEY="sk-proj-tu-clave-nueva"
npx tsx scripts/rotate-invite-openai-key.ts
```

Important:

- Do not rotate `REY30_ENCRYPTION_KEY` / `APP_ENCRYPTION_KEY` / `NEXTAUTH_SECRET` lightly.
- That encryption key protects stored provider credentials.
- Rotating it without a migration will break decryption of saved secrets.

## UI flow

1. Open the app.
2. Go to `Usuario / Config APIs`.
3. Choose `Token de acceso`.
4. Paste the shared token.
5. The app creates a collaborator session and exposes OpenAI + Meshy using the server-managed credentials.

## Direct API usage

```bash
curl https://your-domain.com/api/auth/session \
  -H "Authorization: Bearer YOUR_SHARED_TOKEN"
```

```bash
curl https://your-domain.com/api/openai?action=chat \
  -H "Authorization: Bearer YOUR_SHARED_TOKEN"
```

```bash
curl https://your-domain.com/api/meshy \
  -H "Authorization: Bearer YOUR_SHARED_TOKEN"
```

## Notes

- Anyone with the shared token can consume your OpenAI and Meshy quota.
- The shared token does not unlock `EDITOR` or `OWNER` routes.
- Treat the token like a secret.
- Rotate it by changing `REY30_SHARED_ACCESS_TOKEN` and redeploying.
- Rotate the shared OpenAI provider key with `INVITE_PROFILE_OPENAI_API_KEY` + `scripts/rotate-invite-openai-key.ts`.
