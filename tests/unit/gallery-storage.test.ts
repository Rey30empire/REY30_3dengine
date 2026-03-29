import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteStoredGalleryFile,
  listStoredGalleryFiles,
  readStoredGalleryFile,
  upsertStoredGalleryFile,
} from '@/lib/server/gallery-storage';

describe('gallery storage', () => {
  const previousEnv = {
    REY30_GALLERY_STORAGE_BACKEND: process.env.REY30_GALLERY_STORAGE_BACKEND,
    REY30_GALLERY_ROOT: process.env.REY30_GALLERY_ROOT,
    NETLIFY: process.env.NETLIFY,
    CONTEXT: process.env.CONTEXT,
    DEPLOY_ID: process.env.DEPLOY_ID,
  };

  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-gallery-storage-'));
    process.env.REY30_GALLERY_STORAGE_BACKEND = 'filesystem';
    process.env.REY30_GALLERY_ROOT = tempRoot;
    delete process.env.NETLIFY;
    delete process.env.CONTEXT;
    delete process.env.DEPLOY_ID;
  });

  afterEach(async () => {
    if (previousEnv.REY30_GALLERY_STORAGE_BACKEND === undefined) {
      delete process.env.REY30_GALLERY_STORAGE_BACKEND;
    } else {
      process.env.REY30_GALLERY_STORAGE_BACKEND = previousEnv.REY30_GALLERY_STORAGE_BACKEND;
    }

    if (previousEnv.REY30_GALLERY_ROOT === undefined) {
      delete process.env.REY30_GALLERY_ROOT;
    } else {
      process.env.REY30_GALLERY_ROOT = previousEnv.REY30_GALLERY_ROOT;
    }

    if (previousEnv.NETLIFY === undefined) {
      delete process.env.NETLIFY;
    } else {
      process.env.NETLIFY = previousEnv.NETLIFY;
    }

    if (previousEnv.CONTEXT === undefined) {
      delete process.env.CONTEXT;
    } else {
      process.env.CONTEXT = previousEnv.CONTEXT;
    }

    if (previousEnv.DEPLOY_ID === undefined) {
      delete process.env.DEPLOY_ID;
    } else {
      process.env.DEPLOY_ID = previousEnv.DEPLOY_ID;
    }

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('writes, lists, reads, and deletes gallery files on filesystem storage', async () => {
    const stored = await upsertStoredGalleryFile({
      relativePath: 'characters/demo.glb',
      data: Buffer.from('fake-glb-content', 'utf8'),
      contentType: 'model/gltf-binary',
    });

    expect(stored.relativePath).toBe('characters/demo.glb');
    expect(stored.category).toBe('characters');
    expect(stored.kind).toBe('model');

    const listed = await listStoredGalleryFiles();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.relativePath).toBe('characters/demo.glb');
    expect(listed[0]?.url).toContain('/api/gallery/file?path=');

    const loaded = await readStoredGalleryFile('characters/demo.glb');
    expect(loaded).not.toBeNull();
    expect(loaded?.buffer.toString('utf8')).toBe('fake-glb-content');
    expect(loaded?.metadata.contentType).toBe('model/gltf-binary');

    await deleteStoredGalleryFile('characters/demo.glb');
    const afterDelete = await readStoredGalleryFile('characters/demo.glb');
    expect(afterDelete).toBeNull();
  });
});
