import { AssetLibrary } from './assetLibrary';
import { CharacterAssembler } from './characterAssembler';
import { CompatibilityValidator } from './compatibilityValidator';
import { DragDropController } from './dragDropController';
import { PresetManager } from './presetManager';
import { PreviewViewport } from './previewViewport';
import type {
  CharacterBuilderActionResult,
  CharacterBuilderErrorReport,
  CharacterBuilderEngineAdapter,
  CharacterBuilderSnapshot,
  CharacterCompatibilityResult,
  CharacterPartCategory,
  CharacterPartMetadata,
  CharacterPreset,
} from './types';
import {
  CHARACTER_CATEGORY_LABELS,
  CHARACTER_PART_CATEGORIES,
} from './types';

export class CharacterLibraryBuilder {
  readonly library: AssetLibrary;
  readonly validator: CompatibilityValidator;
  readonly assembler: CharacterAssembler;
  readonly dragDrop: DragDropController;
  readonly previewViewport: PreviewViewport;
  readonly presetManager: PresetManager;

  private selectedCategory: CharacterPartCategory = 'body';
  private filters = {
    searchQuery: '',
    bodyType: null as string | null,
    tag: null as string | null,
  };
  private presets = [] as Awaited<ReturnType<PresetManager['list']>>;
  private errorReports: CharacterBuilderErrorReport[] = [];

  constructor(private readonly engineAdapter: CharacterBuilderEngineAdapter) {
    this.library = new AssetLibrary();
    this.validator = new CompatibilityValidator();
    this.assembler = new CharacterAssembler();
    this.dragDrop = new DragDropController();
    this.previewViewport = new PreviewViewport();
    this.presetManager = new PresetManager(engineAdapter);
  }

  async openCharacterBuilder() {
    await this.rebuildAssetLibrary();
    return this.snapshot();
  }

  async rebuildAssetLibrary() {
    const records = await this.engineAdapter.loadCharacterLibraryRecords();
    this.library.replaceAll(records);
    this.errorReports = [];

    const defaultBaseBody =
      this.library.findById(this.assembler.currentBaseBodyId()) ??
      this.library.findBaseBodies()[0] ??
      null;
    this.assembler.reset(defaultBaseBody);
    this.presets = await this.presetManager.list();
    this.engineAdapter.showMessage('Character Builder listo y biblioteca recargada.', 'success');
    return this.snapshot();
  }

  setSelectedCategory(category: CharacterPartCategory) {
    this.selectedCategory = category;
    return this.snapshot();
  }

  setSearchQuery(searchQuery: string) {
    this.filters.searchQuery = searchQuery;
    return this.snapshot();
  }

  setBodyTypeFilter(bodyType: string | null) {
    this.filters.bodyType = bodyType && bodyType !== 'all' ? bodyType : null;
    return this.snapshot();
  }

  setTagFilter(tag: string | null) {
    this.filters.tag = tag && tag !== 'all' ? tag : null;
    return this.snapshot();
  }

  enableDragDropMode(enabled: boolean) {
    this.dragDrop.setEnabled(enabled);
    return this.snapshot();
  }

  setMaterialVariant(category: CharacterPartCategory, variantId: string | null) {
    const part = this.currentPartForCategory(category);
    if (!part) {
      this.engineAdapter.showMessage(`No hay pieza equipada en ${category}.`, 'error');
      return this.snapshot();
    }
    if (variantId && !part.materialVariants.some((variant) => variant.id === variantId)) {
      this.engineAdapter.showMessage(
        `La variante de material ${variantId} no existe para ${part.name}.`,
        'error'
      );
      return this.snapshot();
    }
    this.assembler.setMaterialVariant(category, variantId);
    this.engineAdapter.showMessage(`Material de ${part.name} actualizado.`, 'success');
    return this.snapshot();
  }

  setColorVariant(category: CharacterPartCategory, variantId: string | null) {
    const part = this.currentPartForCategory(category);
    if (!part) {
      this.engineAdapter.showMessage(`No hay pieza equipada en ${category}.`, 'error');
      return this.snapshot();
    }
    if (variantId && !part.colorVariants.some((variant) => variant.id === variantId)) {
      this.engineAdapter.showMessage(
        `La variante de color ${variantId} no existe para ${part.name}.`,
        'error'
      );
      return this.snapshot();
    }
    this.assembler.setColorVariant(category, variantId);
    this.engineAdapter.showMessage(`Color de ${part.name} actualizado.`, 'success');
    return this.snapshot();
  }

