import { AssetMetadataDatabase } from './metadataDatabase';
import type {
  CharacterAssetRecord,
  CharacterLibraryFilters,
  CharacterPartCategory,
} from './types';

export class AssetLibrary {
  constructor(private readonly database = new AssetMetadataDatabase()) {}

  replaceAll(records: CharacterAssetRecord[]) {
    this.database.replaceAll(records);
    return this.all();
  }

  all() {
    return this.database.all();
  }

  findById(id: string | null | undefined) {
    return this.database.findById(id);
  }

  categories() {
    return this.database.categories();
  }

  findBaseBodies() {
    return this.database.findBaseBodies();
  }

  partsByCategory(category: CharacterPartCategory, filters?: Partial<CharacterLibraryFilters>) {
    const search = (filters?.searchQuery ?? '').trim().toLowerCase();
    const bodyType = (filters?.bodyType ?? '').trim().toLowerCase();
    const tag = (filters?.tag ?? '').trim().toLowerCase();

    return this.all()
      .filter((record) => record.category === category)
      .filter((record) => record.enabled)
      .filter((record) => {
        if (!search) return true;
        const haystack = [record.name, record.id, record.notes ?? '', ...record.tags]
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      })
      .filter((record) => {
        if (!bodyType) return true;
        return record.bodyType.toLowerCase() === bodyType;
      })
      .filter((record) => {
        if (!tag) return true;
        return record.tags.includes(tag);
      });
  }

  availableTags() {
    return Array.from(
      new Set(
        this.all()
          .flatMap((record) => record.tags)
          .filter((tag) => tag.length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));
  }
}
