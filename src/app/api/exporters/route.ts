// ============================================
// Exporters API - GLTF/FBX/Unity/Unreal/Blender presets
// Performs real conversion for glTF using gltf-transform (and optional FBX conversion if configured).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type Target = 'gltf' | 'fbx' | 'unity' | 'unreal' | 'blender';
type Preset = 'mobile' | 'desktop' | 'cinematic';

interface RequestBody {
  inputPath: string;
  target: Target;
  preset?: Preset;
  scale?: number;
  axis?: 'y_up' | 'z_up';
  embedTextures?: boolean;
  version?: string;
}

const defaultPresetConfig: Record<Preset, { scale: number; embedTextures: boolean; lods: number[] }> = {
  mobile: { scale: 1, embedTextures: true, lods: [1, 0.6, 0.3] },
  desktop: { scale: 1, embedTextures: false, lods: [1, 0.7, 0.4] },
  cinematic: { scale: 1, embedTextures: false, lods: [1] },
};

const VALID_TARGETS: Target[] = ['gltf', 'fbx', 'unity', 'unreal', 'blender'];
const VALID_PRESETS: Preset[] = ['mobile', 'desktop', 'cinematic'];
const VALID_AXES: Array<'y_up' | 'z_up'> = ['y_up', 'z_up'];

async function ensureOutDir(target: Target) {
  const root = process.env.REY30_EXPORT_ROOT || path.join(process.cwd(), 'download', 'exports', target);
  await fs.mkdir(root, { recursive: true });
  return root;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function resolveInputPath(inputPath: string): string {
  const normalized = inputPath.replace(/^\.?\/?/, '');
  const abs = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(process.cwd(), normalized);
  const allowedRoots = [
    process.cwd(),
    process.env.REY30_INPUT_GALLERY_ROOT || path.join(process.cwd(), 'input_Galeria_Rey30'),
    process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets'),
  ].map((root) => path.resolve(root));

  if (!allowedRoots.some((root) => isInsideRoot(root, abs))) {
    throw new Error('inputPath is outside allowed roots');
  }

  return abs;
}

function isGltfInput(ext: string) {
  return ['.gltf', '.glb'].includes(ext.toLowerCase());
}

function isMeshInput(ext: string) {
  return ['.gltf', '.glb', '.fbx', '.obj', '.stl'].includes(ext.toLowerCase());
}

function multiplyQuat(a: [number, number, number, number], b: [number, number, number, number]) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ] as [number, number, number, number];
}

function applyAxisAndScale(document: Document, axis: 'y_up' | 'z_up', scale: number) {
  const root = document.getRoot();
  const scenes = root.listScenes();
  const rotateToZUp: [number, number, number, number] = [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)];

  scenes.forEach((scene) => {
    scene.listChildren().forEach((node) => {
      if (scale !== 1) {
        const s = node.getScale() || [1, 1, 1];
        node.setScale([s[0] * scale, s[1] * scale, s[2] * scale]);
      }
      if (axis === 'z_up') {
        const r = node.getRotation() || [0, 0, 0, 1];
        node.setRotation(multiplyQuat(rotateToZUp, r));
      }
    });
  });
}

async function convertWithGltfTransform(inputAbs: string, outputAbs: string, axis: 'y_up' | 'z_up', scale: number) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(inputAbs);
  applyAxisAndScale(document, axis, scale);
  await io.write(outputAbs, document);
}

function buildArgs(template: string, inputAbs: string, outputAbs: string) {
  return template
    .split(' ')
    .filter(Boolean)
    .map((part) => part.replace('{input}', inputAbs).replace('{output}', outputAbs));
}

async function ensureTmpDir() {
  const tmpRoot = path.join(process.cwd(), 'download', 'exports', 'tmp');
  await fs.mkdir(tmpRoot, { recursive: true });
  return tmpRoot;
}

function runConverter(binary: string, args: string[]) {
  const result = spawnSync(binary, args, { encoding: 'utf-8' });
  if (result.error || result.status !== 0) {
    return { ok: false, error: result.error?.message || result.stderr || 'Unknown error' };
  }
  return { ok: true };
}

