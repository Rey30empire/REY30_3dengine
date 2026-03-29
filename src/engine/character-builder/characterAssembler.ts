import { CHARACTER_PART_CATEGORIES } from './types';
import type {
  CharacterAssemblyState,
  CharacterPartCategory,
  CharacterPartMetadata,
  CharacterPreset,
} from './types';
import type { AssetLibrary } from './assetLibrary';
import type { CompatibilityValidator } from './compatibilityValidator';

function createEmptyAssemblyState(): CharacterAssemblyState {
  return {
    baseBodyId: null,
    equippedParts: {},
    materialOverrides: {},
    colorOverrides: {},
  };
}

export class CharacterAssembler {
  private state: CharacterAssemblyState = createEmptyAssemblyState();

  snapshot() {
    return {
      baseBodyId: this.state.baseBodyId,
      equippedParts: { ...this.state.equippedParts },
      materialOverrides: { ...this.state.materialOverrides },
      colorOverrides: { ...this.state.colorOverrides },
    };
  }

  currentBaseBodyId() {
    return this.state.baseBodyId;
  }

  serializePreset(): CharacterPreset {
    return {
      baseBodyId: this.state.baseBodyId,
      parts: { ...this.state.equippedParts },
      materialVariants: { ...this.state.materialOverrides },
      colorVariants: { ...this.state.colorOverrides },
      colors: { ...this.state.colorOverrides },
    };
  }

  setBaseBody(part: CharacterPartMetadata) {
    this.state.baseBodyId = part.id;
    this.state.equippedParts.body = part.id;
    if (part.materialVariants[0]) {
      this.state.materialOverrides.body = part.materialVariants[0].id;
    } else {
      delete this.state.materialOverrides.body;
    }
    if (part.colorVariants[0]) {
      this.state.colorOverrides.body = part.colorVariants[0].id;
    } else {
      delete this.state.colorOverrides.body;
    }
  }

  applyPart(part: CharacterPartMetadata) {
    if (part.category === 'body') {
      this.setBaseBody(part);
      return;
    }
    this.state.equippedParts[part.category] = part.id;
    if (part.materialVariants[0]) {
      this.state.materialOverrides[part.category] = part.materialVariants[0].id;
    } else {
      delete this.state.materialOverrides[part.category];
    }
    if (part.colorVariants[0]) {
      this.state.colorOverrides[part.category] = part.colorVariants[0].id;
    } else {
      delete this.state.colorOverrides[part.category];
    }
  }

  setMaterialVariant(category: CharacterPartCategory, variantId: string | null) {
    if (!variantId) {
      delete this.state.materialOverrides[category];
      return;
    }
    this.state.materialOverrides[category] = variantId;
  }

  setColorVariant(category: CharacterPartCategory, variantId: string | null) {
    if (!variantId) {
      delete this.state.colorOverrides[category];
      return;
    }
    this.state.colorOverrides[category] = variantId;
  }

  removePart(category: CharacterPartCategory) {
    if (category === 'body') {
      this.state = createEmptyAssemblyState();
      return;
    }
    delete this.state.equippedParts[category];
    delete this.state.materialOverrides[category];
    delete this.state.colorOverrides[category];
  }

  reset(defaultBaseBody: CharacterPartMetadata | null) {
    this.state = createEmptyAssemblyState();
    if (defaultBaseBody) {
      this.setBaseBody(defaultBaseBody);
    }
  }

  randomize(params: {
    library: AssetLibrary;
    validator: CompatibilityValidator;
    rng?: () => number;
  }) {
    const rng = params.rng ?? Math.random;
    let baseBody = params.library.findById(this.state.baseBodyId);
    if (!baseBody) {
      baseBody = params.library.findBaseBodies()[0] ?? null;
      if (baseBody) {
        this.setBaseBody(baseBody);
      }
    }
    if (!baseBody) return;

    CHARACTER_PART_CATEGORIES.filter((category) => category !== 'body').forEach((category) => {
      const compatible = params.library
        .partsByCategory(category)
        .filter((part) =>
          params.validator.validate({
            part,
            targetCategory: category,
            baseBody,
          }).ok
        );
      if (compatible.length === 0) return;
      const chosen = compatible[Math.floor(rng() * compatible.length)] ?? null;
      if (chosen) {
        this.applyPart(chosen);
      }
    });
  }

  reconcileEquippedParts(params: {
    library: AssetLibrary;
    validator: CompatibilityValidator;
  }) {
    const baseBody = params.library.findById(this.state.baseBodyId);
    Object.entries(this.state.equippedParts).forEach(([rawCategory, partId]) => {
      const category = rawCategory as CharacterPartCategory;
      if (category === 'body') return;
      const part = params.library.findById(partId);
      const compatibility = params.validator.validate({
        part,
        targetCategory: category,
        baseBody,
      });
      if (!compatibility.ok) {
        delete this.state.equippedParts[category];
        delete this.state.materialOverrides[category];
        delete this.state.colorOverrides[category];
      }
    });
  }

  loadPreset(params: {
    preset: CharacterPreset;
    library: AssetLibrary;
    validator: CompatibilityValidator;
  }) {
    const baseBody = params.library.findById(params.preset.baseBodyId);
    this.reset(baseBody);
    if (!baseBody) return;

    Object.entries(params.preset.parts).forEach(([rawCategory, partId]) => {
      const category = rawCategory as CharacterPartCategory;
      if (!partId) return;
      const part = params.library.findById(partId);
      const compatibility = params.validator.validate({
        part,
        targetCategory: category,
        baseBody,
      });
      if (compatibility.ok && part) {
        this.applyPart(part);
      }
    });

    this.state.materialOverrides = { ...(params.preset.materialVariants ?? {}) };
    this.state.colorOverrides = {
      ...(params.preset.colorVariants ?? params.preset.colors ?? {}),
    };
  }
}
