export const CHARACTER_PART_CATEGORIES = [
  'body',
  'head',
  'hair',
  'torso',
  'arms',
  'legs',
  'shoes',
  'outfit',
  'accessory',
] as const;

export type CharacterPartCategory = (typeof CHARACTER_PART_CATEGORIES)[number];
export type CharacterBuilderMessageLevel = 'info' | 'success' | 'warn' | 'error';

export interface CharacterPartVariant {
  id: string;
  label: string;
  swatch?: string | null;
}

export interface CharacterAssetRecord {
  id: string;
  name: string;
  category?: string | null;
  modelPath: string;
  thumbnailPath?: string | null;
  metadataPath?: string | null;
  skeletonId?: string | null;
  bodyType?: string | null;
  attachmentSocket?: string | null;
  enabled?: boolean;
  tags?: string[];
  isBaseBody?: boolean;
  polycount?: number | null;
  notes?: string | null;
  source?: string | null;
  materialVariants?: CharacterPartVariant[];
  colorVariants?: CharacterPartVariant[];
}

export interface CharacterPartMetadata {
  id: string;
  name: string;
  category: CharacterPartCategory;
  modelPath: string;
  thumbnailPath: string;
  metadataPath: string | null;
  skeletonId: string;
  bodyType: string;
  attachmentSocket: string;
  enabled: boolean;
  tags: string[];
  isBaseBody: boolean;
  polycount: number | null;
  notes: string | null;
  source: string | null;
  materialVariants: CharacterPartVariant[];
  colorVariants: CharacterPartVariant[];
}

export interface CharacterPreset {
  baseBodyId: string | null;
  parts: Partial<Record<CharacterPartCategory, string>>;
  materialVariants?: Partial<Record<CharacterPartCategory, string>>;
  colorVariants?: Partial<Record<CharacterPartCategory, string>>;
  colors?: Record<string, string>;
}

export interface StoredCharacterPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preset: CharacterPreset;
}

export interface CharacterAssemblyState {
  baseBodyId: string | null;
  equippedParts: Partial<Record<CharacterPartCategory, string>>;
  materialOverrides: Partial<Record<CharacterPartCategory, string>>;
  colorOverrides: Partial<Record<CharacterPartCategory, string>>;
}

export interface CharacterBuilderEngineAdapter {
  loadCharacterLibraryRecords(): Promise<CharacterAssetRecord[]>;
  listCharacterPresets(): Promise<StoredCharacterPreset[]>;
  saveCharacterPreset(entry: StoredCharacterPreset): Promise<void>;
  deleteCharacterPreset?(presetId: string): Promise<void>;
  showMessage(message: string, level?: CharacterBuilderMessageLevel): void;
  reportCharacterError?(report: CharacterBuilderErrorReport): void | Promise<void>;
}

export interface CharacterCompatibilityIssue {
  code: string;
  message: string;
}

export interface CharacterCompatibilityResult {
  ok: boolean;
  targetCategory: CharacterPartCategory;
  resolvedSocket: string;
  issues: CharacterCompatibilityIssue[];
}

export interface CharacterBuilderErrorReport {
  id: string;
  partId: string | null;
  targetCategory: CharacterPartCategory | null;
  message: string;
  issues: CharacterCompatibilityIssue[];
  createdAt: string;
}

export interface CharacterLibraryFilters {
  searchQuery: string;
  bodyType: string | null;
  tag: string | null;
}

export interface CharacterDragDropState {
  enabled: boolean;
  draggingPartId: string | null;
  hoveredCategory: CharacterPartCategory | null;
  highlightedCategories: CharacterPartCategory[];
}

export interface CharacterPreviewState {
  yaw: number;
  pitch: number;
  zoom: number;
}

export interface CharacterPartView {
  part: CharacterPartMetadata;
  compatibility: CharacterCompatibilityResult;
  equipped: boolean;
}

