import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createBackupPost } from '@/app/api/ops/backups/route';
import { POST as verifyBackupPost } from '@/app/api/ops/backups/verify/route';
import { POST as restoreBackupPost } from '@/app/api/ops/backups/restore/route';

describe('Ops backup APIs', () => {
  it('creates, verifies and restores backup using dry-run + confirmed restore', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-backup-test-'));
    const backupRoot = path.join(tempRoot, 'backups');
    const scriptsRoot = path.join(tempRoot, 'scripts');
    const galleryRoot = path.join(tempRoot, 'gallery');
    const prismaRoot = path.join(tempRoot, 'prisma');
    const dbPath = path.join(prismaRoot, 'test.db');

    await mkdir(scriptsRoot, { recursive: true });
    await mkdir(galleryRoot, { recursive: true });
    await mkdir(prismaRoot, { recursive: true });
    await writeFile(path.join(scriptsRoot, 'GameLoop.ts'), 'export const loop = 1;\n', 'utf8');
    await writeFile(path.join(galleryRoot, 'texture.png'), 'fake-image-bytes', 'utf8');
    await writeFile(dbPath, 'sqlite-placeholder', 'utf8');

    const previous = {
      REY30_BACKUP_ROOT: process.env.REY30_BACKUP_ROOT,
      REY30_SCRIPT_ROOT: process.env.REY30_SCRIPT_ROOT,
      REY30_GALLERY_ROOT: process.env.REY30_GALLERY_ROOT,
      REY30_OPS_TOKEN: process.env.REY30_OPS_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    process.env.REY30_BACKUP_ROOT = backupRoot;
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;
    process.env.REY30_GALLERY_ROOT = galleryRoot;
    process.env.REY30_OPS_TOKEN = 'test-ops-token';
    process.env.DATABASE_URL = `file:${dbPath}`;

    const headers = { 'x-rey30-ops-token': 'test-ops-token' };

    try {
      const createResponse = await createBackupPost(
        new NextRequest('http://localhost/api/ops/backups', {
          method: 'POST',
          headers,
          body: JSON.stringify({ note: 'test backup' }),
        })
      );
      expect(createResponse.status).toBe(200);
      const createPayload = await createResponse.json();
      const backupId = String(createPayload.backup?.backupId || '');
      expect(backupId).toContain('backup_');

      const verifyResponse = await verifyBackupPost(
        new NextRequest('http://localhost/api/ops/backups/verify', {
          method: 'POST',
          headers,
          body: JSON.stringify({ backupId }),
        })
      );
      expect(verifyResponse.status).toBe(200);
      const verifyPayload = await verifyResponse.json();
      expect(verifyPayload.result.ok).toBe(true);
      expect(verifyPayload.result.checkedFiles).toBeGreaterThan(0);

      await writeFile(path.join(scriptsRoot, 'GameLoop.ts'), 'export const loop = 999;\n', 'utf8');

      const dryRunResponse = await restoreBackupPost(
        new NextRequest('http://localhost/api/ops/backups/restore', {
          method: 'POST',
          headers,
          body: JSON.stringify({ backupId, dryRun: true }),
        })
      );
      expect(dryRunResponse.status).toBe(200);
      const dryRunPayload = await dryRunResponse.json();
      expect(dryRunPayload.result.dryRun).toBe(true);
      expect(Array.isArray(dryRunPayload.result.operations)).toBe(true);

      const restoreResponse = await restoreBackupPost(
        new NextRequest('http://localhost/api/ops/backups/restore', {
          method: 'POST',
          headers,
          body: JSON.stringify({ backupId, dryRun: false, confirm: 'RESTORE_NOW' }),
        })
      );
      expect(restoreResponse.status).toBe(200);
      const restorePayload = await restoreResponse.json();
      expect(restorePayload.result.dryRun).toBe(false);
      expect(String(restorePayload.result.historyDir || '')).toContain('_restore_history');

      const restoredScript = await readFile(path.join(scriptsRoot, 'GameLoop.ts'), 'utf8');
      expect(restoredScript).toContain('loop = 1');
    } finally {
      process.env.REY30_BACKUP_ROOT = previous.REY30_BACKUP_ROOT;
      process.env.REY30_SCRIPT_ROOT = previous.REY30_SCRIPT_ROOT;
      process.env.REY30_GALLERY_ROOT = previous.REY30_GALLERY_ROOT;
      if (previous.REY30_OPS_TOKEN === undefined) {
        delete process.env.REY30_OPS_TOKEN;
      } else {
        process.env.REY30_OPS_TOKEN = previous.REY30_OPS_TOKEN;
      }
      process.env.DATABASE_URL = previous.DATABASE_URL;
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('backs up an external SQL dump file when DATABASE_URL is remote', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-backup-sql-test-'));
    const backupRoot = path.join(tempRoot, 'backups');
    const scriptsRoot = path.join(tempRoot, 'scripts');
    const galleryRoot = path.join(tempRoot, 'gallery');
    const dumpsRoot = path.join(tempRoot, 'db-dumps');
    const dumpPath = path.join(dumpsRoot, 'rey30.dump');

    await mkdir(scriptsRoot, { recursive: true });
    await mkdir(galleryRoot, { recursive: true });
    await mkdir(dumpsRoot, { recursive: true });
    await writeFile(path.join(scriptsRoot, 'GameLoop.ts'), 'export const loop = 2;\n', 'utf8');
    await writeFile(path.join(galleryRoot, 'texture.png'), 'fake-image-bytes-sql', 'utf8');
    await writeFile(dumpPath, 'postgres-placeholder-dump', 'utf8');

    const previous = {
      REY30_BACKUP_ROOT: process.env.REY30_BACKUP_ROOT,
      REY30_SCRIPT_ROOT: process.env.REY30_SCRIPT_ROOT,
      REY30_GALLERY_ROOT: process.env.REY30_GALLERY_ROOT,
      REY30_DATABASE_BACKUP_PATH: process.env.REY30_DATABASE_BACKUP_PATH,
      REY30_OPS_TOKEN: process.env.REY30_OPS_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    process.env.REY30_BACKUP_ROOT = backupRoot;
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;
    process.env.REY30_GALLERY_ROOT = galleryRoot;
    process.env.REY30_DATABASE_BACKUP_PATH = dumpPath;
    process.env.REY30_OPS_TOKEN = 'test-ops-token';
    process.env.DATABASE_URL = 'postgresql://rey30:secret@db.example.com:5432/rey30?schema=public';

    const headers = { 'x-rey30-ops-token': 'test-ops-token' };

    try {
      const createResponse = await createBackupPost(
        new NextRequest('http://localhost/api/ops/backups', {
          method: 'POST',
          headers,
          body: JSON.stringify({ note: 'external sql backup' }),
        })
      );
      expect(createResponse.status).toBe(200);
      const createPayload = await createResponse.json();
      const backupId = String(createPayload.backup?.backupId || '');
      expect(backupId).toContain('backup_');
      expect(createPayload.backup?.totals?.items).toBe(3);

      const verifyResponse = await verifyBackupPost(
        new NextRequest('http://localhost/api/ops/backups/verify', {
          method: 'POST',
          headers,
          body: JSON.stringify({ backupId }),
        })
      );
      expect(verifyResponse.status).toBe(200);
      const verifyPayload = await verifyResponse.json();
      expect(verifyPayload.result.ok).toBe(true);
      expect(verifyPayload.result.checkedFiles).toBeGreaterThan(0);
    } finally {
      process.env.REY30_BACKUP_ROOT = previous.REY30_BACKUP_ROOT;
      process.env.REY30_SCRIPT_ROOT = previous.REY30_SCRIPT_ROOT;
      process.env.REY30_GALLERY_ROOT = previous.REY30_GALLERY_ROOT;
      process.env.REY30_DATABASE_BACKUP_PATH = previous.REY30_DATABASE_BACKUP_PATH;
      if (previous.REY30_OPS_TOKEN === undefined) {
        delete process.env.REY30_OPS_TOKEN;
      } else {
        process.env.REY30_OPS_TOKEN = previous.REY30_OPS_TOKEN;
      }
      process.env.DATABASE_URL = previous.DATABASE_URL;
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
