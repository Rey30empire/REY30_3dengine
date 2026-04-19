import { describe, expect, it } from 'vitest';
import { WorldStateManager } from '@/engine/agentic/memory/WorldStateManager';
import { ToolRegistry, createToolCall } from '@/engine/agentic/tools/ToolRegistry';
import { createInspectionTools } from '@/engine/agentic/tools/inspectionTools';
import type { ExecutionTrace, ToolDefinition } from '@/engine/agentic';

function createTraceSink() {
  const traces: ExecutionTrace[] = [];
  return {
    traces,
    trace: {
      write(event: Omit<ExecutionTrace, 'id' | 'timestamp'>): ExecutionTrace {
        const trace = {
          ...event,
          id: `trace-${traces.length + 1}`,
          timestamp: '2026-04-16T00:00:00.000Z',
        };
        traces.push(trace);
        return trace;
      },
    },
  };
}

describe('agentic tool registry evidence contract', () => {
  it('rejects successful mutating tools that omit before/after evidence', async () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition = {
      name: 'entity.create',
      description: 'Broken mutating tool for contract testing.',
      capabilities: ['entity.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(_input, context) {
        return {
          callId: context.call.id,
          toolName: context.call.toolName,
          success: true,
          message: 'Created entity without full evidence.',
          evidence: [
            {
              id: 'evidence-missing-before-after',
              type: 'entity',
              targetId: 'entity-1',
              summary: 'Missing before/after.',
              timestamp: '2026-04-16T00:00:00.000Z',
            },
          ],
          output: { entityId: 'entity-1' },
          startedAt: '2026-04-16T00:00:00.000Z',
          completedAt: '2026-04-16T00:00:00.000Z',
        };
      },
    };
    registry.register(tool);
    const { trace, traces } = createTraceSink();

    const result = await registry.execute(
      createToolCall('entity.create', 'modeling', 'step-contract', {}),
      {
        pipelineId: 'pipeline-contract',
        iteration: 1,
        stepId: 'step-contract',
        agentRole: 'modeling',
        world: new WorldStateManager(),
        trace,
      }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MUTATING_TOOL_EVIDENCE_CONTRACT_FAILED');
    expect(result.evidence[0].id).toBe('evidence-missing-before-after');
    expect(traces.at(-1)).toMatchObject({
      eventType: 'tool.failed',
      message: expect.stringContaining('before/after'),
    });
  });

  it('allows consultative tools with mutatesWorld false and no evidence contract', async () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition = {
      name: 'world.inspect',
      description: 'Inspect world state without mutating it.',
      capabilities: ['world.inspect'],
      mutatesWorld: false,
      evidenceContract: 'none',
      execute(_input, context) {
        return {
          callId: context.call.id,
          toolName: context.call.toolName,
          success: true,
          message: 'World inspected.',
          evidence: [],
          output: { entityCount: Object.keys(context.world.getSnapshot().entities).length },
          startedAt: '2026-04-16T00:00:00.000Z',
          completedAt: '2026-04-16T00:00:00.000Z',
        };
      },
    };
    registry.register(tool);
    const { trace } = createTraceSink();

    const result = await registry.execute(
      createToolCall('world.inspect', 'maintenance', 'step-contract', {}),
      {
        pipelineId: 'pipeline-contract',
        iteration: 1,
        stepId: 'step-contract',
        agentRole: 'maintenance',
        world: new WorldStateManager(),
        trace,
      }
    );

    expect(result.success).toBe(true);
    expect(result.mutatesWorld).toBe(false);
    expect(result.evidenceContract).toBe('none');
  });

  it('executes the real scene.analyze tool without mutating world state', async () => {
    const registry = new ToolRegistry();
    registry.registerMany(createInspectionTools());
    const world = new WorldStateManager();
    world.createScene({ name: 'Inspection Scene' });
    const before = world.getSnapshot();
    const { trace } = createTraceSink();

    const result = await registry.execute(
      createToolCall('scene.analyze', 'maintenance', 'step-inspect', { scope: 'active_scene' }),
      {
        pipelineId: 'pipeline-inspect',
        iteration: 1,
        stepId: 'step-inspect',
        agentRole: 'maintenance',
        world,
        trace,
      }
    );

    expect(result.success).toBe(true);
    expect(result.mutatesWorld).toBe(false);
    expect(result.evidenceContract).toBe('none');
    expect(result.evidence).toHaveLength(0);
    expect(result.output?.activeSceneName).toBe('Inspection Scene');
    expect(result.output?.actionableRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceToolName: 'scene.analyze',
          suggestedToolNames: expect.arrayContaining(['entity.create']),
          approvalStatus: 'pending',
          approvalKey: expect.stringContaining('scene.analyze:'),
        }),
      ])
    );
    expect(world.getSnapshot()).toEqual(before);
  });

  it('executes the real world.inspect tool as a global read-only inspection', async () => {
    const registry = new ToolRegistry();
    registry.registerMany(createInspectionTools());
    const world = new WorldStateManager();
    const before = world.getSnapshot();
    const { trace } = createTraceSink();

    const result = await registry.execute(
      createToolCall('world.inspect', 'maintenance', 'step-world-inspect', { scope: 'world' }),
      {
        pipelineId: 'pipeline-world-inspect',
        iteration: 1,
        stepId: 'step-world-inspect',
        agentRole: 'maintenance',
        world,
        trace,
      }
    );

    expect(result.success).toBe(true);
    expect(result.mutatesWorld).toBe(false);
    expect(result.evidenceContract).toBe('none');
    expect(result.output?.scope).toBe('world');
    expect(result.output?.actionableRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceToolName: 'world.inspect',
          suggestedToolNames: expect.arrayContaining(['scene.create']),
          approvalStatus: 'pending',
          approvalKey: expect.stringContaining('world.inspect:'),
        }),
      ])
    );
    expect(world.getSnapshot()).toEqual(before);
  });

  it('blocks tools that declare an incompatible evidence contract', () => {
    const registry = new ToolRegistry();
    const tool = {
      name: 'scene.inspect-broken',
      description: 'Invalid consultative tool contract.',
      capabilities: ['scene.inspect'],
      mutatesWorld: false,
      evidenceContract: 'before_after',
      execute(_input: Record<string, unknown>, context: Parameters<ToolDefinition['execute']>[1]) {
        return {
          callId: context.call.id,
          toolName: context.call.toolName,
          success: true,
          message: 'Invalid contract should never execute.',
          evidence: [],
          output: {},
          startedAt: '2026-04-16T00:00:00.000Z',
          completedAt: '2026-04-16T00:00:00.000Z',
        };
      },
    } as unknown as ToolDefinition;

    expect(() => registry.register(tool)).toThrow(/TOOL_EVIDENCE_CONTRACT_INVALID/);
  });
});