  beginDrag(partId: string) {
    const part = this.library.findById(partId);
    this.dragDrop.beginDrag({
      part,
      validator: this.validator,
      baseBody: this.currentBaseBody(),
    });
    return this.snapshot();
  }

  hoverDropZone(category: CharacterPartCategory | null) {
    this.dragDrop.hover(category);
    return this.snapshot();
  }

  cancelDrag() {
    this.dragDrop.cancel();
    return this.snapshot();
  }

  rotatePreview(deltaYaw: number, deltaPitch = 0) {
    this.previewViewport.rotate(deltaYaw, deltaPitch);
    return this.snapshot();
  }

  zoomPreview(delta: number) {
    this.previewViewport.zoomBy(delta);
    return this.snapshot();
  }

  resetPreview() {
    this.previewViewport.reset();
    return this.snapshot();
  }

  applyPart(partId: string, targetCategory?: CharacterPartCategory | null) {
    const part = this.library.findById(partId);
    const compatibility = this.validatePart(part, targetCategory ?? part?.category ?? 'body');
    if (!compatibility.ok || !part) {
      this.reportCompatibilityFailure(part, compatibility);
      return this.fail(
        compatibility.issues[0]?.message ?? 'No se pudo equipar la pieza solicitada.'
      );
    }

    this.assembler.applyPart(part);
    if (part.category === 'body') {
      this.assembler.reconcileEquippedParts({
        library: this.library,
        validator: this.validator,
      });
    }
    this.dragDrop.cancel();
    return this.success(`${part.name} equipada en ${compatibility.targetCategory}.`);
  }

  dropDraggedPart(targetCategory?: CharacterPartCategory | null) {
    const draggingPartId = this.dragDrop.snapshot().draggingPartId;
    if (!draggingPartId) {
      return this.fail('No hay ninguna pieza siendo arrastrada.');
    }
    return this.applyPart(draggingPartId, targetCategory);
  }

  removePart(category: CharacterPartCategory) {
    this.assembler.removePart(category);
    const message =
      category === 'body'
        ? 'Personaje reseteado al estado vacio.'
        : `Slot ${category} limpiado.`;
    return this.success(message);
  }

  resetCharacter() {
    const defaultBaseBody = this.library.findBaseBodies()[0] ?? null;
    this.assembler.reset(defaultBaseBody);
    return this.success('Personaje reseteado al estado base.');
  }

  randomizeCharacter() {
    this.assembler.randomize({
      library: this.library,
      validator: this.validator,
    });
    return this.success('Piezas aleatorias compatibles equipadas.');
  }

  async savePreset(name: string) {
    const normalized = name.trim();
    if (!normalized) {
      return this.fail('Escribe un nombre antes de guardar el preset.');
    }
    await this.presetManager.save(normalized, this.assembler.serializePreset());
    this.presets = await this.presetManager.list();
    return this.success(`Preset ${normalized} guardado en JSON.`);
  }

  async loadPreset(presetId: string) {
    this.presets = await this.presetManager.list();
    const preset = this.presets.find((entry) => entry.id === presetId) ?? null;
    if (!preset) {
      return this.fail('No se encontro el preset solicitado.');
    }

    this.assembler.loadPreset({
      preset: preset.preset,
      library: this.library,
      validator: this.validator,
    });
    return this.success(`Preset ${preset.name} cargado.`);
  }

  hydrateFromPreset(preset: CharacterPreset) {
    this.assembler.loadPreset({
      preset,
      library: this.library,
      validator: this.validator,
    });
    return this.snapshot();
  }

  async deletePreset(presetId: string) {
    const preset = this.presets.find((entry) => entry.id === presetId) ?? null;
    const deleted = await this.presetManager.delete(presetId);
    if (!deleted) {
      return this.fail('El adaptador actual no soporta eliminar presets.');
    }
    this.presets = await this.presetManager.list();
    return this.success(`Preset ${preset?.name ?? presetId} eliminado.`);
  }

