import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

const ORIGINAL_EXPORT_ROOT = process.env.REY30_EXPORT_ROOT;
const ORIGINAL_ASSET_ROOT = process.env.REY30_ASSET_ROOT;
const cleanupDirs = new Set<string>();

async function withTempRoots<T>(run: (inputPath: string, exportRoot: string) => Promise<T>) {
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-exporters-assets-'));
  const exportRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-exporters-out-'));
  cleanupDirs.add(assetRoot);
  cleanupDirs.add(exportRoot);
  process.env.REY30_ASSET_ROOT = assetRoot;
  process.env.REY30_EXPORT_ROOT = exportRoot;

  const gltfPath = path.join(assetRoot, 'demo', 'mesh.gltf');
  await rm(path.dirname(gltfPath), { recursive: true, force: true }).catch(() => undefined);
  await mkdir(path.dirname(gltfPath), { recursive: true });
  await writeFile(
    gltfPath,
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
    }),
    'utf-8'
  );

  try {
    return await run(gltfPath, exportRoot);
  } finally {
    if (ORIGINAL_ASSET_ROOT === undefined) {
      delete process.env.REY30_ASSET_ROOT;
    } else {
      process.env.REY30_ASSET_ROOT = ORIGINAL_ASSET_ROOT;
    }
    if (ORIGINAL_EXPORT_ROOT === undefined) {
      delete process.env.REY30_EXPORT_ROOT;
    } else {
      process.env.REY30_EXPORT_ROOT = ORIGINAL_EXPORT_ROOT;
    }
  }
}

describe('exporters route', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await Promise.all(
      Array.from(cleanupDirs).map(async (dir) => {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanupDirs.delete(dir);
      })
    );
  });

  it('creates a unique export workspace and a manifest with checksum metadata', async () => {
    await withTempRoots(async (inputPath) => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const { POST } = await import('@/app/api/exporters/route');

      const firstResponse = await POST(
        new NextRequest('http://localhost/api/exporters', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            inputPath,
            target: 'gltf',
            preset: 'desktop',
          }),
        })
      );
      const firstPayload = await firstResponse.json();

      const secondResponse = await POST(
        new NextRequest('http://localhost/api/exporters', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            inputPath,
            target: 'gltf',
            preset: 'desktop',
          }),
        })
      );
      const secondPayload = await secondResponse.json();

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstPayload.exportPath).not.toBe(secondPayload.exportPath);
      expect(firstPayload.workspacePath).not.toBe(secondPayload.workspacePath);

      const manifestPath = path.isAbsolute(firstPayload.manifest)
        ? firstPayload.manifest
        : path.join(process.cwd(), firstPayload.manifest);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        target: string;
        workspaceId: string;
        workspacePath: string;
        output: string;
        outputSize: number;
        outputChecksum: string;
      };

      expect(manifest.target).toBe('gltf');
      expect(manifest.workspaceId).toBeTruthy();
      expect(manifest.workspacePath).toBe(firstPayload.workspacePath);
      expect(manifest.output).toBe(firstPayload.exportPath);
      expect(manifest.outputSize).toBeGreaterThan(0);
      expect(manifest.outputChecksum).toMatch(/^[a-f0-9]{64}$/i);
    });
  });
});
