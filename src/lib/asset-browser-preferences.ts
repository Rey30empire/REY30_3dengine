'use client';

export type AssetBrowserScope = 'all' | 'project' | 'shared' | 'generated';
export type AssetBrowserViewMode = 'grid' | 'list';
export type AssetBrowserSort = 'name' | 'type' | 'size' | 'modified';
export type AssetBrowserFilterType =
  | 'all'
  | 'model'
  | 'texture'
  | 'material'
  | 'modifier_preset'
  | 'character_preset'
  | 'audio'
  | 'video'
  | 'script'
  | 'scene'
  | 'prefab'
  | 'animation'
  | 'font'
  | 'other';

export interface AssetBrowserSavedFilter {
  id: string;
  name: string;
  query: string;
  scope: AssetBrowserScope;
  type: AssetBrowserFilterType;
  sortBy: AssetBrowserSort;
  tag: string;
  collection: string;
  favoritesOnly: boolean;
  managedOnly: boolean;
}

export interface AssetBrowserPreferences {
  savedFilters: AssetBrowserSavedFilter[];
}

const STORAGE_KEY = 'rey30.asset-browser.preferences.v1';

function normalizeFilter(value: Partial<AssetBrowserSavedFilter>): AssetBrowserSavedFilter | null {
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) {
    return null;
  }

  return {
    id:
      typeof value.id === 'string' && value.id.trim()
        ? value.id.trim()
        : `filter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    query: typeof value.query === 'string' ? value.query : '',
    scope:
      value.scope === 'project' ||
      value.scope === 'shared' ||
      value.scope === 'generated' ||
      value.scope === 'all'
        ? value.scope
        : 'all',
    type:
      typeof value.type === 'string' && value.type.length > 0
        ? (value.type as AssetBrowserFilterType)
        : 'all',
    sortBy:
      value.sortBy === 'type' ||
      value.sortBy === 'size' ||
      value.sortBy === 'modified' ||
      value.sortBy === 'name'
        ? value.sortBy
        : 'name',
    tag: typeof value.tag === 'string' ? value.tag : '',
    collection: typeof value.collection === 'string' ? value.collection : '',
    favoritesOnly: Boolean(value.favoritesOnly),
    managedOnly: Boolean(value.managedOnly),
  };
}

export function loadAssetBrowserPreferences(): AssetBrowserPreferences {
  if (typeof window === 'undefined') {
    return { savedFilters: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { savedFilters: [] };
    }

    const parsed = JSON.parse(raw) as Partial<AssetBrowserPreferences>;
    const savedFilters = Array.isArray(parsed.savedFilters)
      ? parsed.savedFilters
          .map((item) => normalizeFilter(item))
          .filter((item): item is AssetBrowserSavedFilter => Boolean(item))
      : [];
    return { savedFilters };
  } catch {
    return { savedFilters: [] };
  }
}

export function saveAssetBrowserPreferences(value: AssetBrowserPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized: AssetBrowserPreferences = {
    savedFilters: Array.isArray(value.savedFilters)
      ? value.savedFilters
          .map((item) => normalizeFilter(item))
          .filter((item): item is AssetBrowserSavedFilter => Boolean(item))
      : [],
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
