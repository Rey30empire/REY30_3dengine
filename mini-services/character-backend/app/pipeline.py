from __future__ import annotations

import hashlib
import json
import re
import struct
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .schemas import CharacterJobCreateRequest
from .storage import OUTPUT_DIR, ensure_storage, read_job, write_job


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack("!I", len(data))
        + kind
        + data
        + struct.pack("!I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def _rgb(color: tuple[float, float, float] | tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(round(component)))) for component in color)


def _mix_colors(
    left: tuple[int, int, int], right: tuple[int, int, int], ratio: float
) -> tuple[int, int, int]:
    t = _clamp(ratio, 0.0, 1.0)
    return _rgb(
        (
            left[0] + (right[0] - left[0]) * t,
            left[1] + (right[1] - left[1]) * t,
            left[2] + (right[2] - left[2]) * t,
        )
    )


def _scale_color(color: tuple[int, int, int], scale: float) -> tuple[int, int, int]:
    return _rgb((color[0] * scale, color[1] * scale, color[2] * scale))


def _hex_color(color: tuple[int, int, int]) -> str:
    r, g, b = _rgb(color)
    return f"#{r:02x}{g:02x}{b:02x}"


def _hash_noise(seed: int, x: int, y: int) -> float:
    value = (x * 374761393 + y * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    value ^= value >> 13
    value = (value * 1274126177) & 0xFFFFFFFF
    value ^= value >> 16
    return (value & 0xFFFF) / 65535.0


def _write_rgb_png(
    path: Path,
    pixel_fn,
    size: int = 128,
) -> None:
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(_rgb(pixel_fn(x, y, size)))
        rows.append(bytes(row))
    raw = b"".join(rows)
    ihdr = struct.pack("!IIBBBBB", size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, level=9)
    payload = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat)
        + _png_chunk(b"IEND", b"")
    )
    path.write_bytes(payload)


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _contains(tokens: set[str], *candidates: str) -> bool:
    return any(candidate in tokens for candidate in candidates)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(value, maximum))


def _cube(
    cx: float, cy: float, cz: float, sx: float, sy: float, sz: float
) -> tuple[list[dict[str, float]], list[list[int]]]:
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
        [0, 1, 2],
        [0, 2, 3],
        [4, 6, 5],
        [4, 7, 6],
        [4, 5, 1],
        [4, 1, 0],
        [3, 2, 6],
        [3, 6, 7],
        [1, 5, 6],
        [1, 6, 2],
        [4, 0, 3],
        [4, 3, 7],
    ]
    return verts, faces


def _merge(
    parts: list[tuple[list[dict[str, float]], list[list[int]]]]
) -> tuple[list[dict[str, float]], list[list[int]]]:
    vertices: list[dict[str, float]] = []
    faces: list[list[int]] = []
    for verts, fcs in parts:
        offset = len(vertices)
        vertices.extend(verts)
        faces.extend([[a + offset, b + offset, c + offset] for a, b, c in fcs])
    return vertices, faces


def _planar_uvs(vertices: list[dict[str, float]]) -> list[dict[str, float]]:
    if not vertices:
        return []

    min_x = min(vertex["x"] for vertex in vertices)
    max_x = max(vertex["x"] for vertex in vertices)
    min_z = min(vertex["z"] for vertex in vertices)
    max_z = max(vertex["z"] for vertex in vertices)
    span_x = max(max_x - min_x, 1e-5)
    span_z = max(max_z - min_z, 1e-5)

    return [
        {
            "u": round((vertex["x"] - min_x) / span_x, 6),
            "v": round((vertex["z"] - min_z) / span_z, 6),
        }
        for vertex in vertices
    ]


def _prompt_seed(prompt: str) -> float:
    digest = hashlib.sha1(prompt.encode("utf-8")).digest()
    return int.from_bytes(digest[:2], "big") / 65535.0


def _profile_seed_int(profile: dict[str, Any]) -> int:
    digest = hashlib.sha1(
        f"{profile['archetype']}:{profile['label']}:{profile['variation']}".encode(
            "utf-8"
        )
    ).digest()
    return int.from_bytes(digest[:4], "big")


