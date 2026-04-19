import { describe, expect, it } from 'vitest';
import {
  applyAgentPlannerAssistantResult,
  applyAgentPlannerCustomTaskMetadataRevert,
  applyAgentPlannerCustomTaskMetadataUpdate,
  applyAgentPlannerStageUpdate,
  createAgentPlannerRecord,
  resumeAgentPlanner,
  syncAgentPlannerAssistantJob,
  toClientAgentPlannerPlan,
} from '@/engine/ai/agentPlanner';

describe('agent planner', () => {
  it('creates a durable draft planner with pending stages and telemetry', () => {
    const plan = createAgentPlannerRecord({
      planId: 'plan_1',
      projectKey: 'star_forge',
      prompt: 'Personaje jugable fantasy con rig y export',
      level: 'level3_full_character',
    });

    expect(plan.status).toBe('draft');
    expect(plan.projectKey).toBe('star_forge');
    expect(plan.stages.length).toBeGreaterThan(3);
    expect(plan.stages.every((stage) => stage.status === 'pending')).toBe(true);
    expect(plan.telemetry.totalStages).toBe(plan.stages.length);
    expect(plan.telemetry.pendingStages).toBe(plan.stages.length);
    expect(plan.events.at(-1)?.kind).toBe('created');
    expect(plan.receipts?.at(-1)).toMatchObject({
      action: 'create',
      planStatus: 'draft',
      execution: {
        state: 'idle',
      },
    });
    expect(plan.jobs?.at(-1)).toMatchObject({
      attemptNumber: 1,
      action: 'create',
      status: 'queued',
      executionState: 'idle',
      persisted: true,
    });
    expect(plan.status).toBe('draft');
  });

  it('tracks stage progress, failures and resume transitions', () => {
    let plan = createAgentPlannerRecord({
      planId: 'plan_2',
      projectKey: 'star_forge',
      prompt: 'Pipeline completo de personaje',
      level: 'level3_full_character',
    });

    plan = applyAgentPlannerStageUpdate(plan, {
      stageId: 'prompt_interpretation',
      status: 'running',
      resultSummary: 'Brief técnico en revisión.',
    });
    expect(plan.status).toBe('running');
    expect(plan.telemetry.runningStageId).toBe('prompt_interpretation');

    plan = applyAgentPlannerStageUpdate(plan, {
      stageId: 'prompt_interpretation',
      status: 'completed',
      resultSummary: 'Brief técnico validado.',
    });
    expect(plan.telemetry.completedStages).toBe(1);
    expect(plan.stages[0]?.completedAt).toBeTruthy();

    plan = applyAgentPlannerStageUpdate(plan, {
      stageId: 'concept_views',
      status: 'failed',
      resultSummary: 'Las vistas no pasaron la revisión.',
    });
    expect(plan.status).toBe('failed');
    expect(plan.telemetry.failedStages).toBe(1);

    plan = resumeAgentPlanner(plan);
    expect(plan.lastResumedAt).toBeTruthy();
    expect(plan.events.at(-1)?.kind).toBe('resumed');
    expect(plan.receipts?.at(-1)).toMatchObject({
      action: 'resume',
      planStatus: 'running',
      execution: {
        state: 'blocked',
      },
    });
    expect(plan.jobs?.at(-1)).toMatchObject({
      attemptNumber: 2,
      action: 'resume',
      status: 'blocked',
      executionState: 'blocked',
      resumable: true,
    });
    const clientPlan = toClientAgentPlannerPlan(plan);
    expect(clientPlan.execution).toMatchObject({
      state: 'blocked',
      currentStageId: null,
      nextStageId: expect.any(String),
      resumable: true,
      lastEventKind: 'resumed',
    });
    expect(clientPlan.receipts.at(-1)).toMatchObject({
      action: 'resume',
      execution: {
        state: 'blocked',
      },
    });
    expect(clientPlan.jobs.at(-1)).toMatchObject({
      attemptNumber: 2,
      status: 'blocked',
      executionState: 'blocked',
    });
  });

  it('supports native custom stages and custom tasks without using checkpoints as tasks', () => {
    let plan = createAgentPlannerRecord({
      planId: 'plan_custom_p2',
      projectKey: 'star_forge',
      prompt: 'P2 review-to-reanalysis aprobado',
      level: 'level1_copilot',
      customSummary: 'Planner P2 custom con tareas aprobadas.',
      customCheckpoints: ['Solo ejecutar bloques aprobados.'],
      customTasks: [
        {
          taskId: 'p2_task_scope_review',
          title: 'Scope revisable aprobado',
          summary: 'Convertir scope aprobado en implementación controlada.',
          priority: 'high',
          owner: 'agentic_orchestrator',
          evidenceRefs: ['reviewBlocks.scope'],
          requiredDecisions: ['scope approved'],
          sourceBlockId: 'detected_scope_review',
        },
        {
          taskId: 'p2_task_ui_trace',
          title: 'Trazabilidad UI',
          summary: 'Exponer decisiones aprobadas en UI.',
          priority: 'medium',
          owner: 'technical_lead',
          evidenceRefs: ['reviewBlocks.ui'],
          requiredDecisions: ['ui surface approved'],
          sourceBlockId: 'focus_ui_traceability',
        },
      ],
    });

    expect(plan.stages.map((stage) => stage.stageId)).toEqual([
      'custom_p2_task_scope_review',
      'custom_p2_task_ui_trace',
    ]);
    expect(plan.customTasks).toHaveLength(2);
    expect(plan.customStages?.[0]).toMatchObject({
      stageId: 'custom_p2_task_scope_review',
      taskIds: ['p2_task_scope_review'],
    });
    expect(plan.checkpoints).toEqual(['Solo ejecutar bloques aprobados.']);

    plan = applyAgentPlannerStageUpdate(plan, {
      stageId: 'custom_p2_task_scope_review',
      status: 'completed',
      resultSummary: 'Scope P2 aprobado convertido en tarea cerrada.',
    });

    expect(plan.customTasks?.[0]).toMatchObject({
      taskId: 'p2_task_scope_review',
      status: 'completed',
    });
    expect(plan.telemetry.completedStages).toBe(1);

    const clientPlan = toClientAgentPlannerPlan(plan);
    expect(clientPlan.customTasks[0]).toMatchObject({
      taskId: 'p2_task_scope_review',
      status: 'completed',
      sourceBlockId: 'detected_scope_review',
    });
    expect(clientPlan.stages[0]).not.toHaveProperty('owner');
  });

  it('edits custom task metadata without changing task status', () => {
    const plan = createAgentPlannerRecord({
      planId: 'plan_custom_metadata',
      projectKey: 'star_forge',
      prompt: 'Planner custom editable',
      level: 'level1_copilot',
      customTasks: [
        {
          taskId: 'p2_task_metadata',
          title: 'Metadata editable',
          summary: 'Debe conservar estado y cambiar metadata.',
          priority: 'medium',
          owner: 'technical_lead',
          evidenceRefs: ['sourceBlock:scope_before', 'audit:manual'],
          sourceBlockId: 'scope_before',
        },
      ],
    });

    const updated = applyAgentPlannerCustomTaskMetadataUpdate(plan, {
      taskId: 'p2_task_metadata',
      title: 'Metadata editada',
      summary: 'Resumen editado con trazabilidad.',
      owner: 'maintenance_agent',
      priority: 'high',
      sourceBlockId: 'scope_after',
    });

    expect(updated.customTasks?.[0]).toMatchObject({
      taskId: 'p2_task_metadata',
      title: 'Metadata editada',
      summary: 'Resumen editado con trazabilidad.',
      status: 'pending',
      owner: 'maintenance_agent',
      priority: 'high',
      sourceBlockId: 'scope_after',
      evidenceRefs: ['audit:manual', 'sourceBlock:scope_after'],
    });
    expect(updated.customTasks?.[0].metadataHistory?.map((entry) => entry.field)).toEqual([
      'title',
      'summary',
      'owner',
      'priority',
      'sourceBlockId',
    ]);
    expect(updated.customStages?.[0]).toMatchObject({
      title: 'Metadata editada',
      owner: 'maintenance_agent',
    });
    expect(updated.stages[0]).toMatchObject({
      title: 'Metadata editada',
      owner: 'maintenance_agent',
      status: 'pending',
    });
    expect(updated.events.at(-1)).toMatchObject({
      kind: 'custom_task_updated',
    });
    expect(updated.receipts?.at(-1)).toMatchObject({
      action: 'custom_task_metadata',
    });

    const reverted = applyAgentPlannerCustomTaskMetadataRevert(updated, {
      taskId: 'p2_task_metadata',
      historyEntryId: updated.customTasks?.[0].metadataHistory?.[0].id ?? '',
    });
    expect(reverted.customTasks?.[0]).toMatchObject({
      taskId: 'p2_task_metadata',
      title: 'Metadata editable',
    });
    expect(reverted.customTasks?.[0].metadataHistory?.at(-1)).toMatchObject({
      field: 'title',
      before: 'Metadata editada',
      after: 'Metadata editable',
      source: 'metadata_revert',
      revertedChangeId: updated.customTasks?.[0].metadataHistory?.[0].id,
    });
    expect(reverted.events.at(-1)).toMatchObject({
      kind: 'custom_task_metadata_reverted',
    });
    expect(reverted.receipts?.at(-1)).toMatchObject({
      action: 'custom_task_metadata_revert',
    });
  });

  it('links assistant jobs durably into the planner timeline', () => {
    let plan = createAgentPlannerRecord({
      planId: 'plan_3',
      projectKey: 'star_forge',
      prompt: 'Genera personaje y export final',
      level: 'level3_full_character',
    });

    plan = syncAgentPlannerAssistantJob(plan, {
      taskId: 'character_job_123',
      kind: 'character',
      backend: 'character-job',
      status: 'queued',
      stage: 'queued',
      progress: 0,
    });
    plan = syncAgentPlannerAssistantJob(plan, {
      taskId: 'character_job_123',
      kind: 'character',
      backend: 'character-job',
      status: 'completed',
      stage: 'finalized',
      progress: 100,
      readyToFinalize: false,
      asset: {
        path: 'packages/hero_package.glb',
      },
    });

    expect(plan.assistantJobs?.at(-1)).toMatchObject({
      taskId: 'character_job_123',
      status: 'completed',
      stage: 'finalized',
      progress: 100,
      resultStatus: 'finalized',
      resultSummary: expect.stringContaining('paquete final'),
      lastReceiptId: expect.any(String),
      asset: {
        path: 'packages/hero_package.glb',
      },
    });
    expect(plan.events.at(-1)?.kind).toBe('assistant_job_completed');
    expect(plan.receipts?.at(-1)).toMatchObject({
      action: 'assistant_job',
      message: expect.stringContaining('paquete final'),
      execution: {
        state: 'idle',
      },
    });

    const clientPlan = toClientAgentPlannerPlan(plan);
    expect(clientPlan.assistantJobs.at(-1)).toMatchObject({
      taskId: 'character_job_123',
      status: 'completed',
      resultStatus: 'finalized',
    });
  });

  it('seals when an assistant result is actually applied to the project', () => {
    let plan = syncAgentPlannerAssistantJob(
      createAgentPlannerRecord({
        planId: 'plan_4',
        projectKey: 'star_forge',
        prompt: 'Importa el resultado AI al proyecto',
        level: 'level3_full_character',
      }),
      {
        taskId: 'model_job_321',
        kind: 'model3d',
        backend: 'meshy-model',
        status: 'completed',
        stage: 'done',
        progress: 100,
        asset: {
          url: 'https://cdn.example.com/model.glb',
          thumbnailUrl: 'https://cdn.example.com/model.png',
        },
      }
    );

    plan = applyAgentPlannerAssistantResult(plan, {
      taskId: 'model_job_321',
      summary: 'El modelo quedó agregado a assets del proyecto para edición inmediata.',
      asset: {
        url: 'https://cdn.example.com/model.glb',
        thumbnailUrl: 'https://cdn.example.com/model.png',
      },
    });

    expect(plan.assistantJobs?.at(-1)).toMatchObject({
      taskId: 'model_job_321',
      resultStatus: 'applied',
      resultSummary: 'El modelo quedó agregado a assets del proyecto para edición inmediata.',
      lastReceiptId: expect.any(String),
    });
    expect(plan.events.at(-1)?.kind).toBe('assistant_result_applied');
    expect(plan.receipts?.at(-1)).toMatchObject({
      action: 'assistant_apply',
      message: 'El modelo quedó agregado a assets del proyecto para edición inmediata.',
    });
  });
});
