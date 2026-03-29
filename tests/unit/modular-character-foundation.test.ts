import { describe, expect, it } from 'vitest';
import {
  buildAssignmentDraft,
  suggestPartAssignments,
  type ModelAnalysisSummary,
} from '@/engine/modular-character';
import { validateIncomingSourceFiles } from '@/app/api/modular-characters/shared';

function makeAnalysis(): ModelAnalysisSummary {
  return {
    sourceName: 'hero.glb',
    sourceFormat: 'glb',
    sourceFiles: [
      {
        fileName: 'hero.glb',
        mimeType: 'model/gltf-binary',
        size: 1024,
        isPrimary: true,
      },
    ],
    sourcePrimaryFileName: 'hero.glb',
    sourceSize: 1024,
    uploadedAt: new Date().toISOString(),
    meshCount: 3,
    materialCount: 2,
    boneCount: 5,
    animationCount: 1,
    hasRig: true,
    hasAnimations: true,
    materials: [
      { id: 'skin', name: 'skin', textureNames: ['skin_base'] },
      { id: 'cloth', name: 'cloth', textureNames: ['cloth_base'] },
    ],
    meshes: [
      {
        id: 'head_mesh',
        name: 'Hero_Head',
        path: 'root-0/head-0',
        parentPath: 'root-0',
        materialNames: ['skin'],
        textureNames: ['skin_base'],
        vertexCount: 1200,
        triangleCount: 800,
        hasRig: true,
        boneNames: ['Head', 'Neck'],
        boundingBox: {
          min: { x: -0.2, y: 1.4, z: -0.2 },
          max: { x: 0.2, y: 1.8, z: 0.2 },
          size: { x: 0.4, y: 0.4, z: 0.4 },
          center: { x: 0, y: 1.6, z: 0 },
        },
        pivot: { x: 0, y: 1.6, z: 0 },
        visible: true,
      },
      {
        id: 'torso_mesh',
        name: 'Hero_Torso',
        path: 'root-0/torso-0',
        parentPath: 'root-0',
        materialNames: ['cloth'],
        textureNames: ['cloth_base'],
        vertexCount: 2000,
        triangleCount: 1200,
        hasRig: true,
        boneNames: ['Spine', 'Chest'],
        boundingBox: {
          min: { x: -0.35, y: 0.7, z: -0.18 },
          max: { x: 0.35, y: 1.35, z: 0.18 },
          size: { x: 0.7, y: 0.65, z: 0.36 },
          center: { x: 0, y: 1.025, z: 0 },
        },
        pivot: { x: 0, y: 1.025, z: 0 },
        visible: true,
      },
      {
        id: 'arm_l_mesh',
        name: 'UpperArm_L',
        path: 'root-0/arm-left-0',
        parentPath: 'root-0',
        materialNames: ['cloth'],
        textureNames: ['cloth_base'],
        vertexCount: 900,
        triangleCount: 640,
        hasRig: true,
        boneNames: ['LeftArm'],
        boundingBox: {
          min: { x: -0.75, y: 0.8, z: -0.12 },
          max: { x: -0.25, y: 1.25, z: 0.12 },
          size: { x: 0.5, y: 0.45, z: 0.24 },
          center: { x: -0.5, y: 1.025, z: 0 },
        },
        pivot: { x: -0.5, y: 1.025, z: 0 },
        visible: true,
      },
    ],
    skeleton: [
      {
        id: 'hips',
        name: 'Hips',
        path: 'root-0/hips-0',
        parentPath: 'root-0',
        position: { x: 0, y: 0.8, z: 0 },
      },
    ],
    boundingBox: {
      min: { x: -0.75, y: 0.7, z: -0.2 },
      max: { x: 0.35, y: 1.8, z: 0.2 },
      size: { x: 1.1, y: 1.1, z: 0.4 },
      center: { x: -0.2, y: 1.25, z: 0 },
    },
  };
}

describe('modular character foundation', () => {
  it('suggests modular parts from mesh names and spatial heuristics', () => {
    const drafts = suggestPartAssignments(makeAnalysis(), 'unity-ready');
    const partTypes = drafts.map((draft) => draft.partType);

    expect(partTypes).toContain('head');
    expect(partTypes).toContain('torso');
    expect(partTypes).toContain('left_arm');
  });

  it('marks a manual static part as warning when rigged export is requested', () => {
    const analysis = makeAnalysis();
    const staticNode = {
      ...analysis.meshes[0],
      hasRig: false,
      boneNames: [],
    };

    const draft = buildAssignmentDraft({
      partType: 'head',
      analysis: {
        ...analysis,
        hasRig: false,
      },
      nodes: [staticNode],
      confidence: 1,
      mode: 'manual',
      exportProfile: 'rigged-modular',
    });

    expect(draft.compatibility.ok).toBe(true);
    expect(draft.compatibility.issues.some((issue) => issue.code === 'missing_rig')).toBe(true);
  });

  it('validates incoming source bundles with a supported primary file', () => {
    const file = new File(['glb-data'], 'hero.glb', {
      type: 'model/gltf-binary',
    });

    const result = validateIncomingSourceFiles([file]);

    expect(result.ok).toBe(true);
  });
});
