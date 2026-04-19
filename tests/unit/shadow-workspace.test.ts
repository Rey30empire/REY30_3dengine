import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyProjectToShadow } from '../../scripts/shadow-workspace.mjs';

async function ensureFile(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

describe('copyProjectToShadow', () => {
  it('keeps nested source folders named download while excluding the top-level download directory', async () => {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-shadow-source-'));
    const shadowRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-shadow-dest-'));

    try {
      const sourceRoute = path.join(
        sourceRoot,
        'src',
        'app',
        'api',
        'character',
        'presets',
        'download',
        'route.ts'
      );
      const topLevelArtifact = path.join(sourceRoot, 'download', 'artifact.txt');

      await ensureFile(topLevelArtifact, 'artifact');
      await ensureFile(sourceRoute, 'export const GET = () => new Response("ok");\n');

      await copyProjectToShadow(sourceRoot, shadowRoot);

      await expect(
        readFile(
          path.join(shadowRoot, 'src', 'app', 'api', 'character', 'presets', 'download', 'route.ts'),
          'utf8'
        )
      ).resolves.toContain('export const GET');
      await expect(access(path.join(shadowRoot, 'download', 'artifact.txt'))).rejects.toThrow();
    } finally {
      await rm(sourceRoot, { recursive: true, force: true }).catch(() => undefined);
      await rm(shadowRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
