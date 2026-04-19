// ============================================
// Build Pipeline - web / exe / msi
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { zipSync, strToU8 } from 'fflate';
import { v4 as uuidv4 } from 'uuid';
import { buildReyPlayManifest, validateReyPlayProject } from './compile';
import type { BuildArtifact } from '@/types/engine';
import type { BuildReport, BuildManifest } from '../types';
import { useEngineStore } from '@/store/editorStore';

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

export interface BuildProjectState {
  projectName: string;
  scenes: ReturnType<typeof useEngineStore.getState>['scenes'];
  entities: ReturnType<typeof useEngineStore.getState>['entities'];
  assets: ReturnType<typeof useEngineStore.getState>['assets'];
  scribProfiles: ReturnType<typeof useEngineStore.getState>['scribProfiles'];
  scribInstances: ReturnType<typeof useEngineStore.getState>['scribInstances'];
  activeSceneId: string | null;
  buildManifest?: BuildManifest | null;
}

type BuildWorkspace = {
  buildDir: string;
  stageDir: string;
  manifest: BuildManifest;
  slug: string;
  target: BuildTarget;
  buildId: string;
  report: BuildReport;
};

type PackagedFileEntry = {
  path: string;
  size: number;
  checksum: string;
};

type BuildPackageManifest = {
  schema: 'reyplay-package-1.0';
  buildId: string;
  target: BuildTarget;
  projectName: string;
  generatedAt: string;
  stageFiles: PackagedFileEntry[];
  artifacts: BuildArtifact[];
  missingDeps: string[];
};

function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'reyplay-project';
}

