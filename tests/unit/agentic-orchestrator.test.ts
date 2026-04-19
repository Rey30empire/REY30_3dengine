import { describe, expect, it } from 'vitest';
import { IntentAnalyzer, MasterOrchestrator, TaskPlanner } from '@/engine/agentic';
import { WorldStateManager } from '@/engine/agentic/memory/WorldStateManager';
import { ToolRegistry } from '@/engine/agentic/tools/ToolRegistry';
import { createAnimationTools } from '@/engine/agentic/tools/animationTools';
import { createAssetBuildTools } from '@/engine/agentic/tools/assetBuildTools';
import { createEntityTools } from '@/engine/agentic/tools/entityTools';
import { createEnvironmentTools } from '@/engine/agentic/tools/environmentTools';
import { createGameplayTools } from '@/engine/agentic/tools/gameplayTools';
import { failToolResult } from '@/engine/agentic/tools/toolResult';
import { createPhysicsTools } from '@/engine/agentic/tools/physicsTools';
import { createSceneTools } from '@/engine/agentic/tools/sceneTools';
import type { ToolDefinition } from '@/engine/agentic';

function activeScene(result: Awaited<ReturnType<MasterOrchestrator['run']>>) {
  const sceneId = result.worldState.activeSceneId;
  if (!sceneId) {
    throw new Error('Expected active scene.');
  }
  return result.worldState.scenes[sceneId];
}

function createRegistryWithFogFailureOnce(): ToolRegistry {
  const registry = new ToolRegistry();
  const environmentTools = createEnvironmentTools();
  const fogTool = environmentTools.find((tool) => tool.name === 'environment.configureFog');
  if (!fogTool) {
    throw new Error('Missing fog tool.');
  }

  let attempts = 0;
  const flakyFogTool: ToolDefinition = {
    ...fogTool,
    execute(input, context) {
      attempts += 1;
      if (attempts === 1) {
        return failToolResult(context.call, 'SIMULATED_FOG_FAILURE', 'Simulated fog failure for retry test.');
      }
      return fogTool.execute(input, context);
    },
  };

  registry.registerMany([
    ...createSceneTools(),
    ...createEntityTools(),
    ...environmentTools.filter((tool) => tool.name !== 'environment.configureFog'),
    flakyFogTool,
    ...createPhysicsTools(),
    ...createAnimationTools(),
    ...createGameplayTools(),
    ...createAssetBuildTools(),
  ]);
  return registry;
}

