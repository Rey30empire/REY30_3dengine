from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "completed", "failed", "canceled"]


class CharacterJobCreateRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=1000)
    style: str = Field(default="realista", max_length=64)
    targetEngine: Literal["unity", "unreal", "generic"] = "generic"
    includeAnimations: bool = True
    includeBlendshapes: bool = True
    references: list[str] = Field(default_factory=list, max_length=8)


class CharacterJobCreateResponse(BaseModel):
    success: bool = True
    jobId: str
    status: JobStatus


class CharacterJobStatusResponse(BaseModel):
    success: bool = True
    jobId: str
    status: JobStatus
    progress: int = 0
    stage: str = "queued"
    error: str | None = None
    resultPath: str | None = None
    quality: dict[str, Any] | None = None


class CharacterJobResultResponse(BaseModel):
    success: bool = True
    jobId: str
    packagePath: str
    payload: dict[str, Any]
