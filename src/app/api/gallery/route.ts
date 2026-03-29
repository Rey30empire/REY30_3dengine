// ============================================
// Gallery API (persistent file storage)
// ============================================

import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const ROOT =
  process.env.REY30_GALLERY_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.cwd(), 'REY30_gallery_store');

type GalleryKind =
  | 'model'
  | 'texture'
  | 'animation'
  | 'scene'
  | 'character'
  | 'video'
  | 'audio'
  | 'script'
  | 'other';

interface GalleryItem {
  name: string;
  url: string;
  relativePath: string;
  filePath: string;
  size: number;
  modifiedAt: string;
  kind: GalleryKind;
  category: string;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function inferKind(fileName: string): GalleryKind {
  const ext = path.extname(fileName).toLowerCase();
  if (['.glb', '.gltf', '.fbx', '.obj', '.stl'].includes(ext)) return 'model';
  if (['.png', '.jpg', '.jpeg', '.webp', '.tga', '.exr'].includes(ext)) return 'texture';
  if (['.anim', '.bvh'].includes(ext)) return 'animation';
  if (['.scene', '.json'].includes(ext)) return 'scene';
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
  if (['.ts', '.js', '.lua'].includes(ext)) return 'script';
  if (['.chr', '.avatar'].includes(ext)) return 'character';
  return 'other';
}

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

async function listFilesRecursive(baseDir: string, rel = ''): Promise<GalleryItem[]> {
  const currentDir = path.join(baseDir, rel);
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const items: GalleryItem[] = [];

  for (const entry of entries) {
    const relPath = path.join(rel, entry.name);
    const absPath = path.join(baseDir, relPath);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(baseDir, relPath);
      items.push(...nested);
      continue;
    }

    const stats = await fs.stat(absPath);
    const category = relPath.includes(path.sep) ? relPath.split(path.sep)[0] : 'general';
    const relPosix = relPath.split(path.sep).join('/');
    items.push({
      name: entry.name,
      url: `/api/gallery/file?path=${encodeURIComponent(relPosix)}`,
      relativePath: relPosix,
      filePath: absPath,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      kind: inferKind(entry.name),
      category,
    });
  }

  return items;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    await ensureRoot();
    const items = await listFilesRecursive(ROOT);
    items.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    return NextResponse.json({ items });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][GET] failed:', error);
    return NextResponse.json({ error: 'Failed to load gallery', items: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    await ensureRoot();
    const formData = await request.formData();
    const requestedCategory = sanitizeSegment(String(formData.get('category') || 'general'));
    const categoryDir = path.join(ROOT, requestedCategory);
    await fs.mkdir(categoryDir, { recursive: true });

    const inputFiles = formData.getAll('files').filter((entry) => entry instanceof File) as File[];
    if (inputFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const written: GalleryItem[] = [];
    for (const file of inputFiles) {
      const safeName = `${Date.now()}_${sanitizeSegment(file.name)}`;
      const absPath = path.join(categoryDir, safeName);
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(absPath, fileBuffer);
      const stats = await fs.stat(absPath);

      written.push({
        name: safeName,
        url: `/api/gallery/file?path=${encodeURIComponent(`${requestedCategory}/${safeName}`)}`,
        relativePath: `${requestedCategory}/${safeName}`,
        filePath: absPath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        kind: inferKind(safeName),
        category: requestedCategory,
      });
    }

    return NextResponse.json({ items: written });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][POST] failed:', error);
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const filePathParam = searchParams.get('path');

    if (!filePathParam) {
      return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
    }

    const normalized = filePathParam.replace(/^\/+/, '');
    const absPath = path.resolve(ROOT, normalized);
    const relative = path.relative(ROOT, absPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    await fs.unlink(absPath);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][DELETE] failed:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