  snapshot(): CharacterBuilderSnapshot {
    const assembly = this.assembler.snapshot();
    const baseBody = this.currentBaseBody();
    const equippedParts = CHARACTER_PART_CATEGORIES.reduce((acc, category) => {
      const partId =
        category === 'body'
          ? assembly.baseBodyId
          : assembly.equippedParts[category];
      const part = this.library.findById(partId);
      if (part) {
        acc[category] = part;
      }
      return acc;
    }, {} as Partial<Record<CharacterPartCategory, CharacterPartMetadata>>);

    const categories = CHARACTER_PART_CATEGORIES.map((category) => ({
      category,
      label: CHARACTER_CATEGORY_LABELS[category],
      count: this.library.partsByCategory(category).length,
    })).filter((entry) => entry.count > 0);

    const filteredParts = this.library
      .partsByCategory(this.selectedCategory, this.filters)
      .map((part) => ({
        part,
        compatibility: this.validatePart(part, this.selectedCategory),
        equipped: equippedParts[this.selectedCategory]?.id === part.id,
      }));

    const previewModelPaths = Array.from(
      new Set(
        Object.values(equippedParts)
          .filter((part): part is CharacterPartMetadata => Boolean(part))
          .map((part) => part.modelPath)
      )
    );

    return {
      selectedCategory: this.selectedCategory,
      filters: { ...this.filters },
      categories,
      filteredParts,
      equippedParts,
      baseBody,
      presets: [...this.presets],
      dragDrop: this.dragDrop.snapshot(),
      preview: this.previewViewport.snapshot(),
      previewModelPaths,
      tags: this.library.availableTags(),
      materialSelections: { ...assembly.materialOverrides },
      colorSelections: { ...assembly.colorOverrides },
      errorReports: [...this.errorReports],
    };
  }

  private currentBaseBody() {
    return this.library.findById(this.assembler.snapshot().baseBodyId);
  }

  private currentPartForCategory(category: CharacterPartCategory) {
    const assembly = this.assembler.snapshot();
    const partId = category === 'body' ? assembly.baseBodyId : assembly.equippedParts[category];
    return this.library.findById(partId);
  }

  private validatePart(
    part: CharacterPartMetadata | null,
    targetCategory: CharacterPartCategory
  ): CharacterCompatibilityResult {
    return this.validator.validate({
      part,
      targetCategory,
      baseBody: this.currentBaseBody(),
    });
  }

  private reportCompatibilityFailure(
    part: CharacterPartMetadata | null,
    compatibility: CharacterCompatibilityResult
  ) {
    const report: CharacterBuilderErrorReport = {
      id: globalThis.crypto?.randomUUID?.() ?? `char_report_${Date.now()}`,
      partId: part?.id ?? null,
      targetCategory: compatibility.targetCategory,
      message:
        compatibility.issues[0]?.message ??
        `No se pudo equipar ${part?.name ?? 'la pieza solicitada'}.`,
      issues: [...compatibility.issues],
      createdAt: new Date().toISOString(),
    };
    this.errorReports = [report, ...this.errorReports].slice(0, 12);
    void this.engineAdapter.reportCharacterError?.(report);
  }

  private success(message: string): CharacterBuilderActionResult {
    this.engineAdapter.showMessage(message, 'success');
    return {
      ok: true,
      message,
    };
  }

  private fail(message: string): CharacterBuilderActionResult {
    this.engineAdapter.showMessage(message, 'error');
    return {
      ok: false,
      message,
    };
  }
}

export async function openCharacterBuilder(builder: CharacterLibraryBuilder) {
  return builder.openCharacterBuilder();
}

export async function rebuildAssetLibrary(builder: CharacterLibraryBuilder) {
  return builder.rebuildAssetLibrary();
}

export function enableDragDropMode(
  builder: CharacterLibraryBuilder,
  enabled: boolean
) {
  return builder.enableDragDropMode(enabled);
}

export const open_character_builder = openCharacterBuilder;
export const rebuild_asset_library = rebuildAssetLibrary;
export const enable_drag_drop_mode = enableDragDropMode;
