from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.pipeline import _build_package, build_base_mesh_payload, run_profile_a_job  # noqa: E402
from app.schemas import CharacterJobCreateRequest  # noqa: E402
from app import pipeline, storage  # noqa: E402


class CharacterPipelineTests(unittest.TestCase):
    def test_base_mesh_payload_exposes_review_and_quality(self) -> None:
        payload = build_base_mesh_payload(
            CharacterJobCreateRequest(
                prompt="orc brute with hammer horns",
                style="stylized",
                targetEngine="unreal",
                includeAnimations=False,
                includeBlendshapes=False,
                references=["front", "side"],
            )
        )

        self.assertEqual(payload["metadata"]["silhouette"], "brute")
        self.assertGreater(len(payload["mesh"]["vertices"]), 0)
        self.assertEqual(payload["quality"]["checks"], ["mesh_ready", "uv_ready", "review_ready"])
        self.assertTrue(payload["review"]["retopoRecommended"])
        self.assertIn("volumen de torso", payload["review"]["focusAreas"])

    def test_prompt_changes_archetype_outputs(self) -> None:
        warrior = _build_package(
            CharacterJobCreateRequest(
                prompt="warrior with heavy armor and sword",
                style="realista",
                targetEngine="generic",
                includeAnimations=True,
                includeBlendshapes=True,
                references=[],
            )
        )
        mystic = _build_package(
            CharacterJobCreateRequest(
                prompt="mage with staff and cape",
                style="stylized",
                targetEngine="generic",
                includeAnimations=True,
                includeBlendshapes=True,
                references=["ref-a", "ref-b"],
            )
        )

        self.assertEqual(warrior["metadata"]["silhouette"], "guardian")
        self.assertEqual(mystic["metadata"]["silhouette"], "mystic")
        self.assertNotEqual(len(warrior["mesh"]["vertices"]), len(mystic["mesh"]["vertices"]))
        self.assertTrue(any(animation["name"] == "Cast" for animation in mystic["animations"]))

    def test_job_writes_bundle_files_and_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            jobs_dir = data_dir / "jobs"
            output_dir = data_dir / "output"

            with (
                patch.object(storage, "DATA_DIR", data_dir),
                patch.object(storage, "JOBS_DIR", jobs_dir),
                patch.object(storage, "OUTPUT_DIR", output_dir),
                patch.object(pipeline, "OUTPUT_DIR", output_dir),
            ):
                run_profile_a_job(
                    "job_pipeline_test",
                    CharacterJobCreateRequest(
                        prompt="robot guardian with rifle and backpack",
                        style="stylized",
                        targetEngine="unity",
                        includeAnimations=True,
                        includeBlendshapes=True,
                        references=["one", "two", "three"],
                    ),
                )

                job_payload = storage.read_job("job_pipeline_test")
                self.assertIsNotNone(job_payload)
                self.assertEqual(job_payload["status"], "completed")

                bundle_dir = output_dir / "character_job_pipeline_test"
                package_path = bundle_dir / "package.json"
                manifest_path = bundle_dir / "manifest.json"
                materials_path = bundle_dir / "materials.json"
                report_path = bundle_dir / "report.json"

                self.assertTrue(package_path.exists())
                self.assertTrue(manifest_path.exists())
                self.assertTrue(materials_path.exists())
                self.assertTrue(report_path.exists())
                self.assertTrue((bundle_dir / "textures" / "albedo.png").exists())
                self.assertTrue((bundle_dir / "textures" / "normal.png").exists())
                self.assertTrue((bundle_dir / "textures" / "roughness.png").exists())
                self.assertTrue((bundle_dir / "textures" / "metallic.png").exists())
                self.assertTrue((bundle_dir / "textures" / "ao.png").exists())
                self.assertTrue((bundle_dir / "textures" / "emissive.png").exists())

                package_payload = json.loads(package_path.read_text(encoding="utf-8"))
                materials_payload = json.loads(materials_path.read_text(encoding="utf-8"))
                report_payload = json.loads(report_path.read_text(encoding="utf-8"))

                self.assertEqual(package_payload["metadata"]["silhouette"], "sentinel")
                self.assertGreaterEqual(len(package_payload["materials"]), 2)
                self.assertEqual(package_payload["quality"]["textureMaps"], 6)
                self.assertEqual(package_payload["quality"]["materials"], len(package_payload["materials"]))
                self.assertEqual(materials_payload[0]["textureSlots"]["albedo"], "textures/albedo.png")
                self.assertEqual(report_payload["validation"]["worstSeverity"], "info")
                self.assertIn("score", package_payload["quality"])
                self.assertNotEqual(
                    (bundle_dir / "textures" / "albedo.png").read_bytes(),
                    (bundle_dir / "textures" / "roughness.png").read_bytes(),
                )


if __name__ == "__main__":
    unittest.main()
