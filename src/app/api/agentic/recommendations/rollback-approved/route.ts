import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
  createEditorProjectSaveData,
  restoreEditorProjectSaveData,
  type EditorProjectSaveData,
} from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  buildEditorProjectRecord,
  readEditorProjectRecord,
  withEditorProjectWriteLock,
  writeEditorProjectRecord,
} from '@/lib/server/editor-project-storage';
import {
  findAgenticExecutionHistoryRecord,
  markAgenticRecommendationMutationIndexRollback,
  readAgenticExecutionSnapshot,
  updateAgenticExecutionHistoryRecord,
  type AgenticExecutionHistoryRecord,
} from '@/lib/server/agentic-execution-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RollbackApprovedBody = {
  projectKey?: unknown;
  slot?: unknown;
  executionId?: unknown;
  recommendationId?: unknown;
};

type RollbackTargets = {
  sceneIds: Set<string>;
  environmentSceneIds: Set<string>;
  entityIds: Set<string>;
  assetIds: Set<string>;
  toolCallIds: Set<string>;
  recommendationIds: Set<string>;
  recommendationKeys: Set<string>;
};

type EditorSession = EditorProjectSaveData['custom']['snapshot']['session'];

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

function cloneSerializable<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function readProjectKey(request: NextRequest, fallback?: unknown) {
  const fromHeader = request.headers.get('x-rey30-project');
  const fromQuery = request.nextUrl.searchParams.get('projectKey');
  const fromBody = typeof fallback === 'string' ? fallback : null;
  return normalizeProjectKey(fromHeader || fromQuery || fromBody);
}

function readSlot(request: NextRequest, fallback?: unknown) {
  const fromQuery = request.nextUrl.searchParams.get('slot')?.trim();
  const fromBody = typeof fallback === 'string' ? fallback.trim() : '';
  return fromQuery || fromBody || DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
}

function readExecutionId(request: NextRequest, fallback?: unknown) {
  const fromQuery = request.nextUrl.searchParams.get('executionId')?.trim();
  const fromBody = typeof fallback === 'string' ? fallback.trim() : '';
  return fromQuery || fromBody;
}

