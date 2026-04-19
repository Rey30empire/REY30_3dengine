import crypto from 'crypto';
import { existsSync } from 'fs';
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { getReleaseInfo } from '@/lib/ops/release-info';
import {
  deleteStoredGalleryFile,
  getGalleryStorageInfo,
  listStoredGalleryFiles,
  readStoredGalleryFile,
  upsertStoredGalleryFile,
} from '@/lib/server/gallery-storage';
import {
  deleteStoredPackage,
  getPackageStorageInfo,
  listStoredPackages,
  restoreStoredPackageDocument,
  serializeStoredPackageDocument,
  type StoredPackageManifest,
} from '@/lib/server/package-storage';
import {
  deleteStoredScript,
  getScriptStorageInfo,
  listStoredScripts,
  upsertStoredScript,
} from '@/lib/server/script-storage';
import type { StorageAdapterInfo } from '@/lib/server/storage-adapter';

type BackupTargetKey = 'database' | 'scripts' | 'gallery' | 'packages';
type TargetType = 'file' | 'directory';
type BackupSourceMode = 'filesystem' | 'storage-adapter';

type BackupFileEntry = {
  relativePath: string;
  size: number;
  sha256: string;
};

type BackupTargetStorageInfo = {
  backend?: string;
  scope?: string;
  root?: string;
  storeName?: string;
};

type BackupItem = {
  key: BackupTargetKey;
  targetType: TargetType;
  sourcePath: string;
  payloadPath: string;
  exists: boolean;
  fileCount: number;
  totalBytes: number;
  files: BackupFileEntry[];
  sourceMode?: BackupSourceMode;
  storage?: BackupTargetStorageInfo;
};

export type BackupManifest = {
  id: string;
  schemaVersion: number;
  createdAt: string;
  note: string;
  release: ReturnType<typeof getReleaseInfo>;
  backupRoot: string;
  totals: {
    items: number;
    files: number;
    bytes: number;
  };
  items: BackupItem[];
};

export type BackupSummary = {
  backupId: string;
  backupDir: string;
  manifestPath: string;
  createdAt: string;
  totals: BackupManifest['totals'];
  note: string;
};

export type BackupVerifyResult = {
  backupId: string;
  ok: boolean;
  checkedFiles: number;
  failedFiles: number;
  mismatches: Array<{
    file: string;
    expected: string;
    received: string;
  }>;
};

export type RestoreResult = {
  backupId: string;
  dryRun: boolean;
  verified: BackupVerifyResult;
  operations: Array<{
    key: BackupTargetKey;
    targetType: TargetType;
    from: string;
    to: string;
  }>;
  historyDir: string | null;
};

type FilesystemBackupTarget = {
  key: BackupTargetKey;
  targetType: TargetType;
  sourceMode: 'filesystem';
  sourcePath: string;
};

type StorageBackupFile = {
  relativePath: string;
  data: Buffer;
  contentType?: string;
  modifiedAt?: string;
};

type StorageBackupTarget = {
  key: Exclude<BackupTargetKey, 'database'>;
  targetType: 'directory';
  sourceMode: 'storage-adapter';
  sourcePath: string;
  storage: BackupTargetStorageInfo;
  listFiles: () => Promise<StorageBackupFile[]>;
  restoreFiles: (files: StorageBackupFile[]) => Promise<void>;
};

type BackupTarget = FilesystemBackupTarget | StorageBackupTarget;

const BACKUP_SCHEMA_VERSION = 2;

