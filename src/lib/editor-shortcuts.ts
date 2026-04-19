'use client';

export type EditorShortcutCategory =
  | 'Shell'
  | 'Workspace'
  | 'Viewport'
  | 'Selection'
  | 'History';

export type EditorShortcutId =
  | 'shell.command_palette'
  | 'shell.compile'
  | 'shell.toggle_bottom_dock'
  | 'workspace.scene'
  | 'workspace.ai'
  | 'workspace.modeling'
  | 'workspace.materials'
  | 'workspace.animation'
  | 'workspace.scripting'
  | 'workspace.build'
  | 'workspace.debug'
  | 'viewport.gizmo.translate'
  | 'viewport.gizmo.rotate'
  | 'viewport.gizmo.scale'
  | 'viewport.gizmo.space'
  | 'viewport.focus_selected'
  | 'selection.delete'
  | 'selection.clear'
  | 'history.undo'
  | 'history.redo';

export interface EditorShortcutDefinition {
  id: EditorShortcutId;
  category: EditorShortcutCategory;
  title: string;
  description: string;
  defaults: string[];
}

export type EditorShortcutConfig = Record<EditorShortcutId, string[]>;

const STORAGE_KEY = 'rey30.editor.shortcuts.v1';

const listeners = new Set<(config: EditorShortcutConfig) => void>();

export const EDITOR_SHORTCUT_DEFINITIONS: EditorShortcutDefinition[] = [
  {
    id: 'shell.command_palette',
    category: 'Shell',
    title: 'Abrir command palette',
    description: 'Abre el buscador global del editor.',
    defaults: ['Ctrl/Cmd+K'],
  },
  {
    id: 'shell.compile',
    category: 'Shell',
    title: 'Compilar proyecto',
    description: 'Lanza la compilación y abre el build dock.',
    defaults: ['Ctrl/Cmd+Shift+B'],
  },
  {
    id: 'shell.toggle_bottom_dock',
    category: 'Shell',
    title: 'Alternar bottom dock',
    description: 'Muestra u oculta la zona inferior.',
    defaults: ['`'],
  },
  {
    id: 'workspace.scene',
    category: 'Workspace',
    title: 'Workspace Scene',
    description: 'Abre el workspace de escena.',
    defaults: ['1'],
  },
  {
    id: 'workspace.ai',
    category: 'Workspace',
    title: 'Workspace AI',
    description: 'Abre el chat AI-first con herramientas y validacion.',
    defaults: ['Ctrl/Cmd+I'],
  },
  {
    id: 'workspace.modeling',
    category: 'Workspace',
    title: 'Workspace Modeling',
    description: 'Abre el workspace de modelado.',
    defaults: ['2'],
  },
  {
    id: 'workspace.materials',
    category: 'Workspace',
    title: 'Workspace Materials',
    description: 'Abre el workspace de materiales.',
    defaults: ['3'],
  },
  {
    id: 'workspace.animation',
    category: 'Workspace',
    title: 'Workspace Animation',
    description: 'Abre el workspace de animación.',
    defaults: ['4'],
  },
  {
    id: 'workspace.scripting',
    category: 'Workspace',
    title: 'Workspace Scripting',
    description: 'Abre el workspace de scripting.',
    defaults: ['5'],
  },
  {
    id: 'workspace.build',
    category: 'Workspace',
    title: 'Workspace Build',
    description: 'Abre el workspace de compilación.',
    defaults: ['6'],
  },
  {
    id: 'workspace.debug',
    category: 'Workspace',
    title: 'Workspace Debug',
    description: 'Abre el workspace de depuración.',
    defaults: ['7'],
  },
  {
    id: 'viewport.gizmo.translate',
    category: 'Viewport',
    title: 'Gizmo Translate',
    description: 'Cambia el gizmo a mover.',
    defaults: ['W'],
  },
  {
    id: 'viewport.gizmo.rotate',
    category: 'Viewport',
    title: 'Gizmo Rotate',
    description: 'Cambia el gizmo a rotar.',
    defaults: ['E'],
  },
  {
    id: 'viewport.gizmo.scale',
    category: 'Viewport',
    title: 'Gizmo Scale',
    description: 'Cambia el gizmo a escalar.',
    defaults: ['R'],
  },
  {
    id: 'viewport.gizmo.space',
    category: 'Viewport',
    title: 'Alternar World/Local',
    description: 'Cambia el espacio del gizmo.',
    defaults: ['Q'],
  },
  {
    id: 'viewport.focus_selected',
    category: 'Viewport',
    title: 'Focus selected',
    description: 'Centra la cámara en la selección.',
    defaults: ['F'],
  },
  {
    id: 'selection.delete',
    category: 'Selection',
    title: 'Eliminar selección',
    description: 'Elimina los objetos seleccionados.',
    defaults: ['Delete', 'Backspace'],
  },
  {
    id: 'selection.clear',
    category: 'Selection',
    title: 'Limpiar selección',
    description: 'Limpia la selección actual.',
    defaults: ['Escape'],
  },
  {
    id: 'history.undo',
    category: 'History',
    title: 'Undo',
    description: 'Deshace la última acción.',
    defaults: ['Ctrl/Cmd+Z'],
  },
  {
    id: 'history.redo',
    category: 'History',
    title: 'Redo',
    description: 'Rehace la última acción.',
    defaults: ['Ctrl/Cmd+Shift+Z', 'Ctrl/Cmd+Y'],
  },
];

