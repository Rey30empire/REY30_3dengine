// ============================================
// Packages API - persist gallery packages to disk
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type PackageAsset = { id: string; name: string; type: string; path: string };
type RequestBody = {
  name?: string;
  kinds?: string[];
  assets?: PackageAsset[];
};

const ROOT =
  process.env.REY30_PACKAGE_ROOT ||
  path.join(process.cwd(), 'download', 'packages');

function sanitizeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    const rawName = body.name?.trim();
    if (!rawName) {
      return NextResponse.json({ success: false, error: 'name es requerido' }, { status: 400 });
    }

    const safeName = sanitizeName(rawName) || 'Package';
    await fs.mkdir(ROOT, { recursive: true });

    const fileName = `${safeName}.package.json`;
    const absPath = path.join(ROOT, fileName);

    const pkg = {
      name: safeName,
      kinds: Array.isArray(body.kinds) ? body.kinds : [],
      assets: Array.isArray(body.assets) ? body.assets : [],
      createdAt: new Date().toISOString(),
      version: 1,
    };

    await fs.writeFile(absPath, JSON.stringify(pkg, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      name: fileName,
      path: path.relative(process.cwd(), absPath).replace(/\\/g, '/'),
      package: pkg,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