function nowIso(): string {
  return new Date().toISOString();
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

function backupIdFromDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `backup_${y}${m}${d}_${hh}${mm}${ss}_${randomSuffix()}`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function localAppDataRoot(): string {
  return process.env.LOCALAPPDATA || process.cwd();
}

function resolveBackupRoot(): string {
  return path.resolve(
    process.env.REY30_BACKUP_ROOT || path.join(localAppDataRoot(), 'REY30_backups')
  );
}

function parseLocalDatabaseFilePath(urlValue: string): string | null {
  if (!urlValue || !urlValue.startsWith('file:')) return null;
  const rawPath = urlValue.slice('file:'.length);
  if (!rawPath.trim()) return null;
  return path.resolve(process.cwd(), rawPath);
}

function resolveDatabasePath(): string | null {
  const explicitBackupPath = process.env.REY30_DATABASE_BACKUP_PATH?.trim();
  if (explicitBackupPath) {
    return path.resolve(explicitBackupPath);
  }

  const parsed = parseLocalDatabaseFilePath(
    process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || ''
  );
  if (parsed) return parsed;

  const fallbackCandidates = [
    path.resolve(process.cwd(), 'prisma', 'prisma', 'dev.db'),
    path.resolve(process.cwd(), 'prisma', 'dev.db'),
  ];
  return fallbackCandidates.find((candidate) => existsSync(candidate)) || null;
}

function describeStorageSource(key: string, info: StorageAdapterInfo): string {
  if (info.root) return info.root;
  if (info.storeName) return `${key}://${info.storeName}`;
  return `${key}://unconfigured`;
}

function toStorageMetadata(info: StorageAdapterInfo): BackupTargetStorageInfo {
  return {
    backend: info.backend,
    scope: info.scope,
    root: info.root,
    storeName: info.storeName,
  };
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  }

  if (await pathExists(root)) {
    await walk(root);
  }

  files.sort();
  return files;
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function readManifest(backupId: string): Promise<{ backupDir: string; manifest: BackupManifest }> {
  const backupDir = path.join(resolveBackupRoot(), backupId);
  const manifestPath = path.join(backupDir, 'manifest.json');
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as BackupManifest;
  return { backupDir, manifest };
}

async function buildItemForFilesystemTarget(
  target: FilesystemBackupTarget,
  payloadRoot: string
): Promise<BackupItem> {
  const exists = await pathExists(target.sourcePath);
  const payloadPath = `payload/${target.key}`;

  if (!exists) {
    return {
      key: target.key,
      targetType: target.targetType,
      sourcePath: target.sourcePath,
      payloadPath,
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      files: [],
      sourceMode: target.sourceMode,
    };
  }

  const targetPayloadRoot = path.join(payloadRoot, target.key);
  await mkdir(path.dirname(targetPayloadRoot), { recursive: true });

  if (target.targetType === 'file') {
    const sourceName = path.basename(target.sourcePath);
    const payloadFile = path.join(targetPayloadRoot, sourceName);
    await mkdir(path.dirname(payloadFile), { recursive: true });
    await cp(target.sourcePath, payloadFile, { force: true });

    const fileStat = await stat(payloadFile);
    const relativePath = `${payloadPath}/${sourceName}`.replace(/\\/g, '/');
    return {
      key: target.key,
      targetType: target.targetType,
      sourcePath: target.sourcePath,
      payloadPath,
      exists: true,
      fileCount: 1,
      totalBytes: fileStat.size,
      files: [
        {
          relativePath,
          size: fileStat.size,
          sha256: await hashFile(payloadFile),
        },
      ],
      sourceMode: target.sourceMode,
    };
  }

  await cp(target.sourcePath, targetPayloadRoot, { recursive: true, force: true });
  const files = await listFilesRecursive(targetPayloadRoot);
  const entries: BackupFileEntry[] = [];
  let totalBytes = 0;

  for (const relative of files) {
    const absolute = path.join(targetPayloadRoot, relative);
    const fileStat = await stat(absolute);
    totalBytes += fileStat.size;
    const sha256 = await hashFile(absolute);
    entries.push({
      relativePath: `${payloadPath}/${relative}`.replace(/\\/g, '/'),
      size: fileStat.size,
      sha256,
    });
  }

  return {
    key: target.key,
    targetType: target.targetType,
    sourcePath: target.sourcePath,
    payloadPath,
    exists: true,
    fileCount: entries.length,
    totalBytes,
    files: entries,
    sourceMode: target.sourceMode,
  };
}

async function buildItemForStorageTarget(
  target: StorageBackupTarget,
  payloadRoot: string
): Promise<BackupItem> {
  const payloadPath = `payload/${target.key}`;
  const targetPayloadRoot = path.join(payloadRoot, target.key);
  const files = await target.listFiles();

  if (files.length === 0) {
    return {
      key: target.key,
      targetType: target.targetType,
      sourcePath: target.sourcePath,
      payloadPath,
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      files: [],
      sourceMode: target.sourceMode,
      storage: target.storage,
    };
  }

  const entries: BackupFileEntry[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const payloadFile = path.join(targetPayloadRoot, file.relativePath);
    await mkdir(path.dirname(payloadFile), { recursive: true });
    await writeFile(payloadFile, file.data);
    const sha256 = crypto.createHash('sha256').update(file.data).digest('hex');
    totalBytes += file.data.byteLength;
    entries.push({
      relativePath: `${payloadPath}/${file.relativePath}`.replace(/\\/g, '/'),
      size: file.data.byteLength,
      sha256,
    });
  }

  return {
    key: target.key,
    targetType: target.targetType,
    sourcePath: target.sourcePath,
    payloadPath,
    exists: true,
    fileCount: entries.length,
    totalBytes,
    files: entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    sourceMode: target.sourceMode,
    storage: target.storage,
  };
}

async function buildItemForTarget(target: BackupTarget, payloadRoot: string): Promise<BackupItem> {
  if (target.sourceMode === 'filesystem') {
    return buildItemForFilesystemTarget(target, payloadRoot);
  }

  return buildItemForStorageTarget(target, payloadRoot);
}

async function collectPayloadFilesForRestore(item: BackupItem, backupDir: string): Promise<StorageBackupFile[]> {
  const payloadRoot = path.join(backupDir, item.payloadPath);
  const relativeFiles = await listFilesRecursive(payloadRoot);
  return Promise.all(
    relativeFiles.map(async (relativePath) => {
      const absolutePath = path.join(payloadRoot, relativePath);
      const data = await readFile(absolutePath);
      return {
        relativePath,
        data,
      };
    })
  );
}

function parsePackageBackupDocument(
  relativePath: string,
  raw: string
): { relativePath: string; manifest: StoredPackageManifest } {
  const parsed = JSON.parse(raw) as
    | { relativePath?: unknown; manifest?: unknown }
    | StoredPackageManifest;

  if (
    parsed &&
    typeof parsed === 'object' &&
    'manifest' in parsed &&
    parsed.manifest &&
    typeof parsed.manifest === 'object'
  ) {
    return {
      relativePath:
        typeof parsed.relativePath === 'string' && parsed.relativePath.trim()
          ? parsed.relativePath
          : relativePath,
      manifest: parsed.manifest as StoredPackageManifest,
    };
  }

  return {
    relativePath,
    manifest: parsed as StoredPackageManifest,
  };
}

function resolveTargets(): BackupTarget[] {
  const scriptInfo = getScriptStorageInfo();
  const galleryInfo = getGalleryStorageInfo();
  const packageInfo = getPackageStorageInfo();
  const targets: BackupTarget[] = [
    {
      key: 'scripts',
      targetType: 'directory',
      sourceMode: 'storage-adapter',
      sourcePath: describeStorageSource('scripts', scriptInfo),
      storage: toStorageMetadata(scriptInfo),
      listFiles: async () => {
        const scripts = await listStoredScripts();
        return scripts.map((script) => ({
          relativePath: script.relativePath,
          data: Buffer.from(script.content, 'utf8'),
          modifiedAt: script.modifiedAt,
          contentType: 'text/plain; charset=utf-8',
        }));
      },
      restoreFiles: async (files) => {
        const desired = new Set(files.map((file) => file.relativePath));
        const current = await listStoredScripts();
        await Promise.all(
          current
            .filter((item) => !desired.has(item.relativePath))
            .map((item) => deleteStoredScript(item.relativePath))
        );
        await Promise.all(
          files.map((file) =>
            upsertStoredScript(file.relativePath, file.data.toString('utf8'))
          )
        );
      },
    },
    {
      key: 'gallery',
      targetType: 'directory',
      sourceMode: 'storage-adapter',
      sourcePath: describeStorageSource('gallery', galleryInfo),
      storage: toStorageMetadata(galleryInfo),
      listFiles: async () => {
        const items = await listStoredGalleryFiles();
        const files: Array<StorageBackupFile | null> = await Promise.all(
          items.map(async (item) => {
            const content = await readStoredGalleryFile(item.relativePath);
            if (!content) return null;
            return {
              relativePath: item.relativePath,
              data: content.buffer,
              modifiedAt: content.metadata.modifiedAt,
              contentType: content.metadata.contentType,
            } satisfies StorageBackupFile;
          })
        );

        return files.filter((file): file is StorageBackupFile => Boolean(file));
      },
      restoreFiles: async (files) => {
        const desired = new Set(files.map((file) => file.relativePath));
        const current = await listStoredGalleryFiles();
        await Promise.all(
          current
            .filter((item) => !desired.has(item.relativePath))
            .map((item) => deleteStoredGalleryFile(item.relativePath))
        );
        await Promise.all(
          files.map((file) =>
            upsertStoredGalleryFile({
              relativePath: file.relativePath,
              data: file.data,
              contentType: file.contentType,
            })
          )
        );
      },
    },
    {
      key: 'packages',
      targetType: 'directory',
      sourceMode: 'storage-adapter',
      sourcePath: describeStorageSource('packages', packageInfo),
      storage: toStorageMetadata(packageInfo),
      listFiles: async () => {
        const packages = await listStoredPackages();
        return packages.map((record) => ({
          relativePath: record.relativePath,
          data: Buffer.from(
            serializeStoredPackageDocument({
              relativePath: record.relativePath,
              manifest: record.package,
            }),
            'utf8'
          ),
          modifiedAt: record.modifiedAt,
          contentType: 'application/json',
        }));
      },
      restoreFiles: async (files) => {
        const desired = new Set(files.map((file) => file.relativePath));
        const current = await listStoredPackages();
        await Promise.all(
          current
            .filter((item) => !desired.has(item.relativePath))
            .map((item) => deleteStoredPackage(item.relativePath))
        );
        await Promise.all(
          files.map((file) => {
            const document = parsePackageBackupDocument(
              file.relativePath,
              file.data.toString('utf8')
            );
            return restoreStoredPackageDocument(document);
          })
        );
      },
    },
  ];

  const databasePath = resolveDatabasePath();
  if (databasePath) {
    targets.unshift({
      key: 'database',
      targetType: 'file',
      sourceMode: 'filesystem',
      sourcePath: databasePath,
    });
  }

  return targets;
}

function resolveTargetForRestore(item: BackupItem): BackupTarget {
  const currentTargets = resolveTargets();
  const match = currentTargets.find((target) => target.key === item.key);
  if (match) return match;

  return {
    key: item.key,
    targetType: item.targetType,
    sourceMode: 'filesystem',
    sourcePath: item.sourcePath,
  };
}

export async function createBackup(note = ''): Promise<BackupSummary> {
  const backupRoot = resolveBackupRoot();
  const backupId = backupIdFromDate();
  const backupDir = path.join(backupRoot, backupId);
  const payloadRoot = path.join(backupDir, 'payload');
  await mkdir(payloadRoot, { recursive: true });

  const targets = resolveTargets();
  const items: BackupItem[] = [];
  for (const target of targets) {
    items.push(await buildItemForTarget(target, payloadRoot));
  }

  const totals = items.reduce(
    (acc, item) => {
      acc.items += 1;
      acc.files += item.fileCount;
      acc.bytes += item.totalBytes;
      return acc;
    },
    { items: 0, files: 0, bytes: 0 }
  );

  const manifest: BackupManifest = {
    id: backupId,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: nowIso(),
    note,
    release: getReleaseInfo(),
    backupRoot,
    totals,
    items,
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    backupId,
    backupDir,
    manifestPath,
    createdAt: manifest.createdAt,
    totals,
    note,
  };
}

export async function listBackups(limit = 25): Promise<Array<{
  backupId: string;
  createdAt: string;
  totals: BackupManifest['totals'];
  note: string;
  schemaVersion: number;
}>> {
  const backupRoot = resolveBackupRoot();
  await mkdir(backupRoot, { recursive: true });
  const entries = await readdir(backupRoot, { withFileTypes: true });

  const manifests: Array<{
    backupId: string;
    createdAt: string;
    totals: BackupManifest['totals'];
    note: string;
    schemaVersion: number;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('backup_')) continue;
    const manifestPath = path.join(backupRoot, entry.name, 'manifest.json');
    if (!(await pathExists(manifestPath))) continue;
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as BackupManifest;
    manifests.push({
      backupId: manifest.id,
      createdAt: manifest.createdAt,
      totals: manifest.totals,
      note: manifest.note,
      schemaVersion: manifest.schemaVersion,
    });
  }

  manifests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return manifests.slice(0, Math.max(1, limit));
}