const DEFINITION_MAP = new Map(
  EDITOR_SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition])
);

const MOD_ORDER = ['mod', 'ctrl', 'meta', 'alt', 'shift'] as const;

export function createDefaultEditorShortcutConfig(): EditorShortcutConfig {
  return EDITOR_SHORTCUT_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.id] = definition.defaults.map((combo) => normalizeShortcutCombo(combo));
    return acc;
  }, {} as EditorShortcutConfig);
}

function normalizeKeyToken(token: string) {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'cmd/ctrl' || normalized === 'ctrl/cmd' || normalized === 'mod') {
    return 'mod';
  }
  if (normalized === 'ctrl' || normalized === 'control') {
    return 'ctrl';
  }
  if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
    return 'meta';
  }
  if (normalized === 'opt' || normalized === 'option') {
    return 'alt';
  }
  if (normalized === 'esc') {
    return 'escape';
  }
  if (normalized === 'del') {
    return 'delete';
  }
  if (normalized === 'spacebar') {
    return 'space';
  }
  if (normalized === '`') {
    return 'backquote';
  }
  if (normalized === '+') {
    return 'plus';
  }
  return normalized;
}

function denormalizeKeyToken(token: string) {
  switch (token) {
    case 'mod':
      return 'Ctrl/Cmd';
    case 'ctrl':
      return 'Ctrl';
    case 'meta':
      return 'Cmd';
    case 'alt':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'escape':
      return 'Escape';
    case 'delete':
      return 'Delete';
    case 'backspace':
      return 'Backspace';
    case 'backquote':
      return '`';
    case 'space':
      return 'Space';
    case 'arrowup':
      return 'ArrowUp';
    case 'arrowdown':
      return 'ArrowDown';
    case 'arrowleft':
      return 'ArrowLeft';
    case 'arrowright':
      return 'ArrowRight';
    default:
      return token.length === 1 ? token.toUpperCase() : token;
  }
}

export function normalizeShortcutCombo(input: string) {
  const parts = input
    .split('+')
    .map((part) => normalizeKeyToken(part))
    .filter(Boolean);

  const modifiers = MOD_ORDER.filter((modifier) => parts.includes(modifier));
  const mainKeys = parts.filter((part) => !MOD_ORDER.includes(part as (typeof MOD_ORDER)[number]));
  const ordered = [...modifiers, ...mainKeys];
  return ordered.join('+');
}

export function formatShortcutCombo(combo: string) {
  return normalizeShortcutCombo(combo)
    .split('+')
    .filter(Boolean)
    .map(denormalizeKeyToken)
    .join('+');
}