function readRecommendationId(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function createEmptyTargets(): RollbackTargets {
  return {
    sceneIds: new Set(),
    environmentSceneIds: new Set(),
    entityIds: new Set(),
    assetIds: new Set(),
    toolCallIds: new Set(),
    recommendationIds: new Set(),
    recommendationKeys: new Set(),
  };
}

function targetMatchesRecommendation(
  mutation: NonNullable<AgenticExecutionHistoryRecord['recommendationExecution']>['unlockedMutations'][number],
  recommendationId: string
) {
  if (!recommendationId) {
    return true;
  }
  return (
    mutation.recommendationIds.includes(recommendationId) ||
    mutation.recommendationKeys.includes(recommendationId)
  );
}

function addTargetByType(targets: RollbackTargets, type: string, id: string) {
  if (!id) {
    return;
  }
  if (type === 'scene') {
    targets.sceneIds.add(id);
    return;
  }
  if (type === 'environment' || type === 'lighting') {
    targets.environmentSceneIds.add(id);
    return;
  }
  if (type === 'asset' || type === 'material') {
    targets.assetIds.add(id);
    return;
  }
  if (type === 'entity' || type === 'component' || type === 'animation' || type === 'physics' || type === 'script') {
    targets.entityIds.add(id);
  }
}

function collectTargetsFromRecommendationExecution(
  record: AgenticExecutionHistoryRecord,
  recommendationId: string
) {
  const targets = createEmptyTargets();
  const link = record.recommendationExecution;
  if (!link) {
    return targets;
  }

  for (const mutation of link.unlockedMutations) {
    if (!targetMatchesRecommendation(mutation, recommendationId)) {
      continue;
    }
    targets.toolCallIds.add(mutation.toolCallId);
    mutation.recommendationIds.forEach((id) => targets.recommendationIds.add(id));
    mutation.recommendationKeys.forEach((key) => targets.recommendationKeys.add(key));
    for (const target of mutation.targets) {
      addTargetByType(targets, target.type, target.id);
    }
  }

  return targets;
}

function addDiffFallbackTargets(record: AgenticExecutionHistoryRecord, targets: RollbackTargets) {
  const diff = record.diff;
  if (!diff) {
    return targets;
  }
  for (const item of [
    ...diff.rollbackPreview.willRemove.scenes,
    ...diff.rollbackPreview.willRestore.scenes,
    ...diff.rollbackPreview.willRevert.scenes,
  ]) {
    targets.sceneIds.add(item.id);
  }
  for (const item of [
    ...diff.rollbackPreview.willRemove.entities,
    ...diff.rollbackPreview.willRestore.entities,
    ...diff.rollbackPreview.willRevert.entities,
  ]) {
    targets.entityIds.add(item.id);
  }
  for (const component of diff.rollbackPreview.willRevert.components) {
    targets.entityIds.add(component.entityId);
  }
  for (const item of [
    ...diff.rollbackPreview.willRemove.assets,
    ...diff.rollbackPreview.willRestore.assets,
    ...diff.rollbackPreview.willRevert.assets,
  ]) {
    targets.assetIds.add(item.id);
  }
  return targets;
}

function hasRollbackTargets(targets: RollbackTargets) {
  return (
    targets.sceneIds.size > 0 ||
    targets.environmentSceneIds.size > 0 ||
    targets.entityIds.size > 0 ||
    targets.assetIds.size > 0
  );
}

function collectRollbackTargets(record: AgenticExecutionHistoryRecord, recommendationId: string) {
  const targets = collectTargetsFromRecommendationExecution(record, recommendationId);
  if (hasRollbackTargets(targets) || recommendationId) {
    return targets;
  }
  return addDiffFallbackTargets(record, targets);
}

function allRecommendationsRolledBack(
  record: AgenticExecutionHistoryRecord,
  nextRecommendationIds: Set<string>,
  nextRecommendationKeys: Set<string>
) {
  const link = record.recommendationExecution;
  if (!link) {
    return false;
  }
  return link.recommendations.every(
    (recommendation) =>
      nextRecommendationIds.has(recommendation.id) ||
      nextRecommendationKeys.has(recommendation.approvalKey)
  );
}

function replaceOrRemoveById<T extends { id: string }>(
  current: T[],
  before: T[],
  ids: Set<string>
) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const next = current
    .filter((item) => !(ids.has(item.id) && !beforeById.has(item.id)))
    .map((item) => (ids.has(item.id) && beforeById.has(item.id) ? cloneSerializable(beforeById.get(item.id) as T) : item));

  for (const id of ids) {
    if (!next.some((item) => item.id === id) && beforeById.has(id)) {
      next.push(cloneSerializable(beforeById.get(id) as T));
    }
  }

  return next;
}

function restoreSceneEnvironments(current: EditorSession, before: EditorSession, sceneIds: Set<string>) {
  const beforeScenes = new Map(before.scenes.map((scene) => [scene.id, scene]));
  current.scenes = current.scenes.map((scene) => {
    if (!sceneIds.has(scene.id)) {
      return scene;
    }
    const beforeScene = beforeScenes.get(scene.id);
    return beforeScene
      ? {
          ...scene,
          environment: cloneSerializable(beforeScene.environment),
          updatedAt: beforeScene.updatedAt,
        }
      : scene;
  });
}

function reconcileSceneEntityMembership(current: EditorSession, before: EditorSession, touchedEntityIds: Set<string>) {
  const validEntityIds = new Set(current.entities.map((entity) => entity.id));
  const beforeScenes = before.scenes;

  current.scenes = current.scenes.map((scene) => {
    const nextEntityIds = scene.entityIds.filter((entityId) => validEntityIds.has(entityId));
    const nextRootEntities = scene.rootEntities.filter((entityId) => validEntityIds.has(entityId));

    for (const entityId of touchedEntityIds) {
      if (!validEntityIds.has(entityId)) {
        continue;
      }
      const beforeScene = beforeScenes.find((candidate) => candidate.entityIds.includes(entityId));
      if (beforeScene?.id !== scene.id) {
        continue;
      }
      if (!nextEntityIds.includes(entityId)) {
        nextEntityIds.push(entityId);
      }
      if (beforeScene.rootEntities.includes(entityId) && !nextRootEntities.includes(entityId)) {
        nextRootEntities.push(entityId);
      }
    }

    return {
      ...scene,
      entityIds: nextEntityIds,
      rootEntities: nextRootEntities,
    };
  });
}

