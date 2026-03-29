import type {
  CharacterBuilderEngineAdapter,
  CharacterPreset,
  StoredCharacterPreset,
} from './types';

export class PresetManager {
  constructor(private readonly adapter: CharacterBuilderEngineAdapter) {}

  async list() {
    const presets = await this.adapter.listCharacterPresets();
    return [...presets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async save(name: string, preset: CharacterPreset) {
    const existing = await this.list();
    const matched = existing.find((entry) => entry.name.toLowerCase() === name.toLowerCase()) ?? null;
    const now = new Date().toISOString();
    const nextEntry: StoredCharacterPreset = matched
      ? {
          ...matched,
          updatedAt: now,
          preset,
        }
      : {
          id: crypto.randomUUID(),
          name,
          createdAt: now,
          updatedAt: now,
          preset,
        };
    await this.adapter.saveCharacterPreset(nextEntry);
    return nextEntry;
  }

  async delete(presetId: string) {
    if (!this.adapter.deleteCharacterPreset) return false;
    await this.adapter.deleteCharacterPreset(presetId);
    return true;
  }
}