function normalizeStoredConfig(raw: unknown): EditorShortcutConfig {
  const defaults = createDefaultEditorShortcutConfig();
  if (!raw || typeof raw !== 'object') return defaults;

  const next = { ...defaults };
  for (const definition of EDITOR_SHORTCUT_DEFINITIONS) {
    const value = (raw as Record<string, unknown>)[definition.id];
    if (!Array.isArray(value)) continue;
    next[definition.id] = value
      .map((entry) => (typeof entry === 'string' ? normalizeShortcutCombo(entry) : ''))
      .filter(Boolean);
  }
  return next;
}

export function getEditorShortcutConfig() {
  if (typeof window === 'undefined') {
    return createDefaultEditorShortcutConfig();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultEditorShortcutConfig();
  }

  try {
    return normalizeStoredConfig(JSON.parse(raw));
  } catch {
    return createDefaultEditorShortcutConfig();
  }
}

export function saveEditorShortcutConfig(config: EditorShortcutConfig) {
  const normalized = normalizeStoredConfig(config);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  listeners.forEach((listener) => listener(normalized));
}

export function resetEditorShortcutConfig() {
  const defaults = createDefaultEditorShortcutConfig();
  saveEditorShortcutConfig(defaults);
  return defaults;
}

export function subscribeEditorShortcutConfig(
  listener: (config: EditorShortcutConfig) => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getShortcutCombos(
  config: EditorShortcutConfig,
  shortcutId: EditorShortcutId
) {
  return config[shortcutId] ?? DEFINITION_MAP.get(shortcutId)?.defaults ?? [];
}

export function getPrimaryShortcutLabel(
  config: EditorShortcutConfig,
  shortcutId: EditorShortcutId
) {
  const combo = getShortcutCombos(config, shortcutId)[0];
  return combo ? formatShortcutCombo(combo) : undefined;
}

function normalizeKeyboardEventKey(key: string) {
  const normalized = key.toLowerCase();
  if (normalized === ' ') return 'space';
  if (normalized === '`') return 'backquote';
  return normalizeKeyToken(normalized);
}

export function eventMatchesShortcut(event: KeyboardEvent, combo: string) {
  const normalizedCombo = normalizeShortcutCombo(combo);
  if (!normalizedCombo) return false;

  const tokens = normalizedCombo.split('+').filter(Boolean);
  const keyToken = tokens.find(
    (token) => !MOD_ORDER.includes(token as (typeof MOD_ORDER)[number])
  );

  const requiresMod = tokens.includes('mod');
  const requiresCtrl = tokens.includes('ctrl');
  const requiresMeta = tokens.includes('meta');
  const requiresAlt = tokens.includes('alt');
  const requiresShift = tokens.includes('shift');
  const metaOrCtrlPressed = event.ctrlKey || event.metaKey;

  if (requiresMod) {
    if (!metaOrCtrlPressed) return false;
  } else {
    if (requiresCtrl !== event.ctrlKey) return false;
    if (requiresMeta !== event.metaKey) return false;
    if (!requiresCtrl && !requiresMeta && metaOrCtrlPressed) return false;
  }

  if (requiresAlt !== event.altKey) return false;
  if (requiresShift !== event.shiftKey) return false;

  const eventKey = normalizeKeyboardEventKey(event.key);
  if (!keyToken) return false;
  return eventKey === keyToken;
}

export function eventMatchesAnyShortcut(event: KeyboardEvent, combos: string[]) {
  return combos.some((combo) => eventMatchesShortcut(event, combo));
}

export function findShortcutConflicts(config: EditorShortcutConfig) {
  const usage = new Map<string, EditorShortcutDefinition[]>();

  for (const definition of EDITOR_SHORTCUT_DEFINITIONS) {
    for (const combo of getShortcutCombos(config, definition.id)) {
      const key = normalizeShortcutCombo(combo);
      if (!key) continue;
      const list = usage.get(key) ?? [];
      list.push(definition);
      usage.set(key, list);
    }
  }

  return Array.from(usage.entries())
    .filter(([, definitions]) => definitions.length > 1)
    .map(([combo, definitions]) => ({
      combo,
      definitions,
    }));
}

export function getShortcutDefinition(shortcutId: EditorShortcutId) {
  return DEFINITION_MAP.get(shortcutId) ?? null;
}
