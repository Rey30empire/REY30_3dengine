from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException

from .pipeline import run_profile_a_job, utc_now_iso
from .schemas import (
    CharacterJobCreateRequest,
    CharacterJobCreateResponse,
    CharacterJobResultResponse,
    CharacterJobStatusResponse,
)
from .storage import ensure_storage, read_job, write_job


app = FastAPI(
    title="REY30 Character Backend (Profile A)",
    version="0.1.0",
    description="Lightweight procedural character backend: no heavy AI model required.",
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_storage()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "profile": "A",
        "mode": "procedural_rig",
    }


@app.post("/v1/character/jobs", response_model=CharacterJobCreateResponse)
def create_character_job(
    body: CharacterJobCreateRequest, background_tasks: BackgroundTasks
) -> CharacterJobCreateResponse:
    job_id = uuid4().hex
    write_job(
        job_id,
        {
            "jobId": job_id,
            "status": "queued",
            "progress": 0,
            "stage": "queued",
            "createdAt": utc_now_iso(),
            "updatedAt": utc_now_iso(),
        },
    )
    background_tasks.add_task(run_profile_a_job, job_id, body)
    return CharacterJobCreateResponse(success=True, jobId=job_id, status="queued")


@app.get("/v1/character/jobs/{job_id}", response_model=CharacterJobStatusResponse)
def get_character_job(job_id: str) -> CharacterJobStatusResponse:
    payload = read_job(job_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return CharacterJobStatusResponse(
        success=True,
        jobId=job_id,
        status=payload.get("status", "failed"),
        progress=int(payload.get("progress", 0)),
        stage=str(payload.get("stage", "unknown")),
        error=payload.get("error"),
        resultPath=payload.get("resultPath"),
        quality=payload.get("quality"),
    )


@app.delete("/v1/character/jobs/{job_id}", response_model=CharacterJobStatusResponse)
def cancel_character_job(job_id: str) -> CharacterJobStatusResponse:
    payload = read_job(job_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Job not found")

    status = str(payload.get("status", "failed"))
    if status in {"completed", "failed", "canceled"}:
        return CharacterJobStatusResponse(
            success=True,
            jobId=job_id,
            status=status,  # type: ignore[arg-type]
            progress=int(payload.get("progress", 100)),
            stage=str(payload.get("stage", status)),
            error=payload.get("error"),
            resultPath=payload.get("resultPath"),
            quality=payload.get("quality"),
        )

    next_payload = dict(payload)
    next_payload["cancelRequested"] = True
    next_payload["status"] = "canceled"
    next_payload["progress"] = 100
    next_payload["stage"] = "canceled"
    next_payload["updatedAt"] = utc_now_iso()
    write_job(job_id, next_payload)

    return CharacterJobStatusResponse(
        success=True,
        jobId=job_id,
        status="canceled",
        progress=100,
        stage="canceled",
        error=None,
        resultPath=None,
        quality=payload.get("quality"),
    )


@app.get(
    "/v1/character/jobs/{job_id}/result", response_model=CharacterJobResultResponse
)
def get_character_result(job_id: str) -> CharacterJobResultResponse:
    payload = read_job(job_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Job not found")

    status = str(payload.get("status", "failed"))
    if status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Job is not completed yet (status={status})",
        )

    result_path_raw = payload.get("resultPath")
    if not isinstance(result_path_raw, str) or not result_path_raw:
        raise HTTPException(status_code=500, detail="Job completed without result path")

    result_path = Path(result_path_raw)
    if not result_path.exists():
        raise HTTPException(status_code=500, detail="Result file not found on disk")

    parsed = json.loads(result_path.read_text(encoding="utf-8"))
    return CharacterJobResultResponse(
        success=True,
        jobId=job_id,
        packagePath=str(result_path),
        payload=parsed,
    )
