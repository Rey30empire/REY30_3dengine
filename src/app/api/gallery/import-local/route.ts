import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const INPUT_ROOT =
  process.env.REY30_INPUT_GALLERY_ROOT ||
  path.join(process.cwd(), 'input_Galeria_Rey30');

const GALLERY_ROOT =
  process.env.REY30_GALLERY_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.cwd(), 'REY30_gallery_store');

const DEFAULT_SUBFOLDERS = [
  'personajes_3d',
  'escenas',
  'animaciones',
  'armas',
  'texturas',
  'audio',
  'video',
  'scripts',
  'otros',
];

async function ensureInputRoot() {
  await fs.mkdir(INPUT_ROOT, { recursive: true });
  await Promise.all(
    DEFAULT_SUBFOLDERS.map((folder) =>
      fs.mkdir(path.join(INPUT_ROOT, folder), { recursive: true })
    )
  );
}

async function ensureGalleryRoot() {
  await fs.mkdir(GALLERY_ROOT, { recursive: true });
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
    } else {
      files.push(relPath);
    }
  }

  return files;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    await ensureInputRoot();
    await ensureGalleryRoot();
    return NextResponse.json({
      subfolders: DEFAULT_SUBFOLDERS,
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
    await ensureInputRoot();
    await ensureGalleryRoot();

    const body = await request.json().catch(() => ({} as any));
    const overwrite = Boolean(body?.overwrite);
    const move = Boolean(body?.move);

    const files = await listFilesRecursive(INPUT_ROOT);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const relPath of files) {
      const src = path.join(INPUT_ROOT, relPath);
      const dest = path.join(GALLERY_ROOT, relPath);
      const destDir = path.dirname(dest);
      await fs.mkdir(destDir, { recursive: true });

      try {
        const exists = await fs
          .access(dest)
          .then(() => true)
          .catch(() => false);

        if (exists && !overwrite) {
          skipped += 1;
          continue;
        }

        if (move) {
          await fs.rename(src, dest);
        } else {
          await fs.copyFile(src, dest);
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
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][import-local][POST] failed:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