async function convertInputToGltf(inputAbs: string): Promise<{ gltfPath: string; notes: string[] }> {
  const inputExt = path.extname(inputAbs).toLowerCase();
  if (isGltfInput(inputExt)) {
    return { gltfPath: inputAbs, notes: ['Entrada glTF usada directamente.'] };
  }

  if (!isMeshInput(inputExt)) {
    throw new Error('Formato de entrada no soportado.');
  }

  const tmpRoot = await ensureTmpDir();
  const baseName = path.parse(inputAbs).name;
  const tmpOutput = path.join(tmpRoot, `${baseName}_${Date.now()}.gltf`);
  const notes: string[] = [];

  if (inputExt === '.fbx') {
    const fbx2gltfPath = process.env.REY30_FBX2GLTF_PATH;
    const fbx2gltfArgs = process.env.REY30_FBX2GLTF_ARGS;
    if (fbx2gltfPath) {
      const args = fbx2gltfArgs
        ? buildArgs(fbx2gltfArgs, inputAbs, tmpOutput)
        : ['-i', inputAbs, '-o', tmpOutput];
      const res = runConverter(fbx2gltfPath, args);
      if (!res.ok) {
        throw new Error(`FBX2glTF error: ${res.error}`);
      }
      notes.push('Convertido con fbx2gltf.');
      return { gltfPath: tmpOutput, notes };
    }
  }

  const assimpPath = process.env.REY30_ASSIMP_PATH;
  const assimpArgsTemplate = process.env.REY30_ASSIMP_ARGS;
  if (!assimpPath || !assimpArgsTemplate) {
    throw new Error('No hay conversor configurado. Define REY30_FBX2GLTF_PATH o REY30_ASSIMP_PATH/REY30_ASSIMP_ARGS.');
  }

  const args = buildArgs(assimpArgsTemplate, inputAbs, tmpOutput);
  const res = runConverter(assimpPath, args);
  if (!res.ok) {
    throw new Error(`Assimp error: ${res.error}`);
  }
  notes.push('Convertido con assimp.');
  return { gltfPath: tmpOutput, notes };
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    if (!body.inputPath || !body.target) {
      return NextResponse.json({ success: false, error: 'inputPath y target son requeridos' }, { status: 400 });
    }

    if (!VALID_TARGETS.includes(body.target)) {
      return NextResponse.json({ success: false, error: 'target inválido' }, { status: 400 });
    }

    const target: Target = body.target;
    const preset: Preset = body.preset && VALID_PRESETS.includes(body.preset) ? body.preset : 'desktop';
    const axis = body.axis && VALID_AXES.includes(body.axis) ? body.axis : 'y_up';
    const scale = typeof body.scale === 'number' ? body.scale : defaultPresetConfig[preset].scale;
    if (!Number.isFinite(scale) || scale <= 0 || scale > 100) {
      return NextResponse.json({ success: false, error: 'scale inválido' }, { status: 400 });
    }
    const embedTextures = body.embedTextures ?? defaultPresetConfig[preset].embedTextures;
    const version = body.version || '1.0';

    const inputAbs = resolveInputPath(body.inputPath);

    const stats = await fs.stat(inputAbs).catch(() => null);
    if (!stats) {
      return NextResponse.json({ success: false, error: 'inputPath no existe' }, { status: 404 });
    }

    const outDir = await ensureOutDir(target);
    const baseName = path.parse(inputAbs).name;
    const inputExt = path.extname(inputAbs).toLowerCase();

    let exportFile = '';
    let conversionNotes: string[] = [];

    if (target === 'fbx') {
      exportFile = path.join(outDir, `${baseName}.fbx`);
      if (inputExt === '.fbx' && scale === 1 && axis === 'y_up') {
        await fs.copyFile(inputAbs, exportFile);
        conversionNotes.push('Entrada ya en FBX, copiado sin cambios.');
      } else {
        const fbxConvPath = process.env.REY30_FBX_CONV_PATH;
        const argsRaw = process.env.REY30_FBX_CONV_ARGS;
        if (fbxConvPath) {
          const args = argsRaw ? buildArgs(argsRaw, inputAbs, exportFile) : ['-f', '-o', exportFile, inputAbs];
          const result = spawnSync(fbxConvPath, args, { encoding: 'utf-8' });
          if (result.error || result.status !== 0) {
            return NextResponse.json(
              {
                success: false,
                error: 'No se pudo convertir a FBX con fbx-conv.',
                detail: result.error?.message || result.stderr,
              },
              { status: 422 }
            );
          }
          conversionNotes.push('Convertido con fbx-conv.');
        } else {
          const assimpPath = process.env.REY30_ASSIMP_PATH;
          const assimpArgsTemplate = process.env.REY30_ASSIMP_FBX_ARGS || process.env.REY30_ASSIMP_ARGS;
          if (!assimpPath || !assimpArgsTemplate) {
            return NextResponse.json(
              {
                success: false,
                error: 'No se pudo convertir a FBX. Configura REY30_FBX_CONV_PATH o REY30_ASSIMP_PATH/REY30_ASSIMP_FBX_ARGS.',
              },
              { status: 422 }
            );
          }
          const args = buildArgs(assimpArgsTemplate, inputAbs, exportFile);
          const result = spawnSync(assimpPath, args, { encoding: 'utf-8' });
          if (result.error || result.status !== 0) {
            return NextResponse.json(
              {
                success: false,
                error: 'No se pudo convertir a FBX con assimp.',
                detail: result.error?.message || result.stderr,
              },
              { status: 422 }
            );
          }
          conversionNotes.push('Convertido con assimp.');
        }
      }
    } else {
      if (!isMeshInput(inputExt)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Formato de entrada no soportado.',
          },
          { status: 422 }
        );
      }

      const ext = embedTextures ? '.glb' : '.gltf';
      exportFile = path.join(outDir, `${baseName}${ext}`);
      const { gltfPath, notes } = await convertInputToGltf(inputAbs);
      await convertWithGltfTransform(gltfPath, exportFile, axis, scale);
      conversionNotes.push(...notes, 'Procesado con gltf-transform.');
    }

    const manifest = {
      source: path.relative(process.cwd(), inputAbs).replace(/\\/g, '/'),
      output: path.relative(process.cwd(), exportFile).replace(/\\/g, '/'),
      target,
      preset,
      axis,
      scale,
      embedTextures,
      version,
      generatedAt: new Date().toISOString(),
      stub: false,
      notes: conversionNotes.join(' '),
      lods: defaultPresetConfig[preset].lods,
    };

    const manifestPath = path.join(outDir, `${baseName}.${target}.manifest.json`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      summary: `Export ${target} (${preset}) generado`,
      exportPath: path.relative(process.cwd(), exportFile).replace(/\\/g, '/'),
      manifest: path.relative(process.cwd(), manifestPath).replace(/\\/g, '/'),
      stub: false,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('Export error', error);
    return NextResponse.json({ success: false, error: 'Export failed' }, { status: 500 });
  }
}