def _derive_profile(req: CharacterJobCreateRequest) -> dict[str, Any]:
    prompt_tokens = _tokens(req.prompt)
    style_tokens = _tokens(req.style)
    seed = _prompt_seed(req.prompt)

    profile = {
        "archetype": "warrior",
        "label": "guardian",
        "torso_width": 0.56,
        "torso_height": 0.82,
        "torso_depth": 0.34,
        "head_size": 0.31,
        "arm_width": 0.15,
        "leg_width": 0.17,
        "has_cape": False,
        "has_hood": False,
        "has_horns": False,
        "has_shoulder_plates": True,
        "has_backpack": False,
        "weapon": "blade",
        "palette": {
            "albedo": (120, 126, 145),
            "secondary": (184, 152, 94),
            "emissive": (48, 52, 64),
        },
    }

    if _contains(prompt_tokens, "robot", "mech", "mecha", "android", "cyber"):
        profile.update(
            {
                "archetype": "sentinel",
                "label": "sentinel",
                "torso_width": 0.62,
                "torso_depth": 0.38,
                "head_size": 0.28,
                "arm_width": 0.17,
                "has_shoulder_plates": True,
                "has_backpack": True,
                "weapon": "rifle",
                "palette": {
                    "albedo": (92, 106, 128),
                    "secondary": (34, 42, 58),
                    "emissive": (84, 220, 255),
                },
            }
        )
    elif _contains(prompt_tokens, "mage", "wizard", "sorcerer", "caster"):
        profile.update(
            {
                "archetype": "mystic",
                "label": "mystic",
                "torso_width": 0.50,
                "torso_depth": 0.28,
                "head_size": 0.33,
                "arm_width": 0.13,
                "has_cape": True,
                "weapon": "staff",
                "palette": {
                    "albedo": (86, 82, 128),
                    "secondary": (198, 174, 92),
                    "emissive": (168, 98, 255),
                },
            }
        )
    elif _contains(prompt_tokens, "rogue", "assassin", "ninja", "thief"):
        profile.update(
            {
                "archetype": "shadow",
                "label": "shadow",
                "torso_width": 0.48,
                "torso_depth": 0.28,
                "head_size": 0.30,
                "arm_width": 0.12,
                "leg_width": 0.15,
                "has_cape": True,
                "has_hood": True,
                "has_shoulder_plates": False,
                "weapon": "blade",
                "palette": {
                    "albedo": (78, 82, 92),
                    "secondary": (48, 52, 64),
                    "emissive": (44, 148, 196),
                },
            }
        )
    elif _contains(prompt_tokens, "orc", "beast", "monster", "demon", "brute"):
        profile.update(
            {
                "archetype": "brute",
                "label": "brute",
                "torso_width": 0.68,
                "torso_height": 0.90,
                "torso_depth": 0.42,
                "head_size": 0.34,
                "arm_width": 0.19,
                "leg_width": 0.20,
                "has_horns": True,
                "has_shoulder_plates": False,
                "weapon": "hammer",
                "palette": {
                    "albedo": (112, 138, 86),
                    "secondary": (88, 70, 52),
                    "emissive": (150, 80, 42),
                },
            }
        )
    elif _contains(prompt_tokens, "ranger", "archer", "hunter", "sniper"):
        profile.update(
            {
                "archetype": "ranger",
                "label": "ranger",
                "torso_width": 0.52,
                "torso_depth": 0.30,
                "head_size": 0.30,
                "arm_width": 0.13,
                "has_backpack": True,
                "has_shoulder_plates": False,
                "weapon": "rifle",
                "palette": {
                    "albedo": (98, 110, 86),
                    "secondary": (132, 108, 62),
                    "emissive": (64, 84, 52),
                },
            }
        )

    if _contains(style_tokens, "stylized", "toon", "anime", "cartoon"):
        profile["head_size"] = round(float(profile["head_size"]) + 0.05, 3)
        profile["torso_depth"] = round(float(profile["torso_depth"]) * 0.92, 3)
        albedo = profile["palette"]["albedo"]
        profile["palette"]["albedo"] = tuple(
            min(255, component + 24) for component in albedo
        )

    if _contains(style_tokens, "realista", "realistic", "grounded"):
        profile["torso_depth"] = round(float(profile["torso_depth"]) + 0.02, 3)

    if req.targetEngine == "unity":
        profile["torso_height"] = round(float(profile["torso_height"]) * 0.98, 3)
    elif req.targetEngine == "unreal":
        profile["torso_height"] = round(float(profile["torso_height"]) * 1.03, 3)

    if len(req.references) >= 3:
        profile["has_backpack"] = True

    sway = (seed - 0.5) * 0.08
    profile["torso_width"] = round(_clamp(float(profile["torso_width"]) + sway, 0.44, 0.78), 3)
    profile["head_size"] = round(_clamp(float(profile["head_size"]) + sway * 0.5, 0.26, 0.40), 3)
    profile["arm_width"] = round(_clamp(float(profile["arm_width"]) + sway * 0.25, 0.11, 0.20), 3)
    profile["leg_width"] = round(_clamp(float(profile["leg_width"]) + sway * 0.25, 0.14, 0.22), 3)
    profile["variation"] = round(seed, 4)
    profile["referencesCount"] = len(req.references)
    return profile