function applyPartialRollback(params: {
  current: EditorProjectSaveData;
  before: EditorProjectSaveData;
  targets: RollbackTargets;
}) {
  const next = cloneSerializable(params.current);
  const session = next.custom.snapshot.session;
  const beforeSession = params.before.custom.snapshot.session;

  session.scenes = replaceOrRemoveById(session.scenes, beforeSession.scenes, params.targets.sceneIds);
  session.entities = replaceOrRemoveById(session.entities, beforeSession.entities, params.targets.entityIds);
  session.assets = replaceOrRemoveById(session.assets, beforeSession.assets, params.targets.assetIds);
  restoreSceneEnvironments(session, beforeSession, params.targets.environmentSceneIds);
  reconcileSceneEntityMembership(session, beforeSession, params.targets.entityIds);

  const validSceneIds = new Set(session.scenes.map((scene) => scene.id));
  const validEntityIds = new Set(session.entities.map((entity) => entity.id));
  session.activeSceneId = session.activeSceneId && validSceneIds.has(session.activeSceneId)
    ? session.activeSceneId
    : session.scenes[0]?.id ?? null;
  session.editor.selectedEntities = session.editor.selectedEntities.filter((entityId) =>
    validEntityIds.has(entityId)
  );
  next.custom.snapshot.scribProfiles = next.custom.snapshot.scribProfiles.filter((profile) =>
    validEntityIds.has(profile.entityId)
  );
  next.custom.snapshot.scribInstances = next.custom.snapshot.scribInstances.filter((instance) =>
    instance.target.scope === 'entity'
      ? validEntityIds.has(instance.target.id)
      : validSceneIds.has(instance.target.id)
  );

  const restored = restoreEditorProjectSaveData(next);
  return restored ? createEditorProjectSaveData(restored, { markClean: false }) : null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as RollbackApprovedBody;
    const projectKey = readProjectKey(request, body.projectKey);
    const slot = readSlot(request, body.slot);
    const executionId = readExecutionId(request, body.executionId);
    const recommendationId = readRecommendationId(body.recommendationId);

    if (!executionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'El executionId de ejecución aprobada es obligatorio.',
        },
        { status: 400 }
      );
    }

    return await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      timeoutMs: 30_000,
      staleLockMs: 120_000,
      work: async () => {
        const record = findAgenticExecutionHistoryRecord({
          userId: user.id,
          projectKey,
          slot,
          executionId,
        });

        if (!record?.recommendationExecution) {
          return NextResponse.json(
            {
              success: false,
              error: 'La ejecución no está enlazada a recomendaciones aprobadas.',
              projectKey,
              slot,
              executionId,
            },
            { status: 404 }
          );
        }
        if (record.recommendationExecution.partialRollback.applied) {
          return NextResponse.json(
            {
              success: false,
              error: 'El rollback parcial ya fue aplicado para esta ejecución.',
              projectKey,
              slot,
              executionId,
            },
            { status: 409 }
          );
        }
        if (
          recommendationId &&
          (
            record.recommendationExecution.partialRollback.recommendationIds.includes(recommendationId) ||
            record.recommendationExecution.partialRollback.recommendationKeys.includes(recommendationId)
          )
        ) {
          return NextResponse.json(
            {
              success: false,
              error: 'Esa recomendación ya fue revertida parcialmente.',
              projectKey,
              slot,
              executionId,
              recommendationId,
            },
            { status: 409 }
          );
        }

        const currentProject = readEditorProjectRecord({
          userId: user.id,
          projectKey,
          slot,
        });
        const beforeSnapshot = readAgenticExecutionSnapshot({
          userId: user.id,
          projectKey,
          slot,
          executionId,
          kind: 'before',
        });

        if (!currentProject || !beforeSnapshot) {
          return NextResponse.json(
            {
              success: false,
              error: 'Falta el save actual o snapshot before para rollback parcial.',
              projectKey,
              slot,
              executionId,
            },
            { status: 409 }
          );
        }

        const targets = collectRollbackTargets(record, recommendationId);
        if (!hasRollbackTargets(targets)) {
          return NextResponse.json(
            {
              success: false,
              error: 'No hay targets suficientes para rollback parcial seguro.',
              projectKey,
              slot,
              executionId,
            },
            { status: 409 }
          );
        }

        const nextSaveData = applyPartialRollback({
          current: currentProject.saveData,
          before: beforeSnapshot,
          targets,
        });
        if (!nextSaveData) {
          return NextResponse.json(
            {
              success: false,
              error: 'El rollback parcial produjo un save inválido.',
              projectKey,
              slot,
              executionId,
            },
            { status: 422 }
          );
        }

        const nextProjectRecord = buildEditorProjectRecord({
          userId: user.id,
          projectKey,
          slot,
          saveData: nextSaveData,
        });
        writeEditorProjectRecord(nextProjectRecord);

        const appliedAt = new Date().toISOString();
        const updatedRecord = updateAgenticExecutionHistoryRecord({
          userId: user.id,
          projectKey,
          slot,
          executionId,
          update: (current) => ({
            ...current,
            recommendationExecution: current.recommendationExecution
              ? (() => {
                  const nextRecommendationIds = new Set([
                    ...current.recommendationExecution.partialRollback.recommendationIds,
                    ...targets.recommendationIds,
                  ]);
                  const nextRecommendationKeys = new Set([
                    ...current.recommendationExecution.partialRollback.recommendationKeys,
                    ...targets.recommendationKeys,
                  ]);
                  const nextToolCallIds = new Set([
                    ...current.recommendationExecution.partialRollback.toolCallIds,
                    ...targets.toolCallIds,
                  ]);
                  const nextTargetIds = new Set([
                    ...current.recommendationExecution.partialRollback.targetIds,
                    ...targets.sceneIds,
                    ...targets.environmentSceneIds,
                    ...targets.entityIds,
                    ...targets.assetIds,
                  ]);
                  const applied = allRecommendationsRolledBack(
                    current,
                    nextRecommendationIds,
                    nextRecommendationKeys
                  );
                  return {
                    ...current.recommendationExecution,
                    partialRollback: {
                      available: !applied,
                      applied,
                      appliedAt,
                      recommendationIds: [...nextRecommendationIds],
                      recommendationKeys: [...nextRecommendationKeys],
                      toolCallIds: [...nextToolCallIds],
                      targetIds: [...nextTargetIds],
                    },
                  };
                })()
              : null,
            traces: [
              ...(current.traces ?? []),
              {
                eventType: 'recommendation.partial_rollback',
                severity: 'info',
                actor: 'user',
                message: 'Partial rollback applied for approved recommendation execution.',
                data: {
                  executionId,
                  recommendationId: recommendationId || null,
                  recommendationIds: [...targets.recommendationIds],
                  recommendationKeys: [...targets.recommendationKeys],
                  toolCallIds: [...targets.toolCallIds],
                  targetIds: [
                    ...targets.sceneIds,
                    ...targets.environmentSceneIds,
                    ...targets.entityIds,
                    ...targets.assetIds,
                  ],
                },
                timestamp: appliedAt,
              },
            ],
          }),
        });
        markAgenticRecommendationMutationIndexRollback({
          userId: user.id,
          projectKey,
          slot,
          executionId,
          recommendationKeys: [...targets.recommendationKeys],
          appliedAt,
        });

        return NextResponse.json({
          success: true,
          action: 'partial_rollback',
          projectKey,
          slot,
          executionId,
          recommendationId: recommendationId || null,
          summary: nextProjectRecord.summary,
          record: updatedRecord,
        });
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[agentic] approved recommendation partial rollback failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo aplicar rollback parcial de recomendación aprobada.',
      },
      { status: 500 }
    );
  }
}