export interface CharacterBuilderSnapshot {
  selectedCategory: CharacterPartCategory;
  filters: CharacterLibraryFilters;
  categories: Array<{
    category: CharacterPartCategory;
    label: string;
    count: number;
  }>;
  filteredParts: CharacterPartView[];
  equippedParts: Partial<Record<CharacterPartCategory, CharacterPartMetadata>>;
  baseBody: CharacterPartMetadata | null;
  presets: StoredCharacterPreset[];
  dragDrop: CharacterDragDropState;
  preview: CharacterPreviewState;
  previewModelPaths: string[];
  tags: string[];
  materialSelections: Partial<Record<CharacterPartCategory, string>>;
  colorSelections: Partial<Record<CharacterPartCategory, string>>;
  errorReports: CharacterBuilderErrorReport[];
}

export interface CharacterBuilderActionResult {
  ok: boolean;
  message: string;
}

const CATEGORY_ALIASES: Record<string, CharacterPartCategory> = {
  body: 'body',
  base: 'body',
  mannequin: 'body',
  mannequin_body: 'body',
  maniqui: 'body',
  torso: 'torso',
  chest: 'torso',
  head: 'head',
  cabeza: 'head',
  hair: 'hair',
  cabello: 'hair',
  arms: 'arms',
  arm: 'arms',
  brazo: 'arms',
  brazos: 'arms',
  hand: 'arms',
  hands: 'arms',
  mano: 'arms',
  legs: 'legs',
  leg: 'legs',
  pierna: 'legs',
  piernas: 'legs',
  shoes: 'shoes',
  shoe: 'shoes',
  boots: 'shoes',
  boot: 'shoes',
  zapatos: 'shoes',
  outfit: 'outfit',
  clothing: 'outfit',
  clothes: 'outfit',
  ropa: 'outfit',
  accessory: 'accessory',
  accessories: 'accessory',
  accesorio: 'accessory',
  accesorios: 'accessory',
  hat: 'accessory',
  helmet: 'accessory',
};

const SOCKET_TO_CATEGORY: Record<string, CharacterPartCategory> = {
  root_socket: 'body',
  body_socket: 'body',
  head_socket: 'head',
  hair_socket: 'hair',
  torso_socket: 'torso',
  arms_socket: 'arms',
  hands_socket: 'arms',
  legs_socket: 'legs',
  feet_socket: 'shoes',
  shoes_socket: 'shoes',
  outfit_socket: 'outfit',
  accessory_socket: 'accessory',
};

export const CHARACTER_CATEGORY_LABELS: Record<CharacterPartCategory, string> = {
  body: 'Body',
  head: 'Head',
  hair: 'Hair',
  torso: 'Torso',
  arms: 'Arms',
  legs: 'Legs',
  shoes: 'Shoes',
  outfit: 'Outfit',
  accessory: 'Accessory',
};

export const CHARACTER_CATEGORY_SOCKETS: Record<CharacterPartCategory, string> = {
  body: 'root_socket',
  head: 'head_socket',
  hair: 'hair_socket',
  torso: 'torso_socket',
  arms: 'arms_socket',
  legs: 'legs_socket',
  shoes: 'feet_socket',
  outfit: 'torso_socket',
  accessory: 'accessory_socket',
};

export function normalizeCharacterCategory(
  value: string | null | undefined
): CharacterPartCategory | null {
  const raw = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];
  if (SOCKET_TO_CATEGORY[raw]) return SOCKET_TO_CATEGORY[raw];

  const compact = raw.replace(/_/g, ' ');
  if (compact.includes('maniqui') || compact.includes('mannequin')) return 'body';
  if (compact.includes('hoodie') || compact.includes('ropa')) return 'outfit';
  if (compact.includes('boot') || compact.includes('shoe') || compact.includes('zapat')) return 'shoes';
  if (compact.includes('hat') || compact.includes('helmet') || compact.includes('gorra')) return 'accessory';
  if (compact.includes('head') || compact.includes('cabeza')) return 'head';
  if (compact.includes('hair') || compact.includes('cabello')) return 'hair';
  if (compact.includes('torso') || compact.includes('chest')) return 'torso';
  if (compact.includes('arm') || compact.includes('mano') || compact.includes('hand')) return 'arms';
  if (compact.includes('leg') || compact.includes('pierna')) return 'legs';
  return null;
}

export function normalizeCharacterDropTarget(
  value: string | null | undefined
): CharacterPartCategory | null {
  return normalizeCharacterCategory(value);
}

export function getDefaultSocketForCategory(category: CharacterPartCategory) {
  return CHARACTER_CATEGORY_SOCKETS[category];
}
