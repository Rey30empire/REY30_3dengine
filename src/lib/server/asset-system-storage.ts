import { AsyncLocalStorage } from 'async_hooks';
import { promises as fs } from 'fs';
import path from 'path';

const ASSET_SYSTEM_NAMESPACE_DIR = '.rey30';
const ASSET_SYSTEM_LOCK_FILE_NAME = 'asset-system.lock';
const ASSET_SYSTEM_LOCK_RETRY_MS = 25;
const ASSET_SYSTEM_LOCK_TIMEOUT_MS = 5_000;
const ASSET_SYSTEM_LOCK_STALE_MS = 30_000;
const mutationContext = new AsyncLocalStorage<{ active: true }>();

let assetSystemMutationQueue: Promise<void> = Promise.resolve();

export function getAssetSystemRoot() {
  return process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets');
}

export function getAssetSystemStatePath(fileName: string) {
  return path.join(getAssetSystemRoot(), ASSET_SYSTEM_NAMESPACE_DIR, fileName);
}

export function getLegacyAssetSystemStatePath(fileName: string) {
  return path.join(getAssetSystemRoot(), '..', fileName);
}

function createAtomicTempPath(targetPath: string) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 10)}`;
  return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${suffix}.tmp`);
}

export async function readJsonFileAtPath<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFileAtomic(targetPath: string, value: unknown) {
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

export async function runAssetSystemMutation<T>(work: () => Promise<T>): Promise<T> {
  if (mutationContext.getStore()?.active) {
    return work();
  }

  const next = assetSystemMutationQueue.then(() =>
    mutationContext.run({ active: true }, async () => {
      const release = await acquireAssetSystemFileLock();
      try {
        return await work();
      } finally {
        await release();
      }
    })
  );
  assetSystemMutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function acquireAssetSystemFileLock() {
  const lockPath = getAssetSystemStatePath(ASSET_SYSTEM_LOCK_FILE_NAME);
  const deadline = Date.now() + ASSET_SYSTEM_LOCK_TIMEOUT_MS;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify(
          {
            pid: process.pid,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf-8'
      );
      await handle.close();

      return async () => {
        await fs.rm(lockPath, { force: true }).catch(() => undefined);
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'EEXIST') {
        throw error;
      }

      const stats = await fs.stat(lockPath).catch(() => null);
      if (stats && Date.now() - stats.mtimeMs > ASSET_SYSTEM_LOCK_STALE_MS) {
        await fs.rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for asset-system lock: ${lockPath}`);
      }

      await new Promise((resolve) => setTimeout(resolve, ASSET_SYSTEM_LOCK_RETRY_MS));
    }
  }
}