def _build_parts(profile: dict[str, Any]) -> list[tuple[list[dict[str, float]], list[list[int]]]]:
    torso_width = float(profile["torso_width"])
    torso_height = float(profile["torso_height"])
    torso_depth = float(profile["torso_depth"])
    head_size = float(profile["head_size"])
    arm_width = float(profile["arm_width"])
    leg_width = float(profile["leg_width"])

    torso_center_y = 0.82 + (torso_height - 0.82) * 0.45
    head_center_y = torso_center_y + torso_height * 0.65
    arm_center_y = torso_center_y + torso_height * 0.12
    leg_center_y = 0.35

    parts: list[tuple[list[dict[str, float]], list[list[int]]]] = [
        _cube(0.0, torso_center_y, 0.0, torso_width, torso_height, torso_depth),
        _cube(0.0, head_center_y, 0.0, head_size, head_size * 1.02, head_size * 0.9),
        _cube(-0.16, leg_center_y, 0.0, leg_width, 0.72, 0.18),
        _cube(0.16, leg_center_y, 0.0, leg_width, 0.72, 0.18),
        _cube(-(torso_width * 0.68), arm_center_y, 0.0, arm_width, 0.58, 0.16),
        _cube(torso_width * 0.68, arm_center_y, 0.0, arm_width, 0.58, 0.16),
        _cube(-0.16, 0.02, 0.06, leg_width + 0.03, 0.14, 0.28),
        _cube(0.16, 0.02, 0.06, leg_width + 0.03, 0.14, 0.28),
    ]

    if profile["has_shoulder_plates"]:
        parts.extend(
            [
                _cube(-(torso_width * 0.58), torso_center_y + torso_height * 0.32, 0.0, 0.20, 0.14, 0.22),
                _cube(torso_width * 0.58, torso_center_y + torso_height * 0.32, 0.0, 0.20, 0.14, 0.22),
            ]
        )

    if profile["has_cape"]:
        parts.append(_cube(0.0, torso_center_y + torso_height * 0.08, -0.16, torso_width * 0.92, 0.88, 0.05))

    if profile["has_hood"]:
        parts.append(_cube(0.0, head_center_y + 0.03, -0.02, head_size * 0.94, head_size * 0.78, head_size * 0.94))

    if profile["has_horns"]:
        parts.extend(
            [
                _cube(-0.08, head_center_y + head_size * 0.48, -0.02, 0.05, 0.16, 0.05),
                _cube(0.08, head_center_y + head_size * 0.48, -0.02, 0.05, 0.16, 0.05),
            ]
        )

    if profile["has_backpack"]:
        parts.append(_cube(0.0, torso_center_y + 0.02, -0.20, torso_width * 0.45, torso_height * 0.36, 0.10))

    weapon = str(profile["weapon"])
    if weapon == "blade":
        parts.append(_cube(torso_width * 0.95, 0.66, 0.06, 0.06, 0.60, 0.05))
    elif weapon == "staff":
        parts.extend(
            [
                _cube(torso_width * 0.95, 0.78, 0.04, 0.05, 0.92, 0.05),
                _cube(torso_width * 0.95, 1.28, 0.04, 0.14, 0.14, 0.14),
            ]
        )
    elif weapon == "rifle":
        parts.extend(
            [
                _cube(0.30, torso_center_y + 0.04, 0.10, 0.52, 0.08, 0.08),
                _cube(0.52, torso_center_y + 0.07, 0.10, 0.16, 0.12, 0.08),
            ]
        )
    elif weapon == "hammer":
        parts.extend(
            [
                _cube(torso_width * 0.92, 0.74, 0.04, 0.06, 0.86, 0.06),
                _cube(torso_width * 0.92, 1.18, 0.04, 0.22, 0.18, 0.16),
            ]
        )

    return parts


def _build_rig(profile: dict[str, Any]) -> dict[str, Any]:
    torso_height = float(profile["torso_height"])
    shoulder_width = float(profile["torso_width"]) * 0.54
    bones = [
        {"name": "Hips", "parent": None, "position": {"x": 0.0, "y": 0.60, "z": 0.0}},
        {"name": "Spine", "parent": "Hips", "position": {"x": 0.0, "y": 0.94, "z": 0.0}},
        {"name": "Chest", "parent": "Spine", "position": {"x": 0.0, "y": 1.12 + (torso_height - 0.82) * 0.2, "z": 0.0}},
        {"name": "Neck", "parent": "Chest", "position": {"x": 0.0, "y": 1.30 + (torso_height - 0.82) * 0.15, "z": 0.0}},
        {"name": "Head", "parent": "Neck", "position": {"x": 0.0, "y": 1.44 + (torso_height - 0.82) * 0.15, "z": 0.0}},
        {"name": "Shoulder.L", "parent": "Chest", "position": {"x": -shoulder_width, "y": 1.18, "z": 0.0}},
        {"name": "Arm.L", "parent": "Shoulder.L", "position": {"x": -(shoulder_width + 0.13), "y": 1.00, "z": 0.0}},
        {"name": "Forearm.L", "parent": "Arm.L", "position": {"x": -(shoulder_width + 0.19), "y": 0.84, "z": 0.0}},
        {"name": "Hand.L", "parent": "Forearm.L", "position": {"x": -(shoulder_width + 0.23), "y": 0.68, "z": 0.02}},
        {"name": "Shoulder.R", "parent": "Chest", "position": {"x": shoulder_width, "y": 1.18, "z": 0.0}},
        {"name": "Arm.R", "parent": "Shoulder.R", "position": {"x": shoulder_width + 0.13, "y": 1.00, "z": 0.0}},
        {"name": "Forearm.R", "parent": "Arm.R", "position": {"x": shoulder_width + 0.19, "y": 0.84, "z": 0.0}},
        {"name": "Hand.R", "parent": "Forearm.R", "position": {"x": shoulder_width + 0.23, "y": 0.68, "z": 0.02}},
        {"name": "Leg.L", "parent": "Hips", "position": {"x": -0.12, "y": 0.52, "z": 0.0}},
        {"name": "Shin.L", "parent": "Leg.L", "position": {"x": -0.12, "y": 0.24, "z": 0.0}},
        {"name": "Foot.L", "parent": "Shin.L", "position": {"x": -0.12, "y": 0.04, "z": 0.05}},
        {"name": "Leg.R", "parent": "Hips", "position": {"x": 0.12, "y": 0.52, "z": 0.0}},
        {"name": "Shin.R", "parent": "Leg.R", "position": {"x": 0.12, "y": 0.24, "z": 0.0}},
        {"name": "Foot.R", "parent": "Shin.R", "position": {"x": 0.12, "y": 0.04, "z": 0.05}},
    ]

    if profile["has_cape"]:
        bones.extend(
            [
                {"name": "Cape.Root", "parent": "Chest", "position": {"x": 0.0, "y": 1.08, "z": -0.10}},
                {"name": "Cape.Tip", "parent": "Cape.Root", "position": {"x": 0.0, "y": 0.70, "z": -0.18}},
            ]
        )

    if str(profile["weapon"]) != "none":
        bones.append(
            {"name": "Weapon.Socket.R", "parent": "Hand.R", "position": {"x": 0.0, "y": -0.04, "z": 0.08}}
        )

    if profile["has_backpack"]:
        bones.append(
            {"name": "Back.Socket", "parent": "Chest", "position": {"x": 0.0, "y": 1.02, "z": -0.12}}
        )

    return {
        "bones": bones,
        "notes": "Humanoid rig listo para integración.",
    }


