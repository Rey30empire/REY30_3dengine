from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .schemas import CharacterJobCreateRequest
from .storage import OUTPUT_DIR, ensure_storage, read_job, write_job


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cube(cx: float, cy: float, cz: float, sx: float, sy: float, sz: float) -> tuple[list[dict[str, float]], list[list[int]]]:
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    verts = [
        {"x": cx - hx, "y": cy - hy, "z": cz - hz},
        {"x": cx + hx, "y": cy - hy, "z": cz - hz},
        {"x": cx + hx, "y": cy + hy, "z": cz - hz},
        {"x": cx - hx, "y": cy + hy, "z": cz - hz},
        {"x": cx - hx, "y": cy - hy, "z": cz + hz},
        {"x": cx + hx, "y": cy - hy, "z": cz + hz},
        {"x": cx + hx, "y": cy + hy, "z": cz + hz},
        {"x": cx - hx, "y": cy + hy, "z": cz + hz},
    ]
    faces = [
        [0, 1, 2], [0, 2, 3],
        [4, 6, 5], [4, 7, 6],
        [4, 5, 1], [4, 1, 0],
        [3, 2, 6], [3, 6, 7],
        [1, 5, 6], [1, 6, 2],
        [4, 0, 3], [4, 3, 7],
    ]
    return verts, faces


def _merge(parts: list[tuple[list[dict[str, float]], list[list[int]]]]) -> tuple[list[dict[str, float]], list[list[int]]]:
    vertices: list[dict[str, float]] = []
    faces: list[list[int]] = []
    for verts, fcs in parts:
        offset = len(vertices)
        vertices.extend(verts)
        faces.extend([[a + offset, b + offset, c + offset] for a, b, c in fcs])
    return vertices, faces


def _build_package(req: CharacterJobCreateRequest) -> dict[str, Any]:
    parts: list[tuple[list[dict[str, float]], list[list[int]]]] = []
    parts.append(_cube(0.0, 0.85, 0.0, 0.55, 0.80, 0.32))   # torso
    parts.append(_cube(0.0, 1.35, 0.0, 0.32, 0.32, 0.28))   # head
    parts.append(_cube(-0.15, 0.35, 0.0, 0.16, 0.70, 0.18)) # leg L
    parts.append(_cube(0.15, 0.35, 0.0, 0.16, 0.70, 0.18))  # leg R
    parts.append(_cube(-0.38, 0.95, 0.0, 0.14, 0.55, 0.16)) # arm L
    parts.append(_cube(0.38, 0.95, 0.0, 0.14, 0.55, 0.16))  # arm R
    vertices, faces = _merge(parts)

    rig = {
        "bones": [
            {"name": "Hips", "parent": None, "position": {"x": 0.0, "y": 0.60, "z": 0.0}},
            {"name": "Spine", "parent": "Hips", "position": {"x": 0.0, "y": 0.95, "z": 0.0}},
            {"name": "Chest", "parent": "Spine", "position": {"x": 0.0, "y": 1.12, "z": 0.0}},
            {"name": "Neck", "parent": "Chest", "position": {"x": 0.0, "y": 1.30, "z": 0.0}},
            {"name": "Head", "parent": "Neck", "position": {"x": 0.0, "y": 1.42, "z": 0.0}},
            {"name": "Arm.L", "parent": "Chest", "position": {"x": -0.35, "y": 1.00, "z": 0.0}},
            {"name": "Arm.R", "parent": "Chest", "position": {"x": 0.35, "y": 1.00, "z": 0.0}},
            {"name": "Leg.L", "parent": "Hips", "position": {"x": -0.12, "y": 0.40, "z": 0.0}},
            {"name": "Leg.R", "parent": "Hips", "position": {"x": 0.12, "y": 0.40, "z": 0.0}},
        ],
        "notes": "Humanoid rig base (Profile A).",
    }

    animations = []
    if req.includeAnimations:
        animations = [
            {"name": "Idle", "duration": 2.0, "loop": True},
            {"name": "Walk", "duration": 1.2, "loop": True},
            {"name": "Run", "duration": 0.8, "loop": True},
        ]

    blendshapes = []
    if req.includeBlendshapes:
        blendshapes = [
            {"name": "Smile", "weight": 0.0},
            {"name": "Blink_L", "weight": 0.0},
            {"name": "Blink_R", "weight": 0.0},
        ]

    quality = {
        "vertices": len(vertices),
        "triangles": len(faces),
        "rigBones": len(rig["bones"]),
        "animations": len(animations),
        "blendshapes": len(blendshapes),
        "profile": "A",
    }

    return {
        "mesh": {
            "vertices": vertices,
            "faces": faces,
            "metadata": {
                "prompt": req.prompt,
                "style": req.style,
                "targetEngine": req.targetEngine,
            },
        },
        "rig": rig,
        "animations": animations,
        "blendshapes": blendshapes,
        "quality": quality,
        "metadata": {
            "generatedAt": utc_now_iso(),
            "profile": "A",
            "notes": "Procedural + rig lightweight backend (no heavy AI).",
        },
    }


def _is_cancel_requested(job_id: str) -> bool:
    payload = read_job(job_id)
    return bool(payload and payload.get("cancelRequested") is True)


def _write_canceled(job_id: str) -> None:
    write_job(job_id, {
        "jobId": job_id,
        "status": "canceled",
        "progress": 100,
        "stage": "canceled",
        "updatedAt": utc_now_iso(),
    })


def run_profile_a_job(job_id: str, req: CharacterJobCreateRequest) -> None:
    ensure_storage()
    try:
        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        write_job(job_id, {
            "jobId": job_id,
            "status": "running",
            "progress": 10,
            "stage": "parse_prompt",
            "updatedAt": utc_now_iso(),
        })

        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        write_job(job_id, {
            "jobId": job_id,
            "status": "running",
            "progress": 40,
            "stage": "build_mesh",
            "updatedAt": utc_now_iso(),
        })

        payload = _build_package(req)

        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        write_job(job_id, {
            "jobId": job_id,
            "status": "running",
            "progress": 80,
            "stage": "rig_and_package",
            "updatedAt": utc_now_iso(),
        })

        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        out_dir = OUTPUT_DIR / f"character_{job_id}"
        out_dir.mkdir(parents=True, exist_ok=True)
        package_path = out_dir / "package.json"
        package_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

        write_job(job_id, {
            "jobId": job_id,
            "status": "completed",
            "progress": 100,
            "stage": "done",
            "resultPath": str(package_path),
            "quality": payload.get("quality"),
            "updatedAt": utc_now_iso(),
        })
    except Exception as exc:
        write_job(job_id, {
            "jobId": job_id,
            "status": "failed",
            "progress": 100,
            "stage": "failed",
            "error": str(exc),
            "updatedAt": utc_now_iso(),
        })
