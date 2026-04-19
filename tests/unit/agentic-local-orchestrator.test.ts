import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalAgenticOrchestrator } from '@/engine/agentic/execution/createLocalAgenticOrchestrator';
import { useEngineStore } from '@/store/editorStore';

let tempBuildRoot = '';
let previousBuildRoot: string | undefined;

function resetEditorStore() {
  useEngineStore.setState({
    projectName: 'Agentic Local Export Test',
    projectPath: '',
    isDirty: false,
    scenes: [],
    activeSceneId: null,
    entities: new Map(),
    assets: [],
    historyPast: [],
    historyFuture: [],
    lastBuildReport: null,
    buildManifest: null,
    lastCompileSummary: '',
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  });
}

describe('local agentic orchestrator', () => {
  beforeEach(async () => {
    resetEditorStore();
    tempBuildRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-local-agentic-'));
    previousBuildRoot = process.env.REY30_BUILD_ROOT;
    process.env.REY30_BUILD_ROOT = tempBuildRoot;
  });

  afterEach(async () => {
    if (previousBuildRoot === undefined) {
      delete process.env.REY30_BUILD_ROOT;
    } else {
      process.env.REY30_BUILD_ROOT = previousBuildRoot;
    }
    await rm(tempBuildRoot, { recursive: true, force: true });
  });

  it('runs "exporta esta escena" end-to-end with physical build validation', async () => {
    const orchestrator = createLocalAgenticOrchestrator({
      artifactRootDir: process.cwd(),
      maxIterations: 1,
    });

    const result = await orchestrator.run('exporta esta escena para web');
    const exportResult = result.state.toolResults.find(
      (toolResult) => toolResult.toolName === 'build.export'
    );
    const artifactPath = exportResult?.output?.artifactPath;
    const finalReport = result.state.validationReports.at(-1);
    const storeEntities = Array.from(useEngineStore.getState().entities.values());

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(finalReport?.approved).toBe(true);
    expect(finalReport?.matchedRequirements).toContain('build.export');
    expect(finalReport?.matchedRequirements).toContain('build.artifact.physical');
    expect(finalReport?.matchedRequirements).toContain('world.build_report.exported_artifact');
    expect(finalReport?.incorrectOutputs).not.toContain('build.export.artifact_missing_on_disk');
    expect(typeof artifactPath).toBe('string');
    expect(artifactPath).toMatch(/\.zip$/);
    expect((await readFile(path.resolve(process.cwd(), artifactPath as string))).byteLength).toBeGreaterThan(0);
    expect(finalReport?.evidenceReviewed).toContain(`artifact:${artifactPath}`);
    expect(storeEntities.some((entity) => entity.name === 'Agentic Export Camera')).toBe(true);
    expect(storeEntities.some((entity) => entity.name === 'Agentic Export Player')).toBe(true);
  });
});
