import { describe, expect, it } from 'vitest';
import {
  InitializeConversionSystem,
  ReconstructionSessionSerializer,
} from '@/engine/systems/conversion-pipeline';

describe('conversion pipeline foundation', () => {
  it('builds and accepts a single sketch conversion as editable mesh', async () => {
    const system = InitializeConversionSystem();
    const session = system.CreateSketchSession({
      name: 'Hero Sketch',
      sketches: [
        {
          label: 'hero front',
          viewLabel: 'front',
          tags: ['character', 'humanoid'],
          strokes: [
            {
              points: [
                { x: 0.2, y: 0.1 },
                { x: 0.7, y: 0.1 },
                { x: 0.7, y: 0.9 },
                { x: 0.2, y: 0.9 },
                { x: 0.2, y: 0.1 },
              ],
            },
          ],
        },
      ],
    });

    const previewSession = system.GeneratePreview(session.id);
    expect(previewSession.preview?.kind).toBe('object');
    expect(previewSession.preview?.object?.mesh.faces.length).toBeGreaterThan(0);

    const accepted = await system.AcceptConversion(session.id);
    expect(accepted.acceptedResult?.kind).toBe('object');
    expect(system.ConvertToEditableMesh(session.id)?.faces.length).toBeGreaterThan(0);
  });

  it('builds a scene preview for environment scans and serializes the session', () => {
    const system = InitializeConversionSystem();
    const session = system.StartSceneScanSession({
      label: 'Room Scan',
      captures: [
        { viewLabel: 'front', tags: ['room', 'interior'], sharpnessEstimate: 0.82 },
        { viewLabel: 'side', tags: ['room', 'interior'], sharpnessEstimate: 0.8 },
        { viewLabel: 'back', tags: ['room', 'interior'], sharpnessEstimate: 0.78 },
        { viewLabel: 'perspective', tags: ['room', 'interior'], sharpnessEstimate: 0.79 },
      ],
    });

    const previewSession = system.GeneratePreview(session.id);
    const scene = previewSession.preview?.scene;
    expect(previewSession.preview?.kind).toBe('scene');
    expect(scene?.nodes.some((node) => node.name === 'Floor')).toBe(true);

    const serialized = ReconstructionSessionSerializer.serialize(system.snapshot(session.id));
    const restored = ReconstructionSessionSerializer.deserialize(serialized);
    expect(restored.mode).toBe('SceneScanTo3D_Environment');
    expect(restored.preview?.kind).toBe('scene');
  });
});
