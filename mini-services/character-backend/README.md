# REY30 Character Backend - Profile A

Lightweight character generation backend for low/medium hardware.

- Target: `2.0 - 3.5 GB` disk footprint
- GPU: works with `8 GB VRAM` because it does not run heavy local LLM/3D diffusion
- Mode: prompt-conditioned package builder + humanoid rig + validation report + procedural PBR texture set + material descriptors

## 1) Install

```powershell
cd C:\Users\rey30\REY30_3dengine\mini-services\character-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-profile-a.txt
```

## 2) Run

```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

Health check:

```powershell
curl http://127.0.0.1:8010/healthz
```

## 3) Connect with Next API

Set env in your app:

```env
REY30_CHARACTER_BACKEND_URL=http://127.0.0.1:8010
REY30_CHARACTER_BACKEND_TIMEOUT_MS=120000
REY30_CHARACTER_BACKEND_POLL_MS=1000
```

When `REY30_CHARACTER_BACKEND_URL` is configured, `POST /api/character/full` uses this backend first.
Local fallback is no longer automatic.
Only set `REY30_CHARACTER_LOCAL_FALLBACK=true` when you explicitly want the in-app lightweight generator as a development fallback.

## 4) Endpoints

- `GET /healthz`
- `POST /v1/character/base-mesh`
- `POST /v1/character/jobs`
- `GET /v1/character/jobs/{jobId}`
- `GET /v1/character/jobs/{jobId}/result`

Each completed job writes a bundle under `mini-services/character-backend/data/output/character_<jobId>/`:

- `package.json`
- `mesh.json`
- `rig.json`
- `animations.json`
- `blendshapes.json`
- `materials.json`
- `report.json`
- `manifest.json`
- `textures/*.png`

The prompt now changes silhouette/accessories for archetypes such as guardian, mystic, shadow, ranger, brute and sentinel.
Texture output now includes `albedo`, `normal`, `roughness`, `metallic`, `ao` and `emissive` maps, plus reusable material slots in `materials.json`.

## 5) Estimated weight (Profile A)

- Python runtime + venv + deps: `0.2 - 0.5 GB`
- Procedural backend data/output/logs: `0.1 - 0.4 GB`
- Base DCC tooling and helpers (optional Blender workflows): `0.8 - 1.8 GB`
- Asset cache/templates/textures: `0.8 - 1.2 GB`
- Total typical: `2.0 - 3.5 GB`

## 6) Future upgrade path (16-32 GB AI)

Keep this backend as the stable fallback and add a second provider:

- Profile B: heavy 3D AI service (separate worker)
- Route policy:
  - try Profile B when available
  - fallback to Profile A on timeout/failure
- Keep API contract stable (`/v1/character/jobs*`) so UI does not change.