def _build_animations(req: CharacterJobCreateRequest, profile: dict[str, Any]) -> list[dict[str, Any]]:
    if not req.includeAnimations:
        return []

    clips = [
        {"name": "Idle", "duration": 2.0, "loop": True},
        {"name": "Walk", "duration": 1.2, "loop": True},
        {"name": "Run", "duration": 0.8, "loop": True},
    ]

    archetype = str(profile["archetype"])
    if archetype in {"warrior", "brute"}:
        clips.append({"name": "Attack", "duration": 1.0, "loop": False})
    elif archetype == "mystic":
        clips.append({"name": "Cast", "duration": 1.3, "loop": False})
    elif archetype in {"sentinel", "ranger"}:
        clips.append({"name": "Aim", "duration": 0.9, "loop": False})
    else:
        clips.append({"name": "Dash", "duration": 0.7, "loop": False})

    return clips


def _build_blendshapes(req: CharacterJobCreateRequest, profile: dict[str, Any]) -> list[dict[str, Any]]:
    if not req.includeBlendshapes:
        return []

    blendshapes = [
        {"name": "Smile", "weight": 0.0},
        {"name": "Blink_L", "weight": 0.0},
        {"name": "Blink_R", "weight": 0.0},
        {"name": "JawOpen", "weight": 0.0},
    ]

    if str(profile["archetype"]) == "sentinel":
        blendshapes.append({"name": "VisorPulse", "weight": 0.0})
    else:
        blendshapes.append({"name": "BrowUp", "weight": 0.0})

    return blendshapes


