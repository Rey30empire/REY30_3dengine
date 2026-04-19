import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_EXCLUDED_TOP_LEVEL = new Set([
  '.git',
  '.next',
  '.next-typecheck',
  '.turbo',
  'node_modules',
  'download',
  'output',
  'output_Rey30',
  'input_Galeria_Rey30',
  'dev.log',
  'server.log',
  'next.log',
]);

const DEFAULT_EXCLUDED_BASENAME = new Set([
  '.git',
  '.next',
  '.next-typecheck',
  '.turbo',
  'node_modules',
]);

const SHADOW_META_FILE = '.rey30-shadow-meta.json';
const SQLITE_DATABASE_FILE_CANDIDATES = [
  ['prisma', 'prisma', 'dev.db'],
  ['prisma', 'dev.db'],
  ['db', 'custom.db'],
];

export async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function pathNeedsShadow(root = process.cwd()) {
  return root.includes('#');
}

export function safeWorkspaceName(input) {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function resolveShadowRoot(root, bucket) {
  const baseDir = process.env.LOCALAPPDATA || path.join(root, '.shadow');
  return path.join(baseDir, bucket, safeWorkspaceName(path.basename(root)));
}

function hashBuffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function hashOptionalFiles(root, relativePaths) {
  const hash = crypto.createHash('sha256');

  for (const relativePath of relativePaths) {
    const filePath = path.join(root, relativePath);
    if (!(await pathExists(filePath))) continue;
    const contents = await readFile(filePath);
    hash.update(relativePath);
    hash.update('\n');
    hash.update(contents);
    hash.update('\n');
  }

  return hash.digest('hex');
}

async function readShadowMeta(shadowRoot) {
  const metaPath = path.join(shadowRoot, SHADOW_META_FILE);
  if (!(await pathExists(metaPath))) {
    return {};
  }

  try {
    return JSON.parse(await readFile(metaPath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeShadowMeta(shadowRoot, nextMeta) {
  const metaPath = path.join(shadowRoot, SHADOW_META_FILE);
  const tempPath = `${metaPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(nextMeta, null, 2)}\n`, 'utf8');
  await rename(tempPath, metaPath).catch(async () => {
    await rm(metaPath, { force: true }).catch(() => undefined);
    await rename(tempPath, metaPath);
  });
}

async function updateShadowMeta(shadowRoot, updater) {
  const current = await readShadowMeta(shadowRoot);
  const next = updater(current);
  await writeShadowMeta(shadowRoot, next);
}

function shouldExcludeShadowEntry(relativePath, sourcePath, {
  excludedTopLevel = DEFAULT_EXCLUDED_TOP_LEVEL,
  excludedBasename = DEFAULT_EXCLUDED_BASENAME,
} = {}) {
  if (!relativePath) return false;

  const topLevelSegment = relativePath.split(path.sep)[0];
  if (excludedTopLevel.has(topLevelSegment)) {
    return true;
  }

  return excludedBasename.has(path.basename(sourcePath));
}

export async function copyProjectToShadow(
  sourceRoot,
  shadowRoot,
  {
    excludedTopLevel = DEFAULT_EXCLUDED_TOP_LEVEL,
    excludedBasename = DEFAULT_EXCLUDED_BASENAME,
  } = {}
) {
  const sourcePath = await realpath(sourceRoot).catch(() => sourceRoot);
  await mkdir(shadowRoot, { recursive: true });
  const existingEntries = await readdir(shadowRoot, { withFileTypes: true }).catch(() => []);

  for (const entry of existingEntries) {
    if (entry.name === 'node_modules' || entry.name === SHADOW_META_FILE) continue;
    await rm(path.join(shadowRoot, entry.name), { recursive: true, force: true }).catch(
      () => undefined
    );
  }

  await cp(sourcePath, shadowRoot, {
    recursive: true,
    force: true,
    filter: (src) => {
      const relative = path.relative(sourcePath, src);
      return !shouldExcludeShadowEntry(relative, src, {
        excludedTopLevel,
        excludedBasename,
      });
    },
  });
}

export function runCommand(command, args, { cwd = process.cwd(), envOverrides = {}, stdio = 'inherit' } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
  }

  return result;
}

export function resolvePrismaProvider(root = process.cwd()) {
  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) return 'sqlite';

  try {
    const schema = readFileSync(schemaPath, 'utf8');
    const providerMatch = schema.match(
      /datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/m
    );
    return providerMatch?.[1] || 'sqlite';
  } catch {
    return 'sqlite';
  }
}

export function getFallbackDatabaseUrl(root = process.cwd()) {
  if (resolvePrismaProvider(root) !== 'sqlite') {
    return undefined;
  }

  const databaseFile =
    SQLITE_DATABASE_FILE_CANDIDATES.map((segments) => path.join(root, ...segments)).find((filePath) =>
      existsSync(filePath)
    ) ?? path.join(root, 'prisma', 'prisma', 'dev.db');

  return `file:${databaseFile.replace(/\\/g, '/')}`;
}

export function getPrismaCommandEnv(root = process.cwd(), baseEnv = process.env) {
  const fallbackDatabaseUrl = getFallbackDatabaseUrl(root);
  const databaseUrl = baseEnv.DATABASE_URL || baseEnv.NETLIFY_DATABASE_URL || fallbackDatabaseUrl;

  return {
    ...baseEnv,
    ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    RUST_LOG: baseEnv.RUST_LOG || 'info',
  };
}

export async function ensureShadowDependencies(shadowRoot, binaryRelativePath) {
  const binaryPath = binaryRelativePath ? path.join(shadowRoot, ...binaryRelativePath) : '';
  const dependencySignature = await hashOptionalFiles(shadowRoot, [
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'bun.lock',
    'bun.lockb',
  ]);
  const meta = await readShadowMeta(shadowRoot);

  if (binaryPath && (await pathExists(binaryPath)) && meta.dependencySignature === dependencySignature) {
    return false;
  }

  runCommand('pnpm', ['install', '--frozen-lockfile'], { cwd: shadowRoot });
  await updateShadowMeta(shadowRoot, (current) => ({
    ...current,
    dependencySignature,
  }));
  return true;
}

function hasGeneratedPrismaClient(root) {
  return [
    path.join(root, 'node_modules', '.prisma', 'client', 'default.js'),
    path.join(root, 'node_modules', '.prisma', 'client', 'index.js'),
    path.join(root, 'node_modules', '@prisma', 'client', 'default.js'),
    path.join(root, 'node_modules', '@prisma', 'client', 'index.js'),
  ].some((candidate) => existsSync(candidate));
}

export async function ensureShadowPrismaClient(
  shadowRoot,
  baseEnv = process.env,
  { force = false } = {}
) {
  const schemaPath = path.join(shadowRoot, 'prisma', 'schema.prisma');
  if (!(await pathExists(schemaPath))) return;

  const prismaProvider = resolvePrismaProvider(shadowRoot);
  const prismaCommandEnv = getPrismaCommandEnv(shadowRoot, baseEnv);
  if (!prismaCommandEnv.DATABASE_URL && prismaProvider !== 'sqlite') {
    throw new Error(`DATABASE_URL is required for Prisma provider "${prismaProvider}"`);
  }

  const prismaSignature = hashBuffer(await readFile(schemaPath));
  const meta = await readShadowMeta(shadowRoot);
  if (!force && meta.prismaSignature === prismaSignature && hasGeneratedPrismaClient(shadowRoot)) {
    return;
  }

  runCommand('pnpm', ['exec', 'prisma', 'generate'], {
    cwd: shadowRoot,
    envOverrides: prismaCommandEnv,
  });

  await updateShadowMeta(shadowRoot, (current) => ({
    ...current,
    prismaSignature,
  }));
}

export async function prepareShadowWorkspace({
  root = process.cwd(),
  bucket,
  binaryRelativePath,
  ensurePrisma = false,
  env = process.env,
}) {
  const shadowRoot = resolveShadowRoot(root, bucket);
  await copyProjectToShadow(root, shadowRoot);
  const dependenciesInstalled = await ensureShadowDependencies(shadowRoot, binaryRelativePath);
  if (ensurePrisma) {
    await ensureShadowPrismaClient(shadowRoot, env, { force: dependenciesInstalled });
  }
  return shadowRoot;
}

export async function syncRelativePathBack(shadowRoot, sourceRoot, relativePath) {
  const sourcePath = path.join(shadowRoot, relativePath);
  const destinationPath = path.join(sourceRoot, relativePath);

  if (!(await pathExists(sourcePath))) {
    await rm(destinationPath, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  await rm(destinationPath, { recursive: true, force: true }).catch(() => undefined);
  await cp(sourcePath, destinationPath, { recursive: true, force: true });
}

export const __shadowWorkspaceInternals = {
  shouldExcludeShadowEntry,
};
