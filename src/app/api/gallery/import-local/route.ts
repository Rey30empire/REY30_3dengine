import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  DEFAULT_GALLERY_SUBFOLDERS,
  getInputGalleryRoot,
  sanitizeGallerySegment,
} from '../shared';
import {
  getGalleryStorageInfo,
  readStoredGalleryFile,
  upsertStoredGalleryFile,
} from '@/lib/server/gallery-storage';

async function ensureInputRoot() {
  const inputRoot = getInputGalleryRoot();
  await fs.mkdir(inputRoot, { recursive: true });
  await Promise.all(
    DEFAULT_GALLERY_SUBFOLDERS.map((folder) =>
      fs.mkdir(path.join(inputRoot, folder), { recursive: true })
    )
  );
  return inputRoot;
}

async function listFilesRecursive(baseDir: string, rel = ''): Promise<string[]> {
  const currentDir = path.join(baseDir, rel);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(baseDir, relPath);
      files.push(...nested);
      continue;
    }
    files.push(relPath);
  }

  return files;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const inputRoot = await ensureInputRoot();
    const storage = getGalleryStorageInfo();

    return NextResponse.json({
      inputRoot,
      subfolders: DEFAULT_GALLERY_SUBFOLDERS,
      storage,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][import-local][GET] failed:', error);
    return NextResponse.json({ error: 'Failed to read import config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const inputRoot = await ensureInputRoot();

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const overwrite = Boolean(body?.overwrite);
    const move = Boolean(body?.move);

    const files = await listFilesRecursive(inputRoot);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const relPath of files) {
      const normalizedRelativePath = relPath
        .split(path.sep)
        .map((segment) => sanitizeGallerySegment(segment))
        .join('/');
      const sourcePath = path.join(inputRoot, relPath);

      try {
        const exists = await readStoredGalleryFile(normalizedRelativePath);
        if (exists && !overwrite) {
          skipped += 1;
          continue;
        }

        const buffer = await fs.readFile(sourcePath);
        await upsertStoredGalleryFile({
          relativePath: normalizedRelativePath,
          data: buffer,
        });

        if (move) {
          await fs.unlink(sourcePath).catch(() => undefined);
        }

        imported += 1;
      } catch {
        errors += 1;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      storage: getGalleryStorageInfo(),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][import-local][POST] failed:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
