import { CHARACTER_PART_CATEGORIES } from './types';
import type {
  CharacterDragDropState,
  CharacterPartCategory,
  CharacterPartMetadata,
} from './types';
import type { CompatibilityValidator } from './compatibilityValidator';

function createInitialState(): CharacterDragDropState {
  return {
    enabled: true,
    draggingPartId: null,
    hoveredCategory: null,
    highlightedCategories: [],
  };
}

export class DragDropController {
  private state = createInitialState();

  snapshot() {
    return {
      ...this.state,
      highlightedCategories: [...this.state.highlightedCategories],
    };
  }

  setEnabled(enabled: boolean) {
    this.state.enabled = enabled;
    if (!enabled) {
      this.cancel();
    }
  }

  beginDrag(params: {
    part: CharacterPartMetadata | null;
    validator: CompatibilityValidator;
    baseBody: CharacterPartMetadata | null;
  }) {
    if (!this.state.enabled) return this.snapshot();
    const part = params.part;
    this.state.draggingPartId = part?.id ?? null;
    this.state.hoveredCategory = null;
    this.state.highlightedCategories = part
      ? CHARACTER_PART_CATEGORIES.filter((category) =>
          params.validator.validate({
            part,
            targetCategory: category,
            baseBody: params.baseBody,
          }).ok
        )
      : [];
    return this.snapshot();
  }

  hover(category: CharacterPartCategory | null) {
    this.state.hoveredCategory = category;
    return this.snapshot();
  }

  cancel() {
    this.state.draggingPartId = null;
    this.state.hoveredCategory = null;
    this.state.highlightedCategories = [];
    return this.snapshot();
  }
}
