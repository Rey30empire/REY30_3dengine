import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  deleteStoredAddon,
  getAddonStorageInfo,
  listAddonInstallSources,
  listStoredAddons,
  setStoredAddonEnabled,
  upsertStoredAddon,
} from '@/lib/server/addon-storage';
import { isInvalidAddonPathError } from '@/app/api/addons/shared';

function toAddonPath(filePath: string, backend: 'filesystem' | 'netlify-blobs') {
  return backend === 'filesystem'
    ? path.relative(process.cwd(), filePath).replace(/\\/g, '/')
    : filePath;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const [addons, packages] = await Promise.all([listStoredAddons(), listAddonInstallSources()]);
    return NextResponse.json({
      success: true,
      addons: addons.map((record) => ({
        ...record,
        path: toAddonPath(record.filePath, record.storage.backend),
      })),
      packages: packages.map((record) => ({
        name: record.package.name,
        relativePath: record.relativePath,
        kinds: record.package.kinds,
        assetCount: record.package.assets.length,
        storage: record.storage,
      })),
      storage: getAddonStorageInfo(),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as Parameters<typeof upsertStoredAddon>[0];
    if (!body.name?.trim() && !body.sourcePackagePath?.trim()) {
      return NextResponse.json(
        { success: false, error: 'name o sourcePackagePath es requerido' },
        { status: 400 }
      );
    }

    const stored = await upsertStoredAddon(body);
    return NextResponse.json({
      success: true,
      addon: stored.addon,
      path: toAddonPath(stored.filePath, stored.storage.backend),
      storage: stored.storage,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isInvalidAddonPathError(error)) {
      return NextResponse.json({ success: false, error: 'Ruta de addon invalida' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as { id?: string; enabled?: boolean };
    if (!body.id?.trim() || typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'id y enabled son requeridos' },
        { status: 400 }
      );
    }

    const stored = await setStoredAddonEnabled(body.id, body.enabled);
    return NextResponse.json({
      success: true,
      addon: stored.addon,
      path: toAddonPath(stored.filePath, stored.storage.backend),
      storage: stored.storage,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isInvalidAddonPathError(error)) {
      return NextResponse.json({ success: false, error: 'Ruta de addon invalida' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id?.trim()) {
      return NextResponse.json({ success: false, error: 'id es requerido' }, { status: 400 });
    }

    await deleteStoredAddon(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (isInvalidAddonPathError(error)) {
      return NextResponse.json({ success: false, error: 'Ruta de addon invalida' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
