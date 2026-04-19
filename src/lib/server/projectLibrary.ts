import { promises as fs } from 'fs';
import path from 'path';
import { getAssetRoot } from '@/engine/assets/pipeline';
import {
  normalizeProjectKey as normalizeProjectKeyValue,
  sanitizeProjectKeySegment,
} from '@/lib/project-key';

export type ProjectLibraryKind = 'material' | 'modifier_preset' | 'character_preset';
export type ProjectLibraryScope = 'project' | 'shared';

export interface ProjectLibraryEntry<TDefinition> {
  name: string;
  path: string;
  projectKey: string;
  scope: ProjectLibraryScope;
  definition: TDefinition;
}

let projectLibraryMutationQueue: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeLibraryName(value: string) {
  return sanitizeProjectKeySegment(value);
}

export function normalizeProjectKey(value: string | null | undefined) {
  return normalizeProjectKeyValue(value);
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

export function runProjectLibraryMutation<T>(work: () => Promise<T>): Promise<T> {
  const next = projectLibraryMutationQueue.then(work, work);
  projectLibraryMutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function createAtomicTempPath(targetPath: string) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 10)}`;
  return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${suffix}.tmp`);
}

async function writeJsonAtomic(targetPath: string, value: unknown) {
  const tempPath = createAtomicTempPath(targetPath);
  const payload = JSON.stringify(value, null, 2);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(tempPath, payload, 'utf-8');
  try {
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      await fs.rm(targetPath, { force: true }).catch(() => undefined);
      await fs.rename(tempPath, targetPath);
      return;
    }
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
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

export async function readProjectLibraryEntry<TDefinition>(params: {
  kind: ProjectLibraryKind;
  projectKey: string;
  name: string;
  parser: (value: unknown) => TDefinition | null;
  scope?: ProjectLibraryScope;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const scope = params.scope ?? 'project';
  const safeName = sanitizeLibraryName(params.name);
  if (!safeName) {
    return null;
  }

  const absolutePath = path.join(
    getScopeRoot(params.kind, normalizedProjectKey, scope),
    `${safeName}.json`
  );

  try {
    const raw = await fs.readFile(absolutePath, 'utf-8');
    const definition = params.parser(JSON.parse(raw));
    if (!definition) {
      return null;
    }

    return {
      name: safeName,
      path: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
      projectKey: scope === 'shared' ? 'shared' : normalizedProjectKey,
      scope,
      definition,
    } satisfies ProjectLibraryEntry<TDefinition>;
  } catch {
    return null;
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
  await writeJsonAtomic(absolutePath, params.definition);
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
