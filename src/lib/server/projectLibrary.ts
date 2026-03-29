import { promises as fs } from 'fs';
import path from 'path';
import { getAssetRoot } from '@/engine/assets/pipeline';

export type ProjectLibraryKind = 'material' | 'modifier_preset';
export type ProjectLibraryScope = 'project' | 'shared';

export interface ProjectLibraryEntry<TDefinition> {
  name: string;
  path: string;
  projectKey: string;
  scope: ProjectLibraryScope;
  definition: TDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeLibraryName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export function normalizeProjectKey(value: string | null | undefined) {
  const sanitized = sanitizeLibraryName(value || 'untitled_project').toLowerCase();
  return sanitized.length > 0 ? sanitized : 'untitled_project';
}

function getKindRoot(kind: ProjectLibraryKind) {
  return path.join(getAssetRoot(), kind, 'library');
}

function getProjectRoot(kind: ProjectLibraryKind, projectKey: string) {
  return path.join(getKindRoot(kind), normalizeProjectKey(projectKey));
}

function getScopeRoot(
  kind: ProjectLibraryKind,
  projectKey: string,
  scope: ProjectLibraryScope
) {
  return scope === 'shared'
    ? getKindRoot(kind)
    : getProjectRoot(kind, normalizeProjectKey(projectKey));
}

export function buildProjectLibraryRelativePath(params: {
  kind: ProjectLibraryKind;
  projectKey: string;
  name: string;
  scope?: ProjectLibraryScope;
}) {
  const scope = params.scope ?? 'project';
  const safeName = sanitizeLibraryName(params.name) || params.kind;
  const absolutePath = path.join(
    getScopeRoot(params.kind, params.projectKey, scope),
    `${safeName}.json`
  );
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
}

async function readLibraryFiles<TDefinition>(params: {
  dir: string;
  projectKey: string;
  scope: ProjectLibraryScope;
  parser: (value: unknown) => TDefinition | null;
}): Promise<Array<ProjectLibraryEntry<TDefinition>>> {
  try {
    const entries = await fs.readdir(params.dir, { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map(async (entry) => {
          try {
            const absolutePath = path.join(params.dir, entry.name);
            const raw = await fs.readFile(absolutePath, 'utf-8');
            const parsed = params.parser(JSON.parse(raw));
            if (!parsed) {
              return null;
            }
            return {
              name: path.basename(entry.name, '.json'),
              path: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
              projectKey: params.projectKey,
              scope: params.scope,
              definition: parsed,
            } satisfies ProjectLibraryEntry<TDefinition>;
          } catch {
            return null;
          }
        })
    );

    return results.flatMap((entry) => (entry ? [entry] : []));
  } catch {
    return [];
  }
}

export async function listProjectLibraryEntries<TDefinition>(params: {
  kind: ProjectLibraryKind;
  projectKey: string;
  parser: (value: unknown) => TDefinition | null;
  includeShared?: boolean;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const sharedEntries = params.includeShared
    ? await readLibraryFiles({
        dir: getKindRoot(params.kind),
        projectKey: 'shared',
        scope: 'shared',
        parser: params.parser,
      })
    : [];
  const projectEntries = await readLibraryFiles({
    dir: getProjectRoot(params.kind, normalizedProjectKey),
    projectKey: normalizedProjectKey,
    scope: 'project',
    parser: params.parser,
  });

  const merged = new Map<string, ProjectLibraryEntry<TDefinition>>();
  sharedEntries.forEach((entry) => {
    merged.set(entry.name.toLowerCase(), entry);
  });
  projectEntries.forEach((entry) => {
    merged.set(entry.name.toLowerCase(), entry);
  });

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function writeProjectLibraryEntry<TDefinition>(params: {
  kind: ProjectLibraryKind;
  projectKey: string;
  name: string;
  definition: TDefinition;
  scope?: ProjectLibraryScope;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const scope = params.scope ?? 'project';
  const safeName = sanitizeLibraryName(params.name) || params.kind;
  const dir = getScopeRoot(params.kind, normalizedProjectKey, scope);
  const absolutePath = path.join(dir, `${safeName}.json`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(absolutePath, JSON.stringify(params.definition, null, 2), 'utf-8');
  return {
    name: safeName,
    projectKey: scope === 'shared' ? 'shared' : normalizedProjectKey,
    scope,
    absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
  };
}

export async function deleteProjectLibraryEntry(params: {
  kind: ProjectLibraryKind;
  projectKey: string;
  name: string;
  scope?: ProjectLibraryScope;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const scope = params.scope ?? 'project';
  const safeName = sanitizeLibraryName(params.name);
  if (!safeName) {
    return false;
  }

  const absolutePath = path.join(
    getScopeRoot(params.kind, normalizedProjectKey, scope),
    `${safeName}.json`
  );
  try {
    await fs.unlink(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export function parseProjectLibraryRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
