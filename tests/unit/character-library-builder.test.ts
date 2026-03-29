import { describe, expect, it, vi } from 'vitest';
import {
  CharacterLibraryBuilder,
  type CharacterAssetRecord,
  type CharacterBuilderEngineAdapter,
  type StoredCharacterPreset,
} from '@/engine/character-builder';

function createTestAdapter(records: CharacterAssetRecord[]) {
  const presets: StoredCharacterPreset[] = [];
  const showMessage = vi.fn();
  const reportCharacterError = vi.fn();

  const adapter: CharacterBuilderEngineAdapter = {
    async loadCharacterLibraryRecords() {
      return records;
    },
    async listCharacterPresets() {
      return [...presets];
    },
    async saveCharacterPreset(entry) {
      const next = presets.filter((preset) => preset.id !== entry.id);
      next.push(entry);
      presets.splice(0, presets.length, ...next);
    },
    showMessage,
    reportCharacterError,
  };

  return {
    adapter,
    presets,
    showMessage,
    reportCharacterError,
  };
}

const SAMPLE_LIBRARY: CharacterAssetRecord[] = [
  {
    id: 'body_a',
    name: 'Body A',
    category: 'body',
    modelPath: '/library/mannequin_a.glb',
    thumbnailPath: '/library/mannequin_a.preview.png',
    skeletonId: 'human_base_v1',
    bodyType: 'unisex_medium',
    attachmentSocket: 'root_socket',
    isBaseBody: true,
    materialVariants: [
      { id: 'skin_default', label: 'Default Skin' },
      { id: 'skin_tan', label: 'Tan Skin' },
    ],
    colorVariants: [
      { id: 'eyes_brown', label: 'Brown Eyes' },
      { id: 'eyes_green', label: 'Green Eyes' },
    ],
  },
  {
    id: 'hoodie_a',
    name: 'Hoodie A',
    category: 'outfit',
    modelPath: '/library/hoodie.glb',
    thumbnailPath: '/library/hoodie.preview.png',
    skeletonId: 'human_base_v1',
    bodyType: 'unisex_medium',
    attachmentSocket: 'torso_socket',
    materialVariants: [
      { id: 'hoodie_navy', label: 'Navy' },
      { id: 'hoodie_mint', label: 'Mint' },
    ],
  },
  {
    id: 'boots_a',
    name: 'Boots A',
    category: 'shoes',
    modelPath: '/library/boots.glb',
    thumbnailPath: '/library/boots.preview.png',
    skeletonId: 'human_base_v1',
    bodyType: 'unisex_medium',
    attachmentSocket: 'feet_socket',
  },
  {
    id: 'boots_wrong_body',
    name: 'Boots Wrong Body',
    category: 'shoes',
    modelPath: '/library/boots.glb',
    thumbnailPath: '/library/boots.preview.png',
    skeletonId: 'human_base_v1',
    bodyType: 'female_small',
    attachmentSocket: 'feet_socket',
  },
];

describe('character library builder', () => {
  it('opens with the first available base body equipped', async () => {
    const { adapter } = createTestAdapter(SAMPLE_LIBRARY);
    const builder = new CharacterLibraryBuilder(adapter);

    const snapshot = await builder.openCharacterBuilder();

    expect(snapshot.baseBody?.id).toBe('body_a');
    expect(snapshot.previewModelPaths).toContain('/library/mannequin_a.glb');
    expect(snapshot.categories.some((entry) => entry.category === 'body')).toBe(true);
  });

  it('rejects incompatible body type combinations', async () => {
    const { adapter, reportCharacterError } = createTestAdapter(SAMPLE_LIBRARY);
    const builder = new CharacterLibraryBuilder(adapter);
    await builder.openCharacterBuilder();

    const result = builder.applyPart('boots_wrong_body');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('female_small');
    expect(builder.snapshot().errorReports).toHaveLength(1);
    expect(builder.snapshot().errorReports[0]?.issues[0]?.code).toBe('body_type_mismatch');
    expect(reportCharacterError).toHaveBeenCalledTimes(1);
  });

  it('saves and reloads presets as serialized JSON state', async () => {
    const { adapter, presets } = createTestAdapter(SAMPLE_LIBRARY);
    const builder = new CharacterLibraryBuilder(adapter);
    await builder.openCharacterBuilder();

    expect(builder.applyPart('hoodie_a').ok).toBe(true);
    expect(builder.applyPart('boots_a').ok).toBe(true);

    const saveResult = await builder.savePreset('casual');
    expect(saveResult.ok).toBe(true);
    expect(presets).toHaveLength(1);

    builder.resetCharacter();
    expect(builder.snapshot().equippedParts.outfit).toBeUndefined();

    const loadResult = await builder.loadPreset(presets[0]!.id);
    expect(loadResult.ok).toBe(true);
    expect(builder.snapshot().equippedParts.outfit?.id).toBe('hoodie_a');
    expect(builder.snapshot().equippedParts.shoes?.id).toBe('boots_a');
  });

  it('persists selected material and color variants inside presets', async () => {
    const { adapter, presets } = createTestAdapter(SAMPLE_LIBRARY);
    const builder = new CharacterLibraryBuilder(adapter);
    await builder.openCharacterBuilder();

    expect(builder.applyPart('hoodie_a').ok).toBe(true);
    builder.setMaterialVariant('body', 'skin_tan');
    builder.setColorVariant('body', 'eyes_green');
    builder.setMaterialVariant('outfit', 'hoodie_mint');

    const saveResult = await builder.savePreset('variant_preset');
    expect(saveResult.ok).toBe(true);

    const savedPreset = presets[0]?.preset;
    expect(savedPreset?.materialVariants?.body).toBe('skin_tan');
    expect(savedPreset?.colorVariants?.body).toBe('eyes_green');
    expect(savedPreset?.materialVariants?.outfit).toBe('hoodie_mint');

    builder.resetCharacter();
    const loadResult = await builder.loadPreset(presets[0]!.id);
    expect(loadResult.ok).toBe(true);
    expect(builder.snapshot().materialSelections.body).toBe('skin_tan');
    expect(builder.snapshot().colorSelections.body).toBe('eyes_green');
    expect(builder.snapshot().materialSelections.outfit).toBe('hoodie_mint');
  });

  it('hydrates the builder from an external preset payload', async () => {
    const { adapter } = createTestAdapter(SAMPLE_LIBRARY);
    const builder = new CharacterLibraryBuilder(adapter);
    await builder.openCharacterBuilder();

    const snapshot = builder.hydrateFromPreset({
      baseBodyId: 'body_a',
      parts: {
        outfit: 'hoodie_a',
        shoes: 'boots_a',
      },
      materialVariants: {
        body: 'skin_tan',
        outfit: 'hoodie_navy',
      },
      colorVariants: {
        body: 'eyes_green',
      },
    });

    expect(snapshot.baseBody?.id).toBe('body_a');
    expect(snapshot.equippedParts.outfit?.id).toBe('hoodie_a');
    expect(snapshot.equippedParts.shoes?.id).toBe('boots_a');
    expect(snapshot.materialSelections.body).toBe('skin_tan');
    expect(snapshot.materialSelections.outfit).toBe('hoodie_navy');
    expect(snapshot.colorSelections.body).toBe('eyes_green');
  });
});