function guidFromSeed(seed: string): string {
  const hex = createHash('md5').update(seed).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function toWixIdentifier(seed: string, prefix = 'Pkg'): string {
  const safe = seed.replace(/[^A-Za-z0-9_.]/g, '_');
  const normalized = /^[A-Za-z_]/.test(safe) ? safe : `_${safe}`;
  return `${prefix}_${normalized}`;
}

function hasCommand(cmd: string): boolean {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

function detectMsiToolchain(): { available: boolean; command: 'wix' | 'candle-light' | null } {
  if (hasCommand('wix.exe') || hasCommand('wix')) return { available: true, command: 'wix' };
  if (hasCommand('candle.exe') && hasCommand('light.exe')) return { available: true, command: 'candle-light' };
  return { available: false, command: null };
}

function checkDependencies(target: BuildTarget): string[] {
  const missing: string[] = [];
  if (target === 'windows-exe') {
    if (process.platform !== 'win32') missing.push('windows-iexpress');
    if (!hasCommand('iexpress.exe')) missing.push('iexpress.exe');
  }
  if (target === 'windows-msi') {
    if (process.platform !== 'win32') missing.push('windows-msi-toolchain');
    const wix = detectMsiToolchain();
    if (!wix.available) missing.push('wix-toolchain');
  }
  return Array.from(new Set(missing));
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

function buildInfoPayload(workspace: BuildWorkspace) {
  const activeScene =
    workspace.manifest.scenes.find((scene) => scene.sceneId === workspace.manifest.activeSceneId) ??
    workspace.manifest.scenes[0] ??
    null;
  return {
    buildId: workspace.buildId,
    target: workspace.target,
    projectName: workspace.manifest.projectName,
    activeSceneId: workspace.manifest.activeSceneId,
    activeSceneName: activeScene?.name ?? null,
    renderProfileSummary: activeScene?.renderProfile.summary ?? 'No render profile',
    sceneCount: workspace.manifest.scenes.length,
    entityCount: workspace.manifest.entities.length,
    assetCount: workspace.manifest.assets.length,
    materialCount: workspace.manifest.materials.length,
    textureReferenceCount: workspace.manifest.compileMeta.textureReferenceCount,
    paintedTextureCount: workspace.manifest.compileMeta.paintedTextureCount,
    generatedModelerMeshCount: workspace.manifest.compileMeta.generatedModelerMeshCount,
    generatedTerrainCount: workspace.manifest.compileMeta.generatedTerrainCount,
    generatedAnimationCount: workspace.manifest.compileMeta.generatedAnimationCount,
    generatedCharacterCount: workspace.manifest.compileMeta.generatedCharacterCount,
    combatActorCount: workspace.manifest.compileMeta.combatActorCount,
    combatWeaponCount: workspace.manifest.compileMeta.combatWeaponCount,
    generatedAt: new Date().toISOString(),
    runtimeMode: workspace.target === 'web' ? 'browser-static' : 'browser-launcher',
  };
}

function buildReadme(workspace: BuildWorkspace) {
  const activeScene =
    workspace.manifest.scenes.find((scene) => scene.sceneId === workspace.manifest.activeSceneId) ??
    workspace.manifest.scenes[0] ??
    null;
  const lines = [
    `REY30 Build Package`,
    ``,
    `Project: ${workspace.manifest.projectName}`,
    `Target: ${workspace.target}`,
    `Build ID: ${workspace.buildId}`,
    `Generated: ${new Date().toISOString()}`,
    `Render: ${activeScene?.renderProfile.summary ?? 'No render profile'}`,
    `Materials: ${workspace.manifest.materials.length}`,
    `Terrains: ${workspace.manifest.compileMeta.generatedTerrainCount}`,
    `Animations: ${workspace.manifest.compileMeta.generatedAnimationCount}`,
    `Characters: ${workspace.manifest.compileMeta.generatedCharacterCount}`,
    `Combat Actors: ${workspace.manifest.compileMeta.combatActorCount}`,
    `Combat Weapons: ${workspace.manifest.compileMeta.combatWeaponCount}`,
    `Painted Textures: ${workspace.manifest.compileMeta.paintedTextureCount}`,
    `Modeler Meshes: ${workspace.manifest.compileMeta.generatedModelerMeshCount}`,
    ``,
    `Contents:`,
    `- index.html: offline build entrypoint`,
    `- manifest.json: project manifest`,
    `- build-report.json: compile diagnostics`,
    `- build-info.json: package metadata`,
    `- assets-index.json: asset list used by the build`,
    `- materials-index.json: effective PBR materials packaged with the build`,
    `- terrains-index.json: compiled terrain authoring data emitted with the build`,
    `- animations-index.json: compiled animator timelines, clips and NLA emitted with the build`,
    `- characters-index.json: compiled full character packages emitted from character generation`,
    `- combat-index.json: compiled combat actors, weapons and gameplay-ready battle config`,
  ];

  if (workspace.manifest.generatedModelerMeshes.length > 0) {
    lines.push(`- generated-modeler-*.json: compiled editable meshes emitted from the modeler`);
  }
  if (workspace.manifest.generatedTerrains.length > 0) {
    lines.push(`- generated-terrain-*.json: compiled terrain heightmaps and layers emitted from world authoring`);
  }
  if (workspace.manifest.generatedAnimations.length > 0) {
    lines.push(`- generated-animation-*.json: compiled animator clips, rig and NLA emitted from the timeline authoring flow`);
  }
  if (workspace.manifest.generatedCharacters.length > 0) {
    lines.push(`- generated-character-*.json: compiled full character packages emitted from AI character generation`);
  }

  if (workspace.target !== 'web') {
    lines.push(`- Launch ReyPlay.cmd: persistent launcher used by the self-extracting package`);
  }

  lines.push(
    ``,
    `Notes:`,
    `- This package opens in the system browser and uses the compiled manifest as source of truth.`,
    `- Windows MSI requires a WiX toolchain. If it is not installed, the build is blocked instead of emitting placeholders.`,
  );

  return lines.join('\r\n');
}

function buildIndexHtml(workspace: BuildWorkspace) {
  const embedded = JSON.stringify({
    manifest: workspace.manifest,
    report: workspace.report,
    info: buildInfoPayload(workspace),
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${workspace.manifest.projectName} - ReyPlay Build</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09111f;
      --panel: rgba(18, 31, 52, 0.92);
      --line: rgba(122, 176, 255, 0.22);
      --text: #edf4ff;
      --muted: #9eb5cf;
      --accent: #5bd4a7;
      --warning: #ffca69;
    }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      background:
        radial-gradient(circle at top, rgba(63, 129, 255, 0.24), transparent 42%),
        linear-gradient(160deg, #050b16, var(--bg));
      color: var(--text);
    }
    .shell {
      max-width: 1080px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .hero {
      display: grid;
      gap: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    h1 {
      margin: 0;
      font-size: clamp(28px, 5vw, 46px);
      line-height: 1.02;
    }
    .summary {
      color: var(--muted);
      max-width: 760px;
      line-height: 1.55;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 22px;
    }
    .card {
      background: rgba(8, 16, 30, 0.85);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
    }
    .label {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .value {
      font-size: 28px;
      font-weight: 700;
    }
    .section {
      margin-top: 18px;
      display: grid;
      gap: 14px;
    }
    .list {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(91, 212, 167, 0.12);
      color: var(--accent);
      border: 1px solid rgba(91, 212, 167, 0.24);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .diag {
      margin: 0;
      padding-left: 18px;
    }
    .diag li {
      margin: 6px 0;
      color: var(--muted);
    }
    .diag strong {
      color: var(--warning);
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <div class="eyebrow">ReyPlay Offline Build</div>
      <h1>${workspace.manifest.projectName}</h1>
      <div class="summary">
        Static build package generated from the editor manifest. This launcher is meant for review,
        handoff and browser-based smoke validation without exposing editor internals.
      </div>
      <div id="status"></div>
      <div class="grid" id="stats"></div>
      <div class="section card">
        <div class="label">Scenes</div>
        <ul class="list" id="scenes"></ul>
      </div>
      <div class="section card">
        <div class="label">Assets</div>
        <ul class="list" id="assets"></ul>
      </div>
      <div class="section card">
        <div class="label">Materials</div>
        <ul class="list" id="materials"></ul>
      </div>
      <div class="section card">
        <div class="label">Diagnostics</div>
        <ul class="diag" id="diagnostics"></ul>
      </div>
    </div>
  </div>
  <script>
    const payload = ${embedded};
    const stats = [
      ['Scenes', payload.info.sceneCount],
      ['Entities', payload.info.entityCount],
      ['Assets', payload.info.assetCount],
      ['Materials', payload.info.materialCount],
      ['Animations', payload.info.generatedAnimationCount],
      ['Characters', payload.info.generatedCharacterCount],
      ['Combat Actors', payload.info.combatActorCount],
      ['Combat Weapons', payload.info.combatWeaponCount],
      ['Terrains', payload.info.generatedTerrainCount],
      ['Painted', payload.info.paintedTextureCount],
      ['Modeler Meshes', payload.info.generatedModelerMeshCount],
      ['Diagnostics', payload.report.diagnostics.length]
    ];
    document.getElementById('status').innerHTML =
      '<span class="pill">' + (payload.report.ok ? 'Build Ready' : 'Build Needs Attention') + '</span>';
    document.getElementById('stats').innerHTML = stats.map(([label, value]) =>
      '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>'
    ).join('');
    document.getElementById('scenes').innerHTML = payload.manifest.scenes.map((scene) =>
      '<li><strong>' + scene.name + '</strong> - ' + scene.entityCount + ' entities - ' + scene.renderProfile.summary + '</li>'
    ).join('');
    document.getElementById('assets').innerHTML =
      payload.manifest.assets.length === 0
        ? '<li>No packaged assets declared in the manifest.</li>'
        : payload.manifest.assets.map((asset) =>
            '<li><strong>' + asset.name + '</strong> <span>(' + asset.type +
            (asset.source === 'generated_modeler_mesh' ? ' · modeler' : '') +
            (asset.source === 'generated_terrain' ? ' · terrain' : '') +
            (asset.source === 'generated_character' ? ' · character' : '') +
            ')</span></li>'
          ).join('');
    document.getElementById('materials').innerHTML =
      payload.manifest.materials.length === 0
        ? '<li>No effective materials declared in the manifest.</li>'
        : payload.manifest.materials.map((material) =>
            '<li><strong>' + material.entityName + '</strong> - ' + material.summary + '</li>'
          ).join('');
    const animationsHtml =
      payload.manifest.generatedAnimations.length === 0
        ? '<li>No animator timelines declared in the manifest.</li>'
        : payload.manifest.generatedAnimations.map((animation) =>
            '<li><strong>' + animation.entityName + '</strong> - ' + animation.summary.clipCount +
            ' clips - ' + animation.summary.nlaStripCount + ' NLA - ' +
            (animation.summary.hasRootMotion ? 'root motion' : 'pose only') + '</li>'
          ).join('');
    const animationSection = document.createElement('div');
    animationSection.className = 'section card';
    animationSection.innerHTML =
      '<div class="label">Animations</div><ul class="list">' + animationsHtml + '</ul>';
    document.querySelector('.hero').appendChild(animationSection);
    const charactersHtml =
      payload.manifest.generatedCharacters.length === 0
        ? '<li>No generated character packages declared in the manifest.</li>'
        : payload.manifest.generatedCharacters.map((character) =>
            '<li><strong>' + character.assetName + '</strong> - ' + character.summary.vertexCount +
            ' verts - ' + character.summary.materialCount + ' materials - ' +
            character.summary.animationCount + ' animations</li>'
          ).join('');
    const characterSection = document.createElement('div');
    characterSection.className = 'section card';
    characterSection.innerHTML =
      '<div class="label">Characters</div><ul class="list">' + charactersHtml + '</ul>';
    document.querySelector('.hero').appendChild(characterSection);
    const combatHtml =
      payload.manifest.combatActors.length === 0
        ? '<li>No combat actors declared in the manifest.</li>'
        : payload.manifest.combatActors.map((actor) =>
            '<li><strong>' + actor.entityName + '</strong> - team ' + actor.team +
            ' - hp ' + actor.currentHealth + '/' + actor.maxHealth +
            ' - atk ' + actor.attack + '</li>'
          ).join('');
    const combatSection = document.createElement('div');
    combatSection.className = 'section card';
    combatSection.innerHTML =
      '<div class="label">Combat</div><ul class="list">' + combatHtml + '</ul>';
    document.querySelector('.hero').appendChild(combatSection);
    document.getElementById('diagnostics').innerHTML =
      payload.report.diagnostics.length === 0
        ? '<li>No compile diagnostics.</li>'
        : payload.report.diagnostics.map((item) =>
            '<li><strong>' + item.code + '</strong> - ' + item.message + '</li>'
          ).join('');
  </script>
</body>
</html>`;
}

function buildLauncherCmd(workspace: BuildWorkspace) {
  const destination = `%LOCALAPPDATA%\\REY30\\Builds\\${workspace.slug}-${workspace.buildId}`;
  return `@echo off
setlocal
set "BUILD_DIR=${destination}"
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%" >nul 2>nul
for %%F in ("%~dp0*") do (
  copy /Y "%%~fF" "%BUILD_DIR%\\%%~nxF" >nul
)
start "" "%BUILD_DIR%\\index.html"
echo ReyPlay build opened from "%BUILD_DIR%".
exit /b 0
`;
}

async function writeWorkspaceFiles(workspace: BuildWorkspace) {
  const files: Array<{ name: string; content: string }> = [
    { name: 'manifest.json', content: JSON.stringify(workspace.manifest, null, 2) },
    { name: 'build-report.json', content: JSON.stringify(workspace.report, null, 2) },
    { name: 'build-info.json', content: JSON.stringify(buildInfoPayload(workspace), null, 2) },
    { name: 'assets-index.json', content: JSON.stringify(workspace.manifest.assets, null, 2) },
    { name: 'materials-index.json', content: JSON.stringify(workspace.manifest.materials, null, 2) },
    { name: 'combat-index.json', content: JSON.stringify({
      actors: workspace.manifest.combatActors,
      weapons: workspace.manifest.combatWeapons,
    }, null, 2) },
    { name: 'terrains-index.json', content: JSON.stringify(workspace.manifest.generatedTerrains, null, 2) },
    { name: 'animations-index.json', content: JSON.stringify(workspace.manifest.generatedAnimations, null, 2) },
    { name: 'characters-index.json', content: JSON.stringify(workspace.manifest.generatedCharacters, null, 2) },
    { name: 'README.txt', content: buildReadme(workspace) },
    { name: 'index.html', content: buildIndexHtml(workspace) },
  ];

  files.push(
    ...workspace.manifest.generatedModelerMeshes.map((generatedMesh) => ({
      name: generatedMesh.path,
      content: JSON.stringify(
        {
          schema: 'reyplay-modeler-mesh-1.0',
          assetId: generatedMesh.assetId,
          entityId: generatedMesh.entityId,
          entityName: generatedMesh.entityName,
          modifierCount: generatedMesh.modifierCount,
          summary: generatedMesh.summary,
          mesh: generatedMesh.mesh,
        },
        null,
        2
      ),
    }))
  );
  files.push(
    ...workspace.manifest.generatedTerrains.map((generatedTerrain) => ({
      name: generatedTerrain.path,
      content: JSON.stringify(
        {
          schema: 'reyplay-terrain-1.0',
          assetId: generatedTerrain.assetId,
          entityId: generatedTerrain.entityId,
          entityName: generatedTerrain.entityName,
          summary: generatedTerrain.summary,
          terrain: generatedTerrain.terrain,
        },
        null,
        2
      ),
    }))
  );
  files.push(
    ...workspace.manifest.generatedAnimations.map((generatedAnimation) => ({
      name: generatedAnimation.path,
      content: JSON.stringify(
        {
          schema: 'reyplay-animation-1.0',
          assetId: generatedAnimation.assetId,
          entityId: generatedAnimation.entityId,
          entityName: generatedAnimation.entityName,
          source: generatedAnimation.source,
          summary: generatedAnimation.summary,
          state: generatedAnimation.state,
        },
        null,
        2
      ),
    }))
  );
  files.push(
    ...workspace.manifest.generatedCharacters.map((generatedCharacter) => ({
      name: generatedCharacter.path,
      content: JSON.stringify(
        {
          schema: 'reyplay-character-package-1.0',
          assetId: generatedCharacter.assetId,
          assetPath: generatedCharacter.assetPath,
          assetName: generatedCharacter.assetName,
          summary: generatedCharacter.summary,
          package: generatedCharacter.package,
        },
        null,
        2
      ),
    }))
  );

  if (workspace.target !== 'web') {
    files.push({ name: 'Launch ReyPlay.cmd', content: buildLauncherCmd(workspace) });
  }

  for (const file of files) {
    await fs.writeFile(path.join(workspace.stageDir, file.name), file.content, 'utf-8');
  }
}

async function readStageFiles(stageDir: string): Promise<Record<string, Uint8Array>> {
  const entries = await fs.readdir(stageDir, { withFileTypes: true });
  const files: Record<string, Uint8Array> = {};

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = path.join(stageDir, entry.name);
    const rel = entry.name.replace(/\\/g, '/');
    const content = await fs.readFile(abs);
    files[rel] = new Uint8Array(content);
  }

  return files;
}

async function listPackagedFiles(dir: string): Promise<PackagedFileEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: PackagedFileEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolutePath = path.join(dir, entry.name);
    const stats = await fs.stat(absolutePath);
    const checksum = createHash('sha256').update(await fs.readFile(absolutePath)).digest('hex');
    files.push({
      path: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
      size: stats.size,
      checksum,
    });
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

async function writeZipBundle(stageDir: string, outputPath: string) {
  const files = await readStageFiles(stageDir);
  const zipped = zipSync(files, { level: 9 });
  await fs.writeFile(outputPath, Buffer.from(zipped));
}

async function verifyArtifacts(artifacts: BuildArtifact[]) {
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    if (seen.has(artifact.path)) {
      throw new Error(`Duplicate build artifact path detected: ${artifact.path}`);
    }
    seen.add(artifact.path);
    const absolutePath = path.join(process.cwd(), artifact.path);
    const stats = await fs.stat(absolutePath);
    if (stats.size <= 0) {
      throw new Error(`Build artifact is empty: ${artifact.path}`);
    }
  }
}

async function writePackageManifest(params: {
  workspace: BuildWorkspace;
  artifacts: BuildArtifact[];
  missingDeps: string[];
}) {
  const manifestPath = path.join(params.workspace.buildDir, 'package-manifest.json');
  const payload: BuildPackageManifest = {
    schema: 'reyplay-package-1.0',
    buildId: params.workspace.buildId,
    target: params.workspace.target,
    projectName: params.workspace.manifest.projectName,
    generatedAt: new Date().toISOString(),
    stageFiles: await listPackagedFiles(params.workspace.stageDir),
    artifacts: params.artifacts,
    missingDeps: params.missingDeps,
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf-8');
  return toArtifact(manifestPath, params.workspace.target, 'manifest');
}

function buildIExpressSed(params: {
  stageDir: string;
  targetPath: string;
  friendlyName: string;
  launchFile: string;
  files: string[];
}) {
  const sourceDir = `${path.resolve(params.stageDir)}\\`;
  return [
    '[Version]',
    'Class=IEXPRESS',
    'SEDVersion=3',
    '[Options]',
    'PackagePurpose=InstallApp',
    'ShowInstallProgramWindow=0',
    'HideExtractAnimation=1',
    'UseLongFileName=1',
    'InsideCompressed=0',
    'CAB_FixedSize=0',
    'CAB_ResvCodeSigning=0',
    'RebootMode=N',
    'InstallPrompt=',
    'DisplayLicense=',
    'FinishMessage=',
    `TargetName=${path.resolve(params.targetPath)}`,
    `FriendlyName=${params.friendlyName}`,
    `AppLaunched=${params.launchFile}`,
    'PostInstallCmd=<None>',
    `AdminQuietInstCmd=${params.launchFile}`,
    `UserQuietInstCmd=${params.launchFile}`,
    'SourceFiles=SourceFiles',
    '[SourceFiles]',
    `SourceFiles0=${sourceDir}`,
    '[SourceFiles0]',
    ...params.files.map((file) => `${file}=`),
    '',
  ].join('\r\n');
}

async function buildWindowsExe(workspace: BuildWorkspace, logs: string[]) {
  const bundlePath = path.join(workspace.buildDir, `${workspace.slug}-windows-portable.zip`);
  const exePath = path.join(workspace.buildDir, `${workspace.slug}-launcher.exe`);
  await writeZipBundle(workspace.stageDir, bundlePath);

  const stageFiles = await fs.readdir(workspace.stageDir, { withFileTypes: true });
  const fileNames = stageFiles.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const sedPath = path.join(workspace.buildDir, `${workspace.slug}-iexpress.sed`);
  const sed = buildIExpressSed({
    stageDir: workspace.stageDir,
    targetPath: exePath,
    friendlyName: `${workspace.manifest.projectName} ReyPlay Launcher`,
    launchFile: 'Launch ReyPlay.cmd',
    files: fileNames,
  });
  await fs.writeFile(sedPath, sed, 'utf-8');

  const result = spawnSync('iexpress.exe', ['/N', '/Q', '/M', sedPath], {
    encoding: 'utf-8',
    cwd: workspace.buildDir,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || 'IExpress packaging failed.');
  }

  const exeExists = await fs.stat(exePath).then(() => true).catch(() => false);
  if (!exeExists) {
    throw new Error('IExpress did not emit the launcher executable.');
  }

  logs.push(`Windows launcher packaged with IExpress: ${exePath}`);

  return [
    await toArtifact(bundlePath, workspace.target, 'bundle'),
    await toArtifact(exePath, workspace.target, 'installer'),
  ];
}

function buildWixSource(params: {
  workspace: BuildWorkspace;
  sourceDir: string;
  productName: string;
  fileNames: string[];
}) {
  const upgradeCode = guidFromSeed(`${params.workspace.slug}-upgrade`);
  const packageId = toWixIdentifier(`${params.workspace.slug}.installer`);
  const componentEntries = params.fileNames
    .map(
      (file, index) =>
        `      <Component Id="Cmp${index + 1}" Guid="*">\n` +
        `        <File Id="Fil${index + 1}" Source="${path.join(params.sourceDir, file)}" KeyPath="yes" />\n` +
        '      </Component>'
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="${params.productName}" Manufacturer="REY30" Version="1.0.0" UpgradeCode="${upgradeCode}" InstallerVersion="500" Compressed="yes" Scope="perMachine" Language="1033" Id="${packageId}">
    <MediaTemplate />
    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />
    <StandardDirectory Id="ProgramFilesFolder">
      <Directory Id="INSTALLFOLDER" Name="${params.productName}" />
    </StandardDirectory>
    <Feature Id="MainFeature" Title="${params.productName}" Level="1">
      <ComponentGroupRef Id="ProductComponents" />
    </Feature>
  </Package>
  <Fragment>
    <ComponentGroup Id="ProductComponents" Directory="INSTALLFOLDER">
${componentEntries}
    </ComponentGroup>
  </Fragment>
</Wix>`;
}

async function buildWindowsMsi(workspace: BuildWorkspace, logs: string[]) {
  const wix = detectMsiToolchain();
  if (!wix.available) {
    throw new Error('WiX toolchain is not installed.');
  }

  const msiPath = path.join(workspace.buildDir, `${workspace.slug}-installer.msi`);
  const fileNames = (await fs.readdir(workspace.stageDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const wxsPath = path.join(workspace.buildDir, `${workspace.slug}.wxs`);
  const wixSource = buildWixSource({
    workspace,
    sourceDir: path.resolve(workspace.stageDir),
    productName: `${workspace.manifest.projectName} ReyPlay`,
    fileNames,
  });
  await fs.writeFile(wxsPath, wixSource, 'utf-8');

  if (wix.command === 'wix') {
    const result = spawnSync('wix', ['build', '-o', msiPath, wxsPath], {
      encoding: 'utf-8',
      cwd: workspace.buildDir,
    });
    if (result.error || result.status !== 0) {
      throw new Error(result.error?.message || result.stderr || result.stdout || 'WiX build failed.');
    }
  } else {
    const wixobjPath = path.join(workspace.buildDir, `${workspace.slug}.wixobj`);
    const candle = spawnSync('candle.exe', ['-o', wixobjPath, wxsPath], {
      encoding: 'utf-8',
      cwd: workspace.buildDir,
    });
    if (candle.error || candle.status !== 0) {
      throw new Error(candle.error?.message || candle.stderr || candle.stdout || 'WiX candle failed.');
    }
    const light = spawnSync('light.exe', ['-o', msiPath, wixobjPath], {
      encoding: 'utf-8',
      cwd: workspace.buildDir,
    });
    if (light.error || light.status !== 0) {
      throw new Error(light.error?.message || light.stderr || light.stdout || 'WiX light failed.');
    }
  }

  const msiExists = await fs.stat(msiPath).then(() => true).catch(() => false);
  if (!msiExists) {
    throw new Error('WiX did not emit the MSI package.');
  }

  logs.push(`Windows MSI packaged with WiX: ${msiPath}`);
  return [await toArtifact(msiPath, workspace.target, 'installer')];
}

async function createWorkspace(params: {
  target: BuildTarget;
  buildId: string;
  manifest: BuildManifest;
  report: BuildReport;
}) {
  const buildRoot = process.env.REY30_BUILD_ROOT || path.join(process.cwd(), 'output', 'builds');
  const buildDir = path.join(buildRoot, params.target, params.buildId);
  const stageDir = path.join(buildDir, 'stage');
  await fs.mkdir(stageDir, { recursive: true });

  const workspace: BuildWorkspace = {
    buildDir,
    stageDir,
    manifest: params.manifest,
    slug: sanitizeSlug(params.manifest.projectName),
    target: params.target,
    buildId: params.buildId,
    report: params.report,
  };

  await writeWorkspaceFiles(workspace);
  return workspace;
}

async function writeLogArtifact(buildDir: string, target: BuildTarget, logs: string[]) {
  const logPath = path.join(buildDir, 'build.log');
  await fs.writeFile(logPath, logs.join('\r\n') + '\r\n', 'utf-8');
  return toArtifact(logPath, target, 'log');
}

function createBuildProjectState(input: BuildProjectState) {
  return {
    scenes: input.scenes,
    entities: input.entities,
    assets: input.assets,
    scribProfiles: input.scribProfiles,
    scribInstances: input.scribInstances,
    activeSceneId: input.activeSceneId,
    projectName: input.projectName,
  };
}

function compileBuildProject(input: BuildProjectState) {
  const buildInput = createBuildProjectState(input);
  const report = validateReyPlayProject(buildInput);

  if (!report.ok) {
    return {
      report,
      manifest: null,
    };
  }

  const baseManifest = buildReyPlayManifest(buildInput);
  const manifest: BuildManifest = {
    ...baseManifest,
    projectName: input.projectName,
    activeSceneId: input.activeSceneId,
    compileMeta: {
      ...baseManifest.compileMeta,
      diagnosticCount: report.diagnostics.length,
    },
  };

  return {
    report,
    manifest,
  };
}

export async function buildProject(target: BuildTarget): Promise<BuildResult> {
  const store = useEngineStore.getState();
  return buildProjectFromState(target, {
    projectName: store.projectName,
    scenes: store.scenes,
    entities: store.entities,
    assets: store.assets,
    scribProfiles: store.scribProfiles,
    scribInstances: store.scribInstances,
    activeSceneId: store.activeSceneId,
    buildManifest: store.buildManifest,
  });
}

export async function buildProjectFromState(
  target: BuildTarget,
  input: BuildProjectState
): Promise<BuildResult> {
  const { report, manifest } = compileBuildProject(input);
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
      logs: ['Compilation failed, aborting build.'],
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
      logs: ['Missing dependencies: ' + missingDeps.join(', ')],
    };
  }

  if (!manifest) {
    throw new Error('BUILD_MANIFEST_NOT_AVAILABLE');
  }

  const workspace = await createWorkspace({
    target,
    buildId,
    manifest,
    report,
  });

  logs.push(`Build workspace created at ${workspace.buildDir}`);
  logs.push(
    `Manifest includes ${manifest.scenes.length} scenes, ${manifest.entities.length} entities, ${manifest.assets.length} assets and ${manifest.materials.length} materials.`
  );

  const artifacts: BuildArtifact[] = [];
  artifacts.push(await toArtifact(path.join(workspace.stageDir, 'manifest.json'), target, 'manifest'));

  if (target === 'web') {
    const bundlePath = path.join(workspace.buildDir, `${workspace.slug}-web.zip`);
    await writeZipBundle(workspace.stageDir, bundlePath);
    logs.push(`Web bundle packaged at ${bundlePath}`);
    artifacts.push(await toArtifact(bundlePath, target, 'bundle'));
  } else if (target === 'windows-exe') {
    artifacts.push(...(await buildWindowsExe(workspace, logs)));
  } else if (target === 'windows-msi') {
    artifacts.push(...(await buildWindowsMsi(workspace, logs)));
  }

  logs.push(`Package manifest emitted for ${artifacts.length} primary artifact(s).`);
  artifacts.push(await writeLogArtifact(workspace.buildDir, target, logs));
  await verifyArtifacts(artifacts);
  artifacts.push(
    await writePackageManifest({
      workspace,
      artifacts,
      missingDeps,
    })
  );
  await verifyArtifacts(artifacts);

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

export const __buildInternals = {
  sanitizeSlug,
  detectMsiToolchain,
  buildLauncherCmd,
  buildIndexHtml,
};