export async function verifyBackup(backupId: string): Promise<BackupVerifyResult> {
  const { backupDir, manifest } = await readManifest(backupId);
  const mismatches: BackupVerifyResult['mismatches'] = [];
  let checkedFiles = 0;

  for (const item of manifest.items) {
    for (const file of item.files) {
      const backupFilePath = path.join(backupDir, file.relativePath);
      if (!(await pathExists(backupFilePath))) {
        mismatches.push({
          file: file.relativePath,
          expected: file.sha256,
          received: 'missing',
        });
        continue;
      }
      const received = await hashFile(backupFilePath);
      checkedFiles += 1;
      if (received !== file.sha256) {
        mismatches.push({
          file: file.relativePath,
          expected: file.sha256,
          received,
        });
      }
    }
  }

  return {
    backupId,
    ok: mismatches.length === 0,
    checkedFiles,
    failedFiles: mismatches.length,
    mismatches,
  };
}

export async function restoreBackup(options: {
  backupId: string;
  dryRun?: boolean;
  confirm?: string;
  skipVerify?: boolean;
}): Promise<RestoreResult> {
  const dryRun = options.dryRun !== false;
  const { backupId } = options;
  const { backupDir, manifest } = await readManifest(backupId);
  const verified = options.skipVerify
    ? {
        backupId,
        ok: true,
        checkedFiles: 0,
        failedFiles: 0,
        mismatches: [],
      }
    : await verifyBackup(backupId);

  if (!verified.ok && !dryRun) {
    throw new Error('Backup verification failed. Restore aborted.');
  }

  const operations = manifest.items
    .filter((item) => item.exists)
    .map((item) => ({
      key: item.key,
      targetType: item.targetType,
      from: path.join(backupDir, item.payloadPath),
      to: item.sourcePath,
    }));

  if (dryRun) {
    return {
      backupId,
      dryRun: true,
      verified,
      operations,
      historyDir: null,
    };
  }

  if (options.confirm !== 'RESTORE_NOW') {
    throw new Error('Confirm token required for restore. Use confirm=RESTORE_NOW.');
  }

  const historyDir = path.join(resolveBackupRoot(), '_restore_history', `${backupId}_${Date.now()}`);
  await mkdir(historyDir, { recursive: true });

  for (const item of manifest.items.filter((entry) => entry.exists)) {
    const target = resolveTargetForRestore(item);

    if (target.sourceMode === 'filesystem') {
      const targetExists = await pathExists(target.sourcePath);
      if (targetExists) {
        const historyTarget = path.join(historyDir, target.key);
        await mkdir(path.dirname(historyTarget), { recursive: true });
        if (target.targetType === 'directory') {
          await cp(target.sourcePath, historyTarget, { recursive: true, force: true });
        } else {
          await mkdir(path.dirname(historyTarget), { recursive: true });
          await cp(target.sourcePath, historyTarget, { force: true });
        }
      }

      const payloadPath = path.join(backupDir, item.payloadPath);
      if (target.targetType === 'directory') {
        await rm(target.sourcePath, { recursive: true, force: true });
        await mkdir(path.dirname(target.sourcePath), { recursive: true });
        await cp(payloadPath, target.sourcePath, { recursive: true, force: true });
      } else {
        const fileName = path.basename(target.sourcePath);
        const backupFilePath = path.join(payloadPath, fileName);
        await mkdir(path.dirname(target.sourcePath), { recursive: true });
        await cp(backupFilePath, target.sourcePath, { force: true });
      }
      continue;
    }

    const payloadFiles = await collectPayloadFilesForRestore(item, backupDir);
    const historyTarget = path.join(historyDir, target.key);
    await mkdir(historyTarget, { recursive: true });
    for (const file of payloadFiles) {
      const historyFilePath = path.join(historyTarget, file.relativePath);
      await mkdir(path.dirname(historyFilePath), { recursive: true });
      await writeFile(historyFilePath, file.data);
    }
    await target.restoreFiles(payloadFiles);
  }

  return {
    backupId,
    dryRun: false,
    verified,
    operations,
    historyDir,
  };
}
