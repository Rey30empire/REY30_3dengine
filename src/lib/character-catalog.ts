export type CharacterCatalogEntryKind = 'builder_preset' | 'modular_character';
export type CharacterCatalogWorkspace = 'builder' | 'modular-lab';
export type CharacterCatalogProjectMatch = 'current-project' | 'other-project';

export interface CharacterCatalogEntry {
  id: string;
  kind: CharacterCatalogEntryKind;
  workspace: CharacterCatalogWorkspace;
  name: string;
  description: string;
  projectKey: string;
  projectName: string;
  projectMatch: CharacterCatalogProjectMatch;
  createdAt: string;
  updatedAt: string;
  stats: {
    partCount: number;
    variantCount: number;
    hasRig: boolean | null;
    meshCount: number | null;
    materialCount: number | null;
    animationCount: number | null;
  };
  actions?: {
    packageUrl?: string;
    downloadUrl?: string;
    originalDownloadUrl?: string;
  };
}

export interface CharacterCatalogSummary {
  totalCount: number;
  builderPresetCount: number;
  modularCharacterCount: number;
  currentProjectCount: number;
  otherProjectCount: number;
  riggedModularCount: number;
}

export interface CharacterCatalogResponse {
  projectKey: string;
  entries: CharacterCatalogEntry[];
  summary: CharacterCatalogSummary;
}