describe('agentic master orchestrator', () => {
  it('executes fog, lighting and layout as an approved end-to-end pipeline', async () => {
    const orchestrator = new MasterOrchestrator();

    const result = await orchestrator.run('añade niebla, mejora la iluminación y reorganiza esta escena');
    const scene = activeScene(result);

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(scene.environment.fog?.enabled).toBe(true);
    expect(scene.layoutGroups.length).toBeGreaterThan(0);
    expect(result.state.toolResults.some((result) => result.toolName === 'environment.configureFog')).toBe(true);
    expect(result.state.toolResults.some((result) => result.toolName === 'lighting.adjustLight')).toBe(true);
    expect(result.state.traces.some((trace) => trace.eventType === 'validation.approved')).toBe(true);
  });

  it('creates an NPC with patrol behavior and physics components', async () => {
    const orchestrator = new MasterOrchestrator();

    const result = await orchestrator.run('crea un NPC con patrulla simple y colisiones correctas');
    const npc = Object.values(result.worldState.entities).find((entity) => entity.type === 'npc');
    const componentTypes = npc ? Object.values(npc.components).map((component) => component.type) : [];

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(npc?.name).toBe('Patrol NPC');
    expect(componentTypes).toContain('Script');
    expect(componentTypes).toContain('Collider');
    expect(componentTypes).toContain('Rigidbody');
    expect(Object.values(result.worldState.scripts).some((script) => script.metadata.behavior === 'patrol')).toBe(true);
  });

  it('corrects an over-lit scene when the request requires a dark environment', async () => {
    const world = new WorldStateManager();
    world.createScene({
      name: 'Too Bright Scene',
      environment: {
        mood: 'bright',
        ambientIntensity: 1,
        directionalLightIntensity: 1.4,
      },
    });
    const orchestrator = new MasterOrchestrator({ world });

    const result = await orchestrator.run(
      'corrige esta escena porque el pedido pedía ambiente oscuro y quedó demasiado iluminada'
    );
    const scene = activeScene(result);

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(scene.environment.mood).toBe('dark');
    expect(scene.environment.ambientIntensity).toBeLessThanOrEqual(0.35);
    expect(scene.environment.directionalLightIntensity).toBeLessThanOrEqual(0.65);
  });

  it('runs scene.analyze before mutating when the request is ambiguous', async () => {
    const world = new WorldStateManager();
    world.createScene({ name: 'Ambiguous Scene' });
    const orchestrator = new MasterOrchestrator({ world });

    const result = await orchestrator.run('modifica esta escena');
    const scene = activeScene(result);
    const toolNames = result.state.toolResults.map((toolResult) => toolResult.toolName);
    const analyzeIndex = toolNames.indexOf('scene.analyze');
    const modifyIndex = toolNames.indexOf('scene.modify');

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(analyzeIndex).toBeGreaterThanOrEqual(0);
    expect(modifyIndex).toBeGreaterThan(analyzeIndex);
    expect(result.state.toolResults[analyzeIndex]).toMatchObject({
      toolName: 'scene.analyze',
      mutatesWorld: false,
      evidenceContract: 'none',
      evidence: [],
    });
    expect(result.state.sharedMemory.analyses[0]).toMatchObject({
      toolName: 'scene.analyze',
      agentRole: 'maintenance',
      scope: 'active_scene',
    });
    expect(result.state.sharedMemory.actionableRecommendations.length).toBeGreaterThan(0);
    expect(result.state.sharedMemory.actionableRecommendations[0]).toMatchObject({
      approvalStatus: 'pending',
      approvalKey: expect.stringContaining('scene.analyze:'),
    });
    expect(scene.metadata.analysisId).toBe(result.state.sharedMemory.analyses[0].id);
    expect(result.state.plan?.steps[0]).toMatchObject({
      title: 'Analyze scene before mutation',
      agentRole: 'maintenance',
      allowedToolNames: expect.arrayContaining(['scene.analyze']),
    });
  });

  it('blocks mutating steps until ambiguous inspection recommendations are approved', async () => {
    const world = new WorldStateManager();
    world.createScene({ name: 'Approval Gate Scene' });
    const orchestrator = new MasterOrchestrator({
      world,
      requireRecommendationApproval: true,
      maxIterations: 1,
    });

    const result = await orchestrator.run('modifica esta escena');
    const toolNames = result.state.toolResults.map((toolResult) => toolResult.toolName);
    const scene = activeScene(result);

    expect(result.state.finalDecision?.approved).toBe(false);
    expect(toolNames).toEqual(['scene.analyze']);
    expect(result.state.stepResults.some((step) => step.errors.includes('RECOMMENDATION_APPROVAL_REQUIRED'))).toBe(true);
    expect(result.state.sharedMemory.actionableRecommendations[0]).toMatchObject({
      approvalStatus: 'pending',
    });
    expect(scene.metadata.analysisId).toBeUndefined();
  });

  it('replans from approved recommendations and lets non-architect agents consume recommendation input', async () => {
    const world = new WorldStateManager();
    world.createScene({
      name: 'Dark Approval Scene',
      environment: {
        mood: 'dark',
        ambientIntensity: 0.9,
        directionalLightIntensity: 1.2,
      },
    });
    const orchestrator = new MasterOrchestrator({
      world,
      requireRecommendationApproval: true,
      recommendationApprovals: {
        'scene.analyze:DARK_SCENE_TOO_BRIGHT:lighting.adjustLight': 'approved',
      },
      maxIterations: 3,
    });

    const result = await orchestrator.run('modifica esta escena');
    const scene = activeScene(result);

    expect(result.state.finalDecision?.approved).toBe(true);
    const lightingRecommendation = result.state.sharedMemory.actionableRecommendations.find((recommendation) =>
      recommendation.suggestedToolNames.includes('lighting.adjustLight')
    );
    expect(lightingRecommendation).toMatchObject({
      approvalStatus: 'approved',
      suggestedToolNames: ['lighting.adjustLight'],
    });
    expect(scene.environment.mood).toBe('dark');
    expect(scene.environment.ambientIntensity).toBe(0.22);
    expect(scene.environment.directionalLightIntensity).toBe(0.45);
    expect(result.state.traces.some((trace) => trace.message.includes('approved recommendations'))).toBe(true);
    expect(result.state.traces.find((trace) => trace.eventType === 'recommendation.unlocked_mutation')).toMatchObject({
      actor: 'lighting_environment',
      data: expect.objectContaining({
        approvedRecommendationKeys: ['scene.analyze:DARK_SCENE_TOO_BRIGHT:lighting.adjustLight'],
        suggestedToolNames: ['lighting.adjustLight'],
      }),
    });
  });

  it('uses world.inspect for unknown global requests without mutating the world', async () => {
    const orchestrator = new MasterOrchestrator();

    const result = await orchestrator.run('haz algo mejor');
    const toolNames = result.state.toolResults.map((toolResult) => toolResult.toolName);

    expect(result.state.finalDecision?.approved).toBe(true);
    expect(toolNames).toEqual(['world.inspect']);
    expect(result.state.toolResults[0]).toMatchObject({
      toolName: 'world.inspect',
      mutatesWorld: false,
      evidenceContract: 'none',
      evidence: [],
    });
    expect(result.worldState.activeSceneId).toBeNull();
    expect(result.state.sharedMemory.analyses[0]).toMatchObject({
      toolName: 'world.inspect',
      scope: 'world',
    });
  });

  it('converts actionable analysis recommendations into executable plan steps', () => {
    const intent = new IntentAnalyzer().parseUserIntent('haz una revisión de la escena');
    const planner = new TaskPlanner();
    const plan = planner.buildExecutionPlanFromRecommendations(
      intent,
      [
        {
          id: 'recommendation-lighting',
          sourceToolName: 'scene.analyze',
          sourceCallId: 'tool-scene-analyze',
          summary: 'Scene mood is dark but ambient intensity is high.',
          rationale: 'DARK_SCENE_TOO_BRIGHT',
          priority: 'critical',
          suggestedDomain: 'lighting',
          suggestedCapabilities: ['lighting.adjustLight'],
          suggestedToolNames: ['lighting.adjustLight'],
          input: { mood: 'dark', ambientIntensity: 0.22 },
          confidence: 0.86,
          approvalKey: 'scene.analyze:DARK_SCENE_TOO_BRIGHT:lighting.adjustLight',
          approvalStatus: 'approved',
        },
        {
          id: 'recommendation-rejected',
          sourceToolName: 'scene.analyze',
          sourceCallId: 'tool-scene-analyze',
          summary: 'Rejected maintenance suggestion.',
          rationale: 'NO_BLOCKING_ISSUE',
          priority: 'optional',
          suggestedDomain: 'maintenance',
          suggestedCapabilities: ['asset.reindex'],
          suggestedToolNames: ['asset.reindex'],
          input: { reason: 'ignored' },
          confidence: 0.7,
          approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
          approvalStatus: 'rejected',
        },
      ],
      2
    );

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      title: 'Apply recommendation: Scene mood is dark but ambient intensity is high.',
      domain: 'lighting',
      agentRole: 'lighting_environment',
      requiredCapabilities: ['lighting.adjustLight'],
    });
  });

  it('rejects an incomplete delivery and replans until the missing fog requirement is satisfied', async () => {
    const orchestrator = new MasterOrchestrator({
      tools: createRegistryWithFogFailureOnce(),
      maxIterations: 3,
    });

    const result = await orchestrator.run('añade niebla, mejora la iluminación y reorganiza esta escena');
    const reports = result.state.validationReports;
    const scene = activeScene(result);

    expect(reports.length).toBeGreaterThan(1);
    expect(reports[0]?.approved).toBe(false);
    expect(reports[0]?.missingRequirements).toContain('environment.configureFog');
    expect(result.state.finalDecision?.approved).toBe(true);
    expect(scene.environment.fog?.enabled).toBe(true);
    expect(result.state.traces.some((trace) => trace.eventType === 'replan.created')).toBe(true);
  });
});
