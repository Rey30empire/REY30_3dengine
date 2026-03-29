import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as assetsGet, POST as assetsPost } from '@/app/api/assets/route';
import { GET as assetsFileGet } from '@/app/api/assets/file/route';
import { GET as materialsGet, POST as materialsPost } from '@/app/api/materials/route';
import {
  GET as modifierPresetsGet,
  POST as modifierPresetsPost,
} from '@/app/api/modifier-presets/route';
import { GET as galleryGet, POST as galleryPost } from '@/app/api/gallery/route';
import { GET as scriptsGet, POST as scriptsPost } from '@/app/api/scripts/route';
import { POST as scriptsCompilePost } from '@/app/api/scripts/compile/route';
import { POST as buildPost } from '@/app/api/build/route';
import { POST as exportersPost } from '@/app/api/exporters/route';
import { POST as packagesPost } from '@/app/api/packages/route';
import { POST as modelerPersistPost } from '@/app/api/modeler/persist/route';
import { POST as texturePaintPersistPost } from '@/app/api/texture-paint/persist/route';
import { POST as terminalPost } from '@/app/api/terminal/route';
import { GET as ollamaGet } from '@/app/api/ollama/route';
import { GET as vllmGet } from '@/app/api/vllm/route';
import { GET as llamacppGet } from '@/app/api/llamacpp/route';

describe('Security hardening', () => {
  it('blocks anonymous access to write-sensitive editor routes', async () => {
    const responses = await Promise.all([
      assetsGet(new NextRequest('http://localhost/api/assets')),
      assetsFileGet(
        new NextRequest(
          'http://localhost/api/assets/file?path=download/assets/texture/test.png'
        )
      ),
      materialsGet(new NextRequest('http://localhost/api/materials')),
      modifierPresetsGet(new NextRequest('http://localhost/api/modifier-presets')),
      assetsPost(
        new NextRequest('http://localhost/api/assets', {
          method: 'POST',
          body: JSON.stringify({ url: 'https://example.com/model.glb' }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      galleryGet(new NextRequest('http://localhost/api/gallery')),
      galleryPost(
        new NextRequest('http://localhost/api/gallery', {
          method: 'POST',
        })
      ),
      materialsPost(
        new NextRequest('http://localhost/api/materials', {
          method: 'POST',
          body: JSON.stringify({ name: 'test', material: { id: 'default' } }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      modifierPresetsPost(
        new NextRequest('http://localhost/api/modifier-presets', {
          method: 'POST',
          body: JSON.stringify({
            name: 'test',
            modifiers: [{ type: 'mirror_x', enabled: true }],
          }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      scriptsGet(new NextRequest('http://localhost/api/scripts')),
      scriptsPost(
        new NextRequest('http://localhost/api/scripts', {
          method: 'POST',
          body: JSON.stringify({ name: 'test_script.ts' }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      scriptsCompilePost(
        new NextRequest('http://localhost/api/scripts/compile', {
          method: 'POST',
          body: JSON.stringify({ content: 'export const x = 1;' }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      buildPost(
        new NextRequest('http://localhost/api/build', {
          method: 'POST',
          body: JSON.stringify({ target: 'web' }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      exportersPost(
        new NextRequest('http://localhost/api/exporters', {
          method: 'POST',
          body: JSON.stringify({ inputPath: 'public/logo.svg', target: 'gltf' }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      packagesPost(
        new NextRequest('http://localhost/api/packages', {
          method: 'POST',
          body: JSON.stringify({ name: 'DemoPackage' }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      modelerPersistPost(
        new NextRequest('http://localhost/api/modeler/persist', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Mesh',
            mesh: { vertices: [], faces: [] },
          }),
          headers: { 'content-type': 'application/json' },
        })
      ),
      texturePaintPersistPost(
        new NextRequest('http://localhost/api/texture-paint/persist', {
          method: 'POST',
          body: (() => {
            const formData = new FormData();
            formData.append(
              'file',
              new File([Uint8Array.from([1, 2, 3])], 'paint.png', { type: 'image/png' })
            );
            formData.append('name', 'Paint');
            formData.append('slot', 'albedo');
            formData.append('entityName', 'Cube');
            return formData;
          })(),
        })
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });
  it('blocks terminal API when disabled or remote access is not explicitly allowed', async () => {
    const previousEnable = process.env.REY30_ENABLE_TERMINAL_API;
    const previousRemote = process.env.REY30_ENABLE_TERMINAL_API_REMOTE;
    try {
      delete process.env.REY30_ENABLE_TERMINAL_API;
      delete process.env.REY30_ENABLE_TERMINAL_API_REMOTE;
      const disabledResponse = await terminalPost(
        new NextRequest('http://localhost/api/terminal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cmd: 'echo hi' }),
        })
      );
      expect(disabledResponse.status).toBe(404);
      process.env.REY30_ENABLE_TERMINAL_API = 'true';
      const remoteResponse = await terminalPost(
        new NextRequest('http://example.com/api/terminal', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cmd: 'echo hi' }),
        })
      );
      expect(remoteResponse.status).toBe(404);
    } finally {
      if (previousEnable === undefined) {
        delete process.env.REY30_ENABLE_TERMINAL_API;
      } else {
        process.env.REY30_ENABLE_TERMINAL_API = previousEnable;
      }
      if (previousRemote === undefined) {
        delete process.env.REY30_ENABLE_TERMINAL_API_REMOTE;
      } else {
        process.env.REY30_ENABLE_TERMINAL_API_REMOTE = previousRemote;
      }
    }
  });
  it('blocks anonymous local provider proxy routes', async () => {
    const responses = await Promise.all([
      ollamaGet(new NextRequest('http://localhost/api/ollama')),
      vllmGet(new NextRequest('http://localhost/api/vllm')),
      llamacppGet(new NextRequest('http://localhost/api/llamacpp')),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });
});

