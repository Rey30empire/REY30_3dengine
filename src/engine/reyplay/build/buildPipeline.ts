// ============================================
// Build Pipeline - web / exe / msi
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { useEngineStore } from '@/store/editorStore';
import { buildReyPlayManifest } from './compile';
import type { BuildArtifact } from '@/types/engine';
import type { BuildReport } from '../types';

export type BuildTarget = 'web' | 'windows-exe' | 'windows-msi';

export interface BuildResult {
  ok: boolean;
  target: BuildTarget;
  buildId: string;
  report: BuildReport;
  artifacts: BuildArtifact[];
  missingDeps: string[];
  logs: string[];
}

export async function buildProject(target: BuildTarget): Promise<BuildResult> {
  const store = useEngineStore.getState();
  const report = store.runReyPlayCompile();
  const buildId = uuidv4();
  const logs: string[] = [];
  const missingDeps = checkDependencies(target);

  if (!report.ok) {
    return {
      ok: false,
      target,
      buildId,
      report,
      artifacts: [],
      missingDeps,
      logs: [...logs, 'Compilation failed, aborting build.'],
    };
  }

  if (missingDeps.length > 0) {
    return {
      ok: false,
      target,
      buildId,
      report,
      artifacts: [],
      missingDeps,
      logs: [...logs, 'Missing dependencies: ' + missingDeps.join(', ')],
    };
  }

  const manifest = store.buildManifest || buildReyPlayManifest({
    scenes: store.scenes,
    entities: store.entities,
    assets: store.assets,
    scribProfiles: store.scribProfiles,
    scribInstances: store.scribInstances,
    activeSceneId: store.activeSceneId,
    projectName: store.projectName,
  });

  const outRoot = path.join(process.cwd(), 'output', 'builds', target);
  const buildDir = path.join(outRoot, buildId);
  await fs.mkdir(buildDir, { recursive: true });

  const artifacts: BuildArtifact[] = [];

  // Write manifest
  const manifestPath = path.join(buildDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  artifacts.push(await toArtifact(manifestPath, target, 'manifest'));

  // Target-specific outputs (placeholder bundles)
  if (target === 'web') {
    const bundlePath = path.join(buildDir, 'web-bundle.zip');
    await fs.writeFile(bundlePath, `bundle ${buildId} (placeholder)`, 'utf-8');
    artifacts.push(await toArtifact(bundlePath, target, 'bundle'));
  } else if (target === 'windows-exe') {
    const exePath = path.join(buildDir, 'Game.exe');
    await fs.writeFile(exePath, `exe ${buildId} (placeholder)`, 'utf-8');
    artifacts.push(await toArtifact(exePath, target, 'installer'));
  } else if (target === 'windows-msi') {
    const msiPath = path.join(buildDir, 'Game.msi');
    await fs.writeFile(msiPath, `msi ${buildId} (placeholder)`, 'utf-8');
    artifacts.push(await toArtifact(msiPath, target, 'installer'));
  }

  logs.push(`Build artifacts written to ${buildDir}`);

  return {
    ok: true,
    target,
    buildId,
    report,
    artifacts,
    missingDeps,
    logs,
  };
}

function checkDependencies(target: BuildTarget): string[] {
  const missing: string[] = [];
  if (!hasCommand('pnpm')) missing.push('pnpm');
  if (target === 'windows-msi' && process.platform !== 'win32') {
    missing.push('windows-msi-toolchain');
  }
  return missing;
}

function hasCommand(cmd: string): boolean {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

async function toArtifact(filePath: string, target: string, kind: BuildArtifact['kind']): Promise<BuildArtifact> {
  const stats = await fs.stat(filePath);
  const hash = createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
  return {
    id: uuidv4(),
    target,
    path: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
    checksum: hash,
    kind,
  };
}