def _texture_height(profile: dict[str, Any], x: int, y: int, size: int, seed: int) -> float:
    u = x / max(1, size - 1)
    v = y / max(1, size - 1)
    noise = _hash_noise(seed, x, y)
    archetype = str(profile["archetype"])

    value = 0.18 + noise * 0.24 + abs(v - 0.5) * 0.08

    if archetype in {"sentinel", "ranger"}:
        panel_u = 1.0 if abs(((u * 6.0) % 1.0) - 0.5) < 0.08 else 0.0
        panel_v = 1.0 if abs(((v * 5.0) % 1.0) - 0.5) < 0.08 else 0.0
        value += (panel_u + panel_v) * 0.24
    elif archetype in {"mystic", "shadow"}:
        weave = ((x * 3 + y * 2 + seed) % 11) / 11.0
        value += weave * 0.20
    elif archetype == "brute":
        value += (_hash_noise(seed + 17, x // 2, y // 2) - 0.5) * 0.22
    else:
        straps = 1.0 if abs(((u * 4.5 + v * 0.6) % 1.0) - 0.5) < 0.06 else 0.0
        value += straps * 0.18

    return _clamp(value, 0.0, 1.0)


def _build_texture_descriptors(profile: dict[str, Any]) -> list[dict[str, str]]:
    emissive_resolution = "2K" if str(profile["archetype"]) in {"sentinel", "mystic"} else "1K"
    return [
        {"type": "albedo", "path": "textures/albedo.png", "resolution": "2K"},
        {"type": "normal", "path": "textures/normal.png", "resolution": "2K"},
        {"type": "roughness", "path": "textures/roughness.png", "resolution": "2K"},
        {"type": "metallic", "path": "textures/metallic.png", "resolution": "2K"},
        {"type": "ao", "path": "textures/ao.png", "resolution": "2K"},
        {"type": "emissive", "path": "textures/emissive.png", "resolution": emissive_resolution},
    ]


def _build_material_descriptors(
    profile: dict[str, Any], textures: list[dict[str, str]]
) -> list[dict[str, Any]]:
    texture_slots = {texture["type"]: texture["path"] for texture in textures}
    palette = profile["palette"]
    archetype = str(profile["archetype"])
    label = str(profile["label"]).title()

    base_material = {
        "id": "body_primary",
        "label": f"{label} Body",
        "domain": "body",
        "shader": "pbr_metal_rough",
        "doubleSided": False,
        "properties": {
            "albedoColor": _hex_color(palette["albedo"]),
            "accentColor": _hex_color(palette["secondary"]),
            "emissiveColor": _hex_color(palette["emissive"]),
            "roughness": 0.64 if archetype in {"mystic", "shadow"} else 0.48,
            "metallic": 0.82 if archetype == "sentinel" else 0.24,
            "aoStrength": 0.72,
            "emissiveIntensity": 1.65 if archetype in {"sentinel", "mystic"} else 0.45,
        },
        "textureSlots": {
            "albedo": texture_slots["albedo"],
            "normal": texture_slots["normal"],
            "roughness": texture_slots["roughness"],
            "metallic": texture_slots["metallic"],
            "ao": texture_slots["ao"],
            "emissive": texture_slots["emissive"],
        },
    }

    accent_material = {
        "id": "body_trim",
        "label": f"{label} Trim",
        "domain": "trim",
        "shader": "pbr_metal_rough",
        "doubleSided": False,
        "properties": {
            "albedoColor": _hex_color(palette["secondary"]),
            "roughness": 0.38 if archetype in {"sentinel", "guardian", "ranger"} else 0.58,
            "metallic": 0.9 if archetype in {"sentinel", "guardian"} else 0.18,
            "emissiveIntensity": 0.25,
        },
        "textureSlots": {
            "albedo": texture_slots["albedo"],
            "roughness": texture_slots["roughness"],
            "metallic": texture_slots["metallic"],
            "ao": texture_slots["ao"],
        },
    }

    materials = [base_material, accent_material]

    if profile["has_cape"] or profile["has_hood"]:
        materials.append(
            {
                "id": "cloth_overlay",
                "label": f"{label} Cloth",
                "domain": "cloth",
                "shader": "pbr_metal_rough",
                "doubleSided": True,
                "properties": {
                    "albedoColor": _hex_color(_mix_colors(palette["albedo"], palette["secondary"], 0.35)),
                    "roughness": 0.82,
                    "metallic": 0.04,
                },
                "textureSlots": {
                    "albedo": texture_slots["albedo"],
                    "normal": texture_slots["normal"],
                    "roughness": texture_slots["roughness"],
                    "ao": texture_slots["ao"],
                },
            }
        )

    return materials


def _write_character_textures(textures_dir: Path, profile: dict[str, Any], size: int = 128) -> None:
    palette = profile["palette"]
    archetype = str(profile["archetype"])
    seed = _profile_seed_int(profile)
    albedo_base = _rgb(palette["albedo"])
    secondary = _rgb(palette["secondary"])
    emissive = _rgb(palette["emissive"])
    dark_base = _scale_color(albedo_base, 0.62)
    highlight = _mix_colors(albedo_base, (255, 255, 255), 0.18)

    def height_fn(px: int, py: int) -> float:
        return _texture_height(profile, px, py, size, seed)

    def albedo_pixel(x: int, y: int, image_size: int) -> tuple[int, int, int]:
        u = x / max(1, image_size - 1)
        v = y / max(1, image_size - 1)
        noise = _hash_noise(seed + 5, x, y)
        base = _mix_colors(dark_base, highlight, v * 0.58 + noise * 0.18)
        seam_mask = 1.0 if abs(((u * 4.0 + v * 0.55) % 1.0) - 0.5) < 0.05 else 0.0
        panel_mask = 1.0 if abs(((u * 6.0) % 1.0) - 0.5) < 0.09 else 0.0
        cloth_mask = 1.0 if archetype in {"mystic", "shadow"} and abs(((v * 7.0) % 1.0) - 0.5) < 0.08 else 0.0
        accent_strength = 0.42 * seam_mask + 0.28 * panel_mask + 0.22 * cloth_mask
        color = _mix_colors(base, secondary, accent_strength)
        if archetype in {"sentinel", "mystic"}:
            glow_hint = 0.14 if abs(((u * 8.0 + v * 2.5) % 1.0) - 0.5) < 0.04 else 0.0
            color = _mix_colors(color, emissive, glow_hint)
        return color

    def normal_pixel(x: int, y: int, image_size: int) -> tuple[int, int, int]:
        left = height_fn(max(0, x - 1), y)
        right = height_fn(min(image_size - 1, x + 1), y)
        up = height_fn(x, max(0, y - 1))
        down = height_fn(x, min(image_size - 1, y + 1))
        dx = (right - left) * 1.8
        dy = (down - up) * 1.8
        nx = _clamp(0.5 - dx, 0.0, 1.0)
        ny = _clamp(0.5 - dy, 0.0, 1.0)
        nz = _clamp(1.0 - min(0.6, abs(dx) + abs(dy)) * 0.55, 0.62, 1.0)
        return _rgb((nx * 255.0, ny * 255.0, nz * 255.0))

    def roughness_pixel(x: int, y: int, image_size: int) -> tuple[int, int, int]:
        h = height_fn(x, y)
        detail = _hash_noise(seed + 33, x // 2, y // 2)
        base = 190 if archetype in {"mystic", "shadow"} else 150
        if archetype == "sentinel":
            base = 96
        if archetype == "brute":
            base = 176
        rough = _clamp(base + h * 42 + detail * 20, 40, 235)
        return _rgb((rough, rough, rough))

    def metallic_pixel(x: int, y: int, image_size: int) -> tuple[int, int, int]:
        u = x / max(1, image_size - 1)
        panel = 1.0 if abs(((u * 6.5) % 1.0) - 0.5) < 0.07 else 0.0
        base = 215 if archetype == "sentinel" else 72 if archetype in {"guardian", "ranger"} else 18
        metal = _clamp(base + panel * 28 + _hash_noise(seed + 57, x, y) * 12, 0, 255)
        return _rgb((metal, metal, metal))

    def ao_pixel(x: int, y: int, image_size: int) -> tuple[int, int, int]:
        u = x / max(1, image_size - 1)
        v = y / max(1, image_size - 1)
        edge = abs(u - 0.5) + abs(v - 0.5)
        value = _clamp(232 - edge * 48 - _hash_noise(seed + 91, x // 2, y // 2) * 24, 80, 245)
        return _rgb((value, value, value))

    def emissive_pixel(x: int, y: int, image_size: int) -> tuple[int, int, int]:
        u = x / max(1, image_size - 1)
        v = y / max(1, image_size - 1)
        mask = 0.0
        if archetype == "sentinel":
            mask = 1.0 if abs(v - 0.32) < 0.04 or abs(((u * 7.0) % 1.0) - 0.5) < 0.03 else 0.0
        elif archetype == "mystic":
            ring = abs((((u - 0.5) ** 2 + (v - 0.42) ** 2) ** 0.5) - 0.18)
            mask = 1.0 if ring < 0.03 or abs(((u * 5.0 + v * 2.0) % 1.0) - 0.5) < 0.025 else 0.0
        elif archetype == "shadow":
            mask = 0.65 if abs(((u * 9.0 + v * 3.0) % 1.0) - 0.5) < 0.02 else 0.0
        elif archetype == "brute":
            mask = 0.45 if abs(((u * 4.0) % 1.0) - 0.5) < 0.04 and v > 0.55 else 0.0
        else:
            mask = 0.22 if abs(((u * 6.0 + v) % 1.0) - 0.5) < 0.025 else 0.0
        intensity = _clamp(mask + _hash_noise(seed + 121, x, y) * 0.08, 0.0, 1.0)
        return _mix_colors((4, 4, 6), emissive, intensity)

    _write_rgb_png(textures_dir / "albedo.png", albedo_pixel, size)
    _write_rgb_png(textures_dir / "normal.png", normal_pixel, size)
    _write_rgb_png(textures_dir / "roughness.png", roughness_pixel, size)
    _write_rgb_png(textures_dir / "metallic.png", metallic_pixel, size)
    _write_rgb_png(textures_dir / "ao.png", ao_pixel, size)
    _write_rgb_png(textures_dir / "emissive.png", emissive_pixel, size)


def _validation_issue(issue_type: str, severity: str, detail: str) -> dict[str, str]:
    return {"type": issue_type, "severity": severity, "detail": detail}


def _check_polycount(mesh: dict[str, Any]) -> list[dict[str, str]]:
    triangles = len(mesh["faces"])
    if triangles > 2400:
        return [_validation_issue("polycount", "warn", f"Polycount elevado: {triangles} triángulos.")]
    return [_validation_issue("polycount", "info", f"Polycount OK ({triangles} triángulos).")]


def _check_uvs(mesh: dict[str, Any]) -> list[dict[str, str]]:
    uvs = mesh.get("uvs", [])
    vertices = mesh.get("vertices", [])
    if not uvs:
        return [_validation_issue("uv", "error", "No se generaron UVs.")]
    if len(uvs) != len(vertices):
        return [
            _validation_issue(
                "uv", "warn", f"Cantidad de UVs ({len(uvs)}) distinta a vertices ({len(vertices)})."
            )
        ]
    for uv in uvs:
        if uv["u"] < 0 or uv["u"] > 1 or uv["v"] < 0 or uv["v"] > 1:
            return [_validation_issue("uv", "warn", "Se detectaron UVs fuera del rango [0,1].")]
    return [_validation_issue("uv", "info", "UVs consistentes.")]


def _check_geometry(mesh: dict[str, Any]) -> list[dict[str, str]]:
    vertices = mesh["vertices"]
    degenerate = 0
    for face in mesh["faces"]:
        a, b, c = face
        va = vertices[a]
        vb = vertices[b]
        vc = vertices[c]
        ab = (
            vb["x"] - va["x"],
            vb["y"] - va["y"],
            vb["z"] - va["z"],
        )
        ac = (
            vc["x"] - va["x"],
            vc["y"] - va["y"],
            vc["z"] - va["z"],
        )
        cross = (
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        )
        area = ((cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2) ** 0.5) / 2
        if area < 1e-8:
            degenerate += 1

    if degenerate:
        severity = "error" if degenerate > 3 else "warn"
        return [_validation_issue("geometry", severity, f"Caras degeneradas detectadas: {degenerate}.")]
    return [_validation_issue("geometry", "info", "Sin caras degeneradas.")]


def _check_rig(rig: dict[str, Any]) -> list[dict[str, str]]:
    required = {"Hips", "Spine", "Chest", "Neck", "Head", "Arm.L", "Arm.R", "Leg.L", "Leg.R"}
    names = {bone["name"] for bone in rig["bones"]}
    missing = sorted(required - names)
    if missing:
        return [_validation_issue("rig", "error", "Faltan huesos base: " + ", ".join(missing) + ".")]
    return [_validation_issue("rig", "info", "Rig base completo.")]


def _check_animations(req: CharacterJobCreateRequest, animations: list[dict[str, Any]]) -> list[dict[str, str]]:
    if not req.includeAnimations:
        return [_validation_issue("animations", "info", "Animaciones omitidas por solicitud.")]
    if len(animations) < 3:
        return [_validation_issue("animations", "warn", "Cobertura de animaciones reducida.")]
    return [_validation_issue("animations", "info", f"Cobertura de animaciones OK ({len(animations)} clips).")]


def _check_textures(textures: list[dict[str, Any]]) -> list[dict[str, str]]:
    missing = [texture["type"] for texture in textures if not texture.get("path")]
    if missing:
        return [_validation_issue("textures", "error", "Texturas faltantes: " + ", ".join(missing) + ".")]
    return [_validation_issue("textures", "info", f"Texturas listas ({len(textures)} mapas).")]


def _check_materials(materials: list[dict[str, Any]]) -> list[dict[str, str]]:
    if not materials:
        return [_validation_issue("materials", "error", "No se generaron materiales.")]

    incomplete = []
    for material in materials:
        if not material.get("id") or not material.get("textureSlots"):
            incomplete.append(str(material.get("label") or "material"))

    if incomplete:
        return [
            _validation_issue(
                "materials",
                "warn",
                "Materiales incompletos: " + ", ".join(incomplete) + ".",
            )
        ]

    return [_validation_issue("materials", "info", f"Materiales listos ({len(materials)} slots).")]


def _build_validation_report(
    req: CharacterJobCreateRequest,
    package: dict[str, Any],
) -> dict[str, Any]:
    issues = []
    issues.extend(_check_polycount(package["mesh"]))
    issues.extend(_check_uvs(package["mesh"]))
    issues.extend(_check_geometry(package["mesh"]))
    issues.extend(_check_rig(package["rig"]))
    issues.extend(_check_animations(req, package["animations"]))
    issues.extend(_check_textures(package["textures"]))
    issues.extend(_check_materials(package["materials"]))

    severity_rank = {"info": 0, "warn": 1, "error": 2}
    worst = "info"
    warning_count = 0
    error_count = 0

    for issue in issues:
        severity = issue["severity"]
        if severity_rank[severity] > severity_rank[worst]:
            worst = severity
        if severity == "warn":
            warning_count += 1
        elif severity == "error":
            error_count += 1

    score = max(0.2, min(1.0, 1.0 - (warning_count * 0.05) - (error_count * 0.18)))
    return {
        "summary": f"Paquete validado. Severidad máxima: {worst}.",
        "issues": issues,
        "worstSeverity": worst,
        "warningCount": warning_count,
        "errorCount": error_count,
        "score": round(score, 3),
    }


def _build_quality_summary(package: dict[str, Any], validation: dict[str, Any]) -> dict[str, Any]:
    max_issues = max(1, len(validation["issues"]))
    coverage = 1.0 - (validation["warningCount"] + validation["errorCount"]) / (max_issues * 2)
    return {
        "vertices": len(package["mesh"]["vertices"]),
        "triangles": len(package["mesh"]["faces"]),
        "rigBones": len(package["rig"]["bones"]),
        "animations": len(package["animations"]),
        "blendshapes": len(package["blendshapes"]),
        "materials": len(package["materials"]),
        "textureMaps": len(package["textures"]),
        "score": validation["score"],
        "coverage": round(max(0.0, min(1.0, coverage)), 3),
        "worstSeverity": validation["worstSeverity"],
    }


def _build_package(req: CharacterJobCreateRequest) -> dict[str, Any]:
    profile = _derive_profile(req)
    vertices, faces = _merge(_build_parts(profile))
    mesh = {
        "vertices": vertices,
        "faces": faces,
        "uvs": _planar_uvs(vertices),
        "metadata": {
            "prompt": req.prompt,
            "style": req.style,
            "targetEngine": req.targetEngine,
            "note": f"Character base generated for {profile['label']} silhouette.",
        },
    }
    rig = _build_rig(profile)
    animations = _build_animations(req, profile)
    blendshapes = _build_blendshapes(req, profile)
    textures = _build_texture_descriptors(profile)
    materials = _build_material_descriptors(profile, textures)

    package = {
        "mesh": mesh,
        "rig": rig,
        "animations": animations,
        "blendshapes": blendshapes,
        "textures": textures,
        "materials": materials,
        "profile": profile,
        "metadata": {
            "prompt": req.prompt,
            "style": req.style,
            "targetEngine": req.targetEngine,
            "references": req.references[:6],
            "generatedAt": utc_now_iso(),
            "version": "0.3",
            "silhouette": profile["label"],
        },
    }

    validation = _build_validation_report(req, package)
    quality = _build_quality_summary(package, validation)
    package["quality"] = quality
    package["validation"] = validation
    return package


def build_base_mesh_payload(req: CharacterJobCreateRequest) -> dict[str, Any]:
    package = _build_package(req)
    silhouette = str(package["metadata"].get("silhouette", "guardian"))
    focus_areas = ["silueta", "hombros", "manos", "zona facial"]

    if silhouette in {"brute", "sentinel"}:
        focus_areas.append("volumen de torso")
    if silhouette in {"mystic", "shadow"}:
        focus_areas.append("caida de tela")
    if len(req.references) >= 2:
        focus_areas.append("coherencia con referencias")

    quality = {
        "vertices": len(package["mesh"]["vertices"]),
        "triangles": len(package["mesh"]["faces"]),
        "score": package["quality"]["score"],
        "coverage": package["quality"]["coverage"],
        "worstSeverity": package["quality"]["worstSeverity"],
        "checks": ["mesh_ready", "uv_ready", "review_ready"],
    }

    review = {
        "summary": f"Base mesh lista para retopo y refinado ({silhouette}).",
        "focusAreas": focus_areas,
        "retopoRecommended": True,
    }

    metadata = {
        "prompt": package["metadata"]["prompt"],
        "style": package["metadata"]["style"],
        "targetEngine": package["metadata"]["targetEngine"],
        "references": package["metadata"]["references"],
        "generatedAt": package["metadata"]["generatedAt"],
        "version": package["metadata"]["version"],
        "silhouette": silhouette,
    }

    return {
        "mesh": package["mesh"],
        "quality": quality,
        "review": review,
        "metadata": metadata,
    }


def _write_bundle(job_id: str, payload: dict[str, Any]) -> tuple[Path, Path]:
    out_dir = OUTPUT_DIR / f"character_{job_id}"
    textures_dir = out_dir / "textures"
    textures_dir.mkdir(parents=True, exist_ok=True)

    _write_character_textures(textures_dir, payload["profile"])

    mesh_path = out_dir / "mesh.json"
    rig_path = out_dir / "rig.json"
    animations_path = out_dir / "animations.json"
    blendshapes_path = out_dir / "blendshapes.json"
    materials_path = out_dir / "materials.json"
    report_path = out_dir / "report.json"
    manifest_path = out_dir / "manifest.json"
    package_path = out_dir / "package.json"

    mesh_path.write_text(json.dumps(payload["mesh"], ensure_ascii=False, indent=2), encoding="utf-8")
    rig_path.write_text(json.dumps(payload["rig"], ensure_ascii=False, indent=2), encoding="utf-8")
    animations_path.write_text(json.dumps(payload["animations"], ensure_ascii=False, indent=2), encoding="utf-8")
    blendshapes_path.write_text(json.dumps(payload["blendshapes"], ensure_ascii=False, indent=2), encoding="utf-8")
    materials_path.write_text(json.dumps(payload["materials"], ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(
        json.dumps(
            {
                "summary": payload["validation"]["summary"],
                "quality": payload["quality"],
                "validation": payload["validation"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    manifest = {
        "jobId": job_id,
        "generatedAt": payload["metadata"]["generatedAt"],
        "prompt": payload["metadata"]["prompt"],
        "style": payload["metadata"]["style"],
        "targetEngine": payload["metadata"]["targetEngine"],
        "silhouette": payload["metadata"]["silhouette"],
        "files": {
            "package": "package.json",
            "mesh": "mesh.json",
            "rig": "rig.json",
            "animations": "animations.json",
            "blendshapes": "blendshapes.json",
            "materials": "materials.json",
            "report": "report.json",
            "textures": [texture["path"] for texture in payload["textures"]],
        },
        "quality": payload["quality"],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    package_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return package_path, manifest_path


def _is_cancel_requested(job_id: str) -> bool:
    payload = read_job(job_id)
    return bool(payload and payload.get("cancelRequested") is True)


def _write_canceled(job_id: str) -> None:
    write_job(
        job_id,
        {
            "jobId": job_id,
            "status": "canceled",
            "progress": 100,
            "stage": "canceled",
            "updatedAt": utc_now_iso(),
        },
    )


def run_profile_a_job(job_id: str, req: CharacterJobCreateRequest) -> None:
    ensure_storage()
    try:
        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        write_job(
            job_id,
            {
                "jobId": job_id,
                "status": "running",
                "progress": 10,
                "stage": "parse_prompt",
                "updatedAt": utc_now_iso(),
            },
        )

        payload = _build_package(req)

        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        write_job(
            job_id,
            {
                "jobId": job_id,
                "status": "running",
                "progress": 45,
                "stage": "build_character_package",
                "updatedAt": utc_now_iso(),
                "quality": payload["quality"],
            },
        )

        if _is_cancel_requested(job_id):
            _write_canceled(job_id)
            return

        package_path, manifest_path = _write_bundle(job_id, payload)

        write_job(
            job_id,
            {
                "jobId": job_id,
                "status": "completed",
                "progress": 100,
                "stage": "done",
                "resultPath": str(package_path),
                "manifestPath": str(manifest_path),
                "quality": payload["quality"],
                "updatedAt": utc_now_iso(),
            },
        )
    except Exception as exc:
        write_job(
            job_id,
            {
                "jobId": job_id,
                "status": "failed",
                "progress": 100,
                "stage": "failed",
                "error": str(exc),
                "updatedAt": utc_now_iso(),
            },
        )
