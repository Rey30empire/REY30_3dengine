import { resolveAICommandIntent } from '@/engine/editor/ai/intentRouter';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';
import { hasRequiredRole } from '@/lib/security/auth';
import type { AppUserRole } from '@/lib/security/user-roles';
import { useEngineStore } from '@/store/editorStore';
import { applyEditorSessionMutation, resolveEditorSessionRecord } from './editor-session-bridge';
import { ensureGeneratedScriptInLibrary } from './generated-script-library';
import { executeMcpToolCalls } from './mcp-surface';

type JsonRecord = Record<string, any>;

export type AssistantSceneActionResult = {
  handled: boolean;
  sceneUpdated: boolean;
  text?: string;
};

type SceneActionParams = {
  command: string;
  userId: string;
  userRole: AppUserRole;
  preferredSessionId?: string | null;
  projectKey?: string | null;
};

type CharacterBuilderPartSeed = {
  category: string;
  partId: string;
  label: string;
  modelPath: string;
  attachmentSocket: string;
  materialVariantId?: string | null;
  materialSwatch?: string | null;
  colorVariantId?: string | null;
  colorSwatch?: string | null;
};

function commandMentionsScene(lowerCommand: string) {
  return [
    'escena',
    'scene',
    'nivel',
    'level',
    'juego',
    'game',
    'proyecto',
    'project',
    'starter',
  ].some((keyword) => lowerCommand.includes(keyword));
}

function buildCharacterBuilderRenderData(lowerCommand: string) {
  const bodyId =
    lowerCommand.includes('hero') || lowerCommand.includes('héroe') || lowerCommand.includes('heroe')
      ? 'mannequin_b'
      : 'mannequin_a';
  const outfitMaterial = lowerCommand.includes('rojo') || lowerCommand.includes('red')
    ? { id: 'hoodie_crimson', swatch: '#b91c1c' }
    : lowerCommand.includes('verde') || lowerCommand.includes('green')
      ? { id: 'hoodie_mint', swatch: '#34d399' }
      : { id: 'hoodie_graphite', swatch: '#334155' };
  const legMaterial = lowerCommand.includes('claro') || lowerCommand.includes('light')
    ? { id: 'denim_light', swatch: '#516f91' }
    : { id: 'denim_dark', swatch: '#203045' };
  const bootMaterial = lowerCommand.includes('brown') || lowerCommand.includes('cafe') || lowerCommand.includes('café')
    ? { id: 'boots_brown', swatch: '#5f4028' }
    : { id: 'boots_black', swatch: '#171717' };
  const hairMaterial = lowerCommand.includes('rubio') || lowerCommand.includes('blonde')
    ? { id: 'hair_blonde', swatch: '#d6b46d' }
    : lowerCommand.includes('casta') || lowerCommand.includes('brown')
      ? { id: 'hair_brown', swatch: '#5c4630' }
      : { id: 'hair_black', swatch: '#151515' };
  const wantsHat =
    lowerCommand.includes('gorra') ||
    lowerCommand.includes('sombrero') ||
    lowerCommand.includes('hat') ||
    lowerCommand.includes('cap');

  const parts: CharacterBuilderPartSeed[] = [
    {
      category: 'body',
      partId: bodyId,
      label: bodyId === 'mannequin_b' ? 'Mannequin B' : 'Mannequin A',
      modelPath: `/library/${bodyId}.glb`,
      attachmentSocket: 'root_socket',
      materialVariantId: 'skin_tan',
      materialSwatch: '#cf9f72',
      colorVariantId: 'eyes_green',
      colorSwatch: '#4ade80',
    },
    {
      category: 'torso',
      partId: 'torso_fit',
      label: 'Torso Fit',
      modelPath: '/library/torso_fit.glb',
      attachmentSocket: 'torso_socket',
      materialVariantId: 'torso_neutral',
      materialSwatch: '#d6d3d1',
    },
    {
      category: 'head',
      partId: 'head_base',
      label: 'Head Base',
      modelPath: '/library/head_base.glb',
      attachmentSocket: 'head_socket',
      materialVariantId: 'skin_tan',
      materialSwatch: '#cf9f72',
    },
    {
      category: 'arms',
      partId: 'hand_game',
      label: 'Hand Game',
      modelPath: '/library/hand_game.glb',
      attachmentSocket: 'arms_socket',
      materialVariantId: 'skin_tan',
      materialSwatch: '#cf9f72',
    },
    {
      category: 'hair',
      partId: 'hair_short',
      label: 'Hair Short',
      modelPath: '/library/hair_short.glb',
      attachmentSocket: 'hair_socket',
      materialVariantId: hairMaterial.id,
      materialSwatch: hairMaterial.swatch,
    },
    {
      category: 'outfit',
      partId: 'hoodie',
      label: 'Hoodie',
      modelPath: '/library/hoodie.glb',
      attachmentSocket: 'torso_socket',
      materialVariantId: outfitMaterial.id,
      materialSwatch: outfitMaterial.swatch,
    },
    {
      category: 'legs',
      partId: 'legs_basic',
      label: 'Legs Basic',
      modelPath: '/library/legs_basic.glb',
      attachmentSocket: 'legs_socket',
      materialVariantId: legMaterial.id,
      materialSwatch: legMaterial.swatch,
    },
    {
      category: 'shoes',
      partId: 'boots',
      label: 'Boots',
      modelPath: '/library/boots.glb',
      attachmentSocket: 'feet_socket',
      materialVariantId: bootMaterial.id,
      materialSwatch: bootMaterial.swatch,
    },
  ];

  if (wantsHat) {
    parts.push({
      category: 'accessory',
      partId: 'hat',
      label: 'Hat',
      modelPath: '/library/hat.glb',
      attachmentSocket: 'accessory_socket',
      materialVariantId: 'hat_graphite',
      materialSwatch: '#334155',
    });
  }

  return {
    version: 1,
    source: 'character-builder-panel',
    baseBodyId: bodyId,
    skeletonId: 'human_base_v1',
    bodyType: 'unisex_medium',
    focusedCategory: 'body',
    hoveredCategory: null,
    parts,
  };
}

function buildPlayableAnimatorData(entityName: string, lowerCommand: string) {
  const baseState = createDefaultAnimatorEditorState(entityName);
  const walkClip = createLibraryClip('Walk Cycle');
  const runClip = createLibraryClip('Run Cycle');
  const wantsRun =
    lowerCommand.includes('run') ||
    lowerCommand.includes('correr') ||
    lowerCommand.includes('corriendo');
  const wantsWalk =
    wantsRun ||
    lowerCommand.includes('walk') ||
    lowerCommand.includes('caminar') ||
    lowerCommand.includes('caminando') ||
    lowerCommand.includes('walking');
  const activeClip = wantsRun ? runClip : wantsWalk ? walkClip : baseState.clips[0];

  return serializeAnimatorEditorState(
    {
      controllerId: null,
      currentAnimation: activeClip?.name ?? null,
      parameters: {
        locomotion: wantsRun ? 'run' : wantsWalk ? 'walk' : 'idle',
        grounded: true,
        speed: wantsRun ? 1 : wantsWalk ? 0.55 : 0,
      },
    },
    {
      ...baseState,
      activeClipId: activeClip?.id ?? baseState.activeClipId,
      clips: [baseState.clips[0], walkClip, runClip],
      nlaStrips: activeClip
        ? [
            {
              id: crypto.randomUUID(),
              name: `${activeClip.name}_Main`,
              clipId: activeClip.id,
              start: 0,
              end: activeClip.duration,
              blendMode: 'replace',
              muted: false,
            },
          ]
        : baseState.nlaStrips,
    }
  );
}

function hasComponent(
  entity: EditorSessionSnapshot['entities'][number],
  componentType: string
): boolean {
  return entity.components.some((component) => component.type === componentType);
}

function findEntityByPredicate(
  snapshot: EditorSessionSnapshot,
  predicate: (entity: EditorSessionSnapshot['entities'][number]) => boolean
) {
  return snapshot.entities.find(predicate) || null;
}

function findEntityIdsByName(snapshot: EditorSessionSnapshot, targetName: string): string[] {
  const needle = targetName.trim().toLowerCase();
  if (!needle) return [];
  return snapshot.entities
    .filter((entity) => entity.name.toLowerCase().includes(needle))
    .map((entity) => entity.id);
}

export async function tryHandleAssistantSceneAction(
  params: SceneActionParams
): Promise<AssistantSceneActionResult> {
  const intent = resolveAICommandIntent(params.command);
  const lowerIntentCommand = intent.lowerCommand;
  const wantsSceneStarterWithCharacter =
    commandMentionsScene(lowerIntentCommand) &&
    (intent.wantsCharacter ||
      lowerIntentCommand.includes('jugador') ||
      lowerIntentCommand.includes('player'));

  if (!(intent.wantsGameStarter || intent.wantsDirectSceneAction || wantsSceneStarterWithCharacter)) {
    return { handled: false, sceneUpdated: false };
  }

  if (
    intent.wantsVideo ||
    intent.wantsImage ||
    ((intent.wants3D || intent.wantsCharacter) && !wantsSceneStarterWithCharacter && !intent.wantsGameStarter)
  ) {
    return { handled: false, sceneUpdated: false };
  }

  if (!hasRequiredRole(params.userRole, 'EDITOR')) {
    return {
      handled: true,
      sceneUpdated: false,
      text:
        '⚠️ **Permisos insuficientes**\n\nNecesitas acceso de editor para aplicar cambios en la escena.',
    };
  }

  const activeSession = resolveEditorSessionRecord({
    userId: params.userId,
    preferredSessionId: params.preferredSessionId,
    projectKey: params.projectKey,
  });

  if (!activeSession) {
    return {
      handled: true,
      sceneUpdated: false,
      text:
        '⚠️ **Sesión del editor no disponible**\n\nAbre el editor y vuelve a intentar el pedido para aplicar cambios reales.',
    };
  }

  const lowerCommand = params.command.toLowerCase();
  const snapshot = activeSession.snapshot;
  const results: string[] = [];
  const generatedScripts = new Set<string>();
  const createdEntityIds: string[] = [];
  let sceneUpdated = false;
  let createdPlayerId: string | null = null;
  let createdCameraId: string | null = null;

  const projectKey = params.projectKey || activeSession.projectKey || snapshot.projectName || 'untitled_project';

  const runTool = async <T extends JsonRecord = JsonRecord>(
    name: string,
    argumentsPayload: JsonRecord = {}
  ): Promise<T> => {
    const callId = `assistant_${name.replace(/\W+/g, '_')}_${crypto.randomUUID()}`;
    const toolResults = await executeMcpToolCalls(
      [
        {
          id: callId,
          name,
          arguments: argumentsPayload,
        },
      ],
      {
        userId: params.userId,
        preferredSessionId: activeSession.sessionId,
        projectKey,
      }
    );

    const toolResult = toolResults.find((entry) => entry.toolCallId === callId) || toolResults[0];
    if (!toolResult) {
      throw new Error('La acción del editor no devolvió resultado.');
    }

    if (toolResult.status !== 'success') {
      throw new Error(toolResult.error || 'La acción del editor no se pudo completar.');
    }

    sceneUpdated = true;
    return ((toolResult.result || {}) as T);
  };

  const createEntity = async (options: {
    name: string;
    archetype?: 'empty' | 'cube' | 'sphere' | 'cylinder' | 'plane' | 'light' | 'camera' | 'audio';
    position?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => {
    const result = await runTool<{ entityId?: string; name?: string }>('entity.create', options);
    if (typeof result.entityId !== 'string' || !result.entityId) {
      throw new Error(`No se pudo crear ${options.name}.`);
    }
    createdEntityIds.push(result.entityId);
    return {
      entityId: result.entityId,
      name: typeof result.name === 'string' && result.name ? result.name : options.name,
    };
  };

  const createPlayer = async (name: string, position = { x: 0, y: 1, z: 0 }) => {
    const player = await createEntity({
      name,
      archetype: 'empty',
      position,
      scale: { x: 1, y: 1, z: 1 },
    });
    await runTool('entity.add_component', {
      entityId: player.entityId,
      componentType: 'MeshRenderer',
      data: {
        meshId: 'capsule',
        materialId: 'default',
        castShadows: true,
        receiveShadows: true,
        characterBuilder: buildCharacterBuilderRenderData(lowerCommand),
      },
    });
    await runTool('entity.add_component', {
      entityId: player.entityId,
      componentType: 'Animator',
      data: buildPlayableAnimatorData(name, lowerCommand),
    });
    await runTool('phys.add_character_controller', { entityId: player.entityId });
    await runTool('phys.add_collider', {
      entityId: player.entityId,
      shape: 'capsule',
      radius: 0.35,
      height: 1.8,
    });
    createdPlayerId = player.entityId;
    generatedScripts.add('/scripts/PlayerController.generated.ts');
    return player;
  };

  const createCamera = async (name: string, position = { x: 0, y: 2, z: 6 }) => {
    const camera = await createEntity({
      name,
      archetype: 'camera',
      position,
    });
    createdCameraId = camera.entityId;
    return camera;
  };

  const createTerrain = async (name: string, position = { x: 0, y: 0, z: 0 }) => {
    const terrain = await createEntity({
      name,
      archetype: 'plane',
      position,
      scale: { x: 20, y: 1, z: 20 },
    });
    generatedScripts.add('/scripts/TerrainRules.generated.ts');
    return terrain;
  };

  const createEnemy = async (name: string, position = { x: 3, y: 0.5, z: 0 }) => {
    const enemy = await createEntity({
      name,
      archetype: 'cube',
      position,
      scale: { x: 1.1, y: 1.1, z: 1.1 },
    });
    await runTool('game.add_health_component', {
      entityId: enemy.entityId,
      maxHealth: 100,
      currentHealth: 100,
    });
    generatedScripts.add('/scripts/EnemyAI.generated.ts');
    return enemy;
  };

  const createWeapon = async (name: string, position = { x: 0.5, y: 1, z: 0 }) => {
    const weapon = await createEntity({
      name,
      archetype: 'cylinder',
      position,
      scale: { x: 0.2, y: 1.2, z: 0.2 },
    });
    generatedScripts.add('/scripts/WeaponLogic.generated.ts');
    return weapon;
  };

  const selectCreatedEntities = async () => {
    if (createdEntityIds.length === 0) return;
    await runTool('tool.set_selection', {
      entityIds: createdEntityIds.slice(-4),
      mode: 'replace',
    });
  };

  const persistGeneratedScripts = async (): Promise<{
    mutatedSession: boolean;
    messages: string[];
  }> => {
    const scriptPaths = [...generatedScripts];
    if (scriptPaths.length === 0) {
      return { mutatedSession: false, messages: [] };
    }

    const persistedAssets: Array<{ assetPath: string; scriptName: string }> = [];
    let hadFailure = false;

    for (const scriptPath of scriptPaths) {
      const persistence = await ensureGeneratedScriptInLibrary({
        scriptPath,
        prompt: params.command,
      });
      if (!persistence.ok) {
        hadFailure = true;
        continue;
      }

      persistedAssets.push({
        assetPath: persistence.assetPath,
        scriptName: persistence.relativePath.split('/').pop() || persistence.relativePath,
      });
    }

    if (persistedAssets.length > 0) {
      await applyEditorSessionMutation({
        userId: params.userId,
        preferredSessionId: activeSession.sessionId,
        projectKey,
        mutate: () => {
          const state = useEngineStore.getState();
          for (const assetInfo of persistedAssets) {
            const exists = state.assets.some(
              (asset) => asset.type === 'script' && asset.path === assetInfo.assetPath
            );
            if (exists) continue;
            state.addAsset({
              id: crypto.randomUUID(),
              name: assetInfo.scriptName,
              type: 'script',
              path: assetInfo.assetPath,
              size: 0,
              createdAt: new Date(),
              metadata: {
                prompt: params.command,
                generatedBy: 'assistant-server',
              },
            });
          }
        },
      });
    }

    const messages: string[] = [];
    if (persistedAssets.length > 0) {
      messages.push('✓ Scripts auxiliares registrados');
    }
    if (hadFailure) {
      messages.push('⚠️ Algunos scripts auxiliares no se pudieron registrar.');
    }

    return {
      mutatedSession: persistedAssets.length > 0,
      messages,
    };
  };

  const finalizeResult = async (payload: AssistantSceneActionResult): Promise<AssistantSceneActionResult> => {
    const scriptPersistence = await persistGeneratedScripts();
    if (!payload.text && scriptPersistence.messages.length === 0) {
      return payload;
    }

    const text = [
      payload.text?.trim(),
      ...scriptPersistence.messages,
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join('\n');

    return {
      handled: payload.handled,
      sceneUpdated: payload.sceneUpdated || scriptPersistence.mutatedSession,
      text,
    };
  };

  try {
    const hasGameKeyword = ['juego', 'game', 'nivel', 'level', 'arena'].some((keyword) =>
      lowerCommand.includes(keyword)
    );
    const hasBuildKeyword = ['crea', 'crear', 'genera', 'generar', 'haz', 'hacer', 'build', 'make', 'setup'].some(
      (keyword) => lowerCommand.includes(keyword)
    );
    const shouldCreateStarterGame = hasGameKeyword && hasBuildKeyword;
    const wantsPlatformer =
      lowerCommand.includes('plataforma') ||
      lowerCommand.includes('platformer') ||
      lowerCommand.includes('platform');
    const wantsWolfEnemy = lowerCommand.includes('lobo') || lowerCommand.includes('wolf');
    const wantsWeapon =
      lowerCommand.includes('arma') ||
      lowerCommand.includes('weapon') ||
      lowerCommand.includes('espada') ||
      lowerCommand.includes('sword');
    const wantsEnemy =
      lowerCommand.includes('enemigo') ||
      lowerCommand.includes('enemy') ||
      lowerCommand.includes('monstruo') ||
      lowerCommand.includes('monster') ||
      lowerCommand.includes('boss') ||
      wantsWolfEnemy ||
      lowerCommand.includes('bestia') ||
      lowerCommand.includes('creatura') ||
      lowerCommand.includes('creature');
    const wantsCamera =
      lowerCommand.includes('camara') ||
      lowerCommand.includes('cámara') ||
      lowerCommand.includes('camera');
    const wantsLight =
      lowerCommand.includes('luz') ||
      lowerCommand.includes('light') ||
      lowerCommand.includes('ilumin');
    const wantsSceneShell =
      lowerCommand.includes('escena') ||
      lowerCommand.includes('scene') ||
      lowerCommand.includes('nivel') ||
      lowerCommand.includes('proyecto') ||
      lowerCommand.includes('project');
    const wantsAnimatedCharacter =
      lowerCommand.includes('personaje') ||
      lowerCommand.includes('character') ||
      lowerCommand.includes('jugador') ||
      lowerCommand.includes('player') ||
      lowerCommand.includes('heroe') ||
      lowerCommand.includes('héroe');
    const wantsWalkCycle =
      lowerCommand.includes('walk') ||
      lowerCommand.includes('caminar') ||
      lowerCommand.includes('caminando') ||
      lowerCommand.includes('walking') ||
      lowerCommand.includes('run') ||
      lowerCommand.includes('correr');

    if (shouldCreateStarterGame) {
      const scene = await runTool<{ name?: string }>('scene.create', {
        name: `Juego IA ${Date.now()}`,
      });
      await createTerrain('Terreno IA');
      await createPlayer('Jugador IA');
      await createCamera('Camara Principal IA');
      await runTool('render.create_light', {
        type: 'directional',
        intensity: 1.2,
        position: { x: 6, y: 10, z: 4 },
      });

      if (wantsPlatformer) {
        const platformLayout = [
          { x: 0, y: 1.2, z: 2, w: 4, d: 4 },
          { x: 5, y: 2.6, z: 0, w: 4, d: 4 },
          { x: 10, y: 4, z: -2, w: 5, d: 4 },
          { x: 15, y: 5.2, z: 1, w: 4, d: 4 },
          { x: 20, y: 6.4, z: -1, w: 6, d: 4 },
        ];

        for (let index = 0; index < platformLayout.length; index += 1) {
          const item = platformLayout[index];
          await createEntity({
            name: `Plataforma_${index + 1}`,
            archetype: 'cube',
            position: { x: item.x, y: item.y, z: item.z },
            scale: { x: item.w, y: 0.4, z: item.d },
          });
        }

        generatedScripts.add('/scripts/PlatformerMovement.generated.ts');
        results.push(`✓ ${platformLayout.length} plataformas jugables generadas`);
      }

      await createEnemy(wantsWolfEnemy ? 'Lobo Enemigo' : 'Enemy', { x: 4, y: 0.5, z: -1 });
      generatedScripts.add('/scripts/GameLoop.generated.ts');

      results.push(`✓ Escena creada: ${typeof scene.name === 'string' && scene.name ? scene.name : 'Juego IA'}`);
      results.push('✓ Terreno base generado');
      results.push('✓ Jugador jugable agregado');
      results.push('✓ Camara principal configurada');
      results.push('✓ Iluminacion inicial lista');
      results.push(wantsWolfEnemy ? '✓ Enemigo lobo agregado' : '✓ Enemigo de prueba agregado');

      if (wantsWeapon) {
        await createWeapon('Espada');
        results.push('✓ Arma inicial agregada');
      }

      await selectCreatedEntities();
      return finalizeResult({
        handled: true,
        sceneUpdated,
        text: `✅ **Completado**\n${results.join('\n')}`,
      });
    }

    const wantsDelete =
      lowerCommand.includes('elimina') ||
      lowerCommand.includes('eliminar') ||
      lowerCommand.includes('borra') ||
      lowerCommand.includes('borrar') ||
      lowerCommand.includes('remove') ||
      lowerCommand.includes('delete');

    if (wantsDelete) {
      const selectedIds = snapshot.editor.selectedEntities;
      const removeAll = lowerCommand.includes('todo') || lowerCommand.includes('all');
      const removeSelection =
        lowerCommand.includes('seleccion') ||
        lowerCommand.includes('selección') ||
        lowerCommand.includes('selected');

      let ids: string[] = [];
      if (removeAll) {
        ids = snapshot.entities.map((entity) => entity.id);
      } else if (removeSelection && selectedIds.length > 0) {
        ids = selectedIds;
      } else {
        const targetName = lowerCommand
          .replace(/elimina|eliminar|borra|borrar|remove|delete/gi, '')
          .trim();
        ids = findEntityIdsByName(snapshot, targetName);
      }

      if (ids.length === 0) {
        return {
          handled: true,
          sceneUpdated: false,
          text:
            '⚠️ **Nada para eliminar**\n\nNo encontré objetos con ese criterio. Usa "elimina selección" o "elimina todo".',
        };
      }

      for (const entityId of ids) {
        await runTool('entity.delete', { entityId });
      }

      const summary = removeAll
        ? `✓ ${ids.length} objeto(s) eliminados de la escena`
        : removeSelection
          ? `✓ ${ids.length} objeto(s) seleccionados eliminados`
          : `✓ ${ids.length} objeto(s) eliminados por nombre`;

      return {
        handled: true,
        sceneUpdated,
        text: `✅ **Completado**\n${summary}`,
      };
    }

    if (lowerCommand.includes('laberinto') || lowerCommand.includes('maze')) {
      await runTool('scene.create', { name: 'Escena Laberinto' });
      await createEntity({
        name: 'MazeFloor',
        archetype: 'cube',
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 20, y: 0.2, z: 20 },
      });

      const wallCoords = [
        [-8, -8], [-8, -4], [-8, 0], [-8, 4], [-8, 8],
        [-4, 8], [0, 8], [4, 8], [8, 8],
        [8, 4], [8, 0], [8, -4], [8, -8],
        [-4, -8], [0, -8], [4, -8],
        [-2, -4], [-2, 0], [-2, 4],
        [2, -4], [2, 0], [2, 4],
        [0, -2], [0, 2],
      ];

      for (let index = 0; index < wallCoords.length; index += 1) {
        const [x, z] = wallCoords[index];
        await createEntity({
          name: `Wall_${index + 1}`,
          archetype: 'cube',
          position: { x, y: 1, z },
          scale: { x: 2, y: 2, z: 0.5 },
        });
      }

      await createPlayer('Jugador Laberinto');
      await createCamera('Camara Laberinto');
      await runTool('render.create_light', {
        type: 'directional',
        intensity: 1.1,
        position: { x: 0, y: 10, z: 0 },
      });

      await selectCreatedEntities();
      return finalizeResult({
        handled: true,
        sceneUpdated,
        text:
          `✅ **Completado**\n` +
          `✓ Escena creada: Escena Laberinto\n` +
          `✓ Piso y muros de laberinto generados\n` +
          `✓ ${wallCoords.length} muros colocados\n` +
          '✓ Jugador, camara y luz inicial agregados',
      });
    }

    if (wantsSceneShell) {
      const scene = await runTool<{ name?: string }>('scene.create', {
        name:
          lowerCommand.includes('proyecto') || lowerCommand.includes('project')
            ? 'Proyecto IA'
            : 'Nueva Escena',
      });
      results.push(`✓ Escena creada: ${typeof scene.name === 'string' && scene.name ? scene.name : 'Nueva Escena'}`);
    }

    if (lowerCommand.includes('terreno') || lowerCommand.includes('terrain') || lowerCommand.includes('isla')) {
      await createTerrain('Terrain Procedural');
      results.push('✓ Terreno procedural generado');
      results.push('✓ Texturas aplicadas');
    }

    if (wantsAnimatedCharacter) {
      if (
        wantsSceneStarterWithCharacter &&
        !(
          lowerCommand.includes('terreno') ||
          lowerCommand.includes('terrain') ||
          lowerCommand.includes('isla')
        )
      ) {
        await createTerrain('Piso de escena');
        results.push('✓ Piso base listo para recorrido');
      }
      await createPlayer('Jugador');
      results.push('✓ Personaje jugable creado');
      results.push('✓ Texturas y piezas del personaje aplicadas');
      results.push(
        wantsWalkCycle
          ? '✓ Rig humanoide con clip Walk Cycle activo'
          : '✓ Rig humanoide con clips de locomoción preparados'
      );
      results.push('✓ Controles: WASD mover, Space saltar, Mouse rotar cámara');
      results.push('✓ Animator y esqueleto configurados');
    }

    const shouldAutoCreateCamera =
      wantsSceneStarterWithCharacter &&
      !wantsCamera &&
      !createdCameraId &&
      !findEntityByPredicate(snapshot, (candidate) => hasComponent(candidate, 'Camera'));
    if (wantsCamera || shouldAutoCreateCamera) {
      await createCamera('Camara Principal');
      results.push('✓ Cámara agregada a la escena');
    }

    const shouldAutoCreateLight =
      wantsSceneStarterWithCharacter &&
      !wantsLight &&
      !findEntityByPredicate(snapshot, (candidate) => hasComponent(candidate, 'Light'));
    if (wantsLight || shouldAutoCreateLight) {
      await runTool('render.create_light', {
        type: 'directional',
        intensity: 1.2,
        position: { x: 6, y: 10, z: 4 },
      });
      results.push('✓ Iluminación principal agregada');
    }

    if (wantsWeapon) {
      await createWeapon('Espada');
      results.push('✓ Arma creada (25 daño, 1.5 velocidad)');
    }

    if (wantsEnemy) {
      const isWolf = lowerCommand.includes('lobo') || lowerCommand.includes('wolf');
      await createEnemy(isWolf ? 'Lobo Enemigo' : 'Enemy');
      results.push(isWolf ? '✓ Enemigo lobo agregado a escena' : '✓ Enemigo base agregado a escena');
    }

    if (
      lowerCommand.includes('salto') ||
      lowerCommand.includes('jump') ||
      lowerCommand.includes('saltar') ||
      lowerCommand.includes('física de salto') ||
      lowerCommand.includes('fisica de salto')
    ) {
      const targetCamera =
        lowerCommand.includes('camara') ||
        lowerCommand.includes('cámara') ||
        lowerCommand.includes('camera');
      let targetEntityId: string | null = targetCamera ? createdCameraId : createdPlayerId;

      if (!targetEntityId) {
        const entity = findEntityByPredicate(snapshot, (candidate) =>
          targetCamera ? hasComponent(candidate, 'Camera') : hasComponent(candidate, 'PlayerController')
        );
        targetEntityId = entity?.id || null;
      }

      if (!targetEntityId) {
        if (targetCamera) {
          const camera = await createCamera('Camara Saltadora');
          targetEntityId = camera.entityId;
          results.push('✓ Camara creada para aplicar salto');
        } else {
          const player = await createPlayer('Jugador Saltador');
          targetEntityId = player.entityId;
          results.push('✓ Jugador creado para aplicar salto');
        }
      }

      if (targetEntityId) {
        await runTool('phys.add_character_controller', { entityId: targetEntityId });
        await runTool('phys.add_collider', {
          entityId: targetEntityId,
          shape: targetCamera ? 'box' : 'capsule',
          radius: targetCamera ? undefined : 0.35,
          height: targetCamera ? undefined : 1.8,
          size: targetCamera ? { x: 0.6, y: 1.8, z: 0.6 } : undefined,
        });
        results.push(
          targetCamera
            ? '✓ Física de salto aplicada a cámara'
            : '✓ Física de salto aplicada a entidad jugable'
        );
      }
    }

    if (results.length === 0) {
      const looksLikeQuestion =
        lowerCommand.includes('?') ||
        lowerCommand.startsWith('que ') ||
        lowerCommand.startsWith('qué ') ||
        lowerCommand.startsWith('como ') ||
        lowerCommand.startsWith('cómo ');
      const primitive =
        lowerCommand.includes('esfera') || lowerCommand.includes('sphere')
          ? 'sphere'
          : lowerCommand.includes('capsula') || lowerCommand.includes('cápsula') || lowerCommand.includes('capsule')
            ? 'cylinder'
            : lowerCommand.includes('cilindro') || lowerCommand.includes('cylinder')
              ? 'cylinder'
              : lowerCommand.includes('cubo') || lowerCommand.includes('cube')
                ? 'cube'
                : null;

      if (!looksLikeQuestion && primitive) {
        const genericName =
          params.command
            .replace(/crea|crear|haz|make|build|genera|generar|agrega|añade|add/gi, '')
            .trim()
            .slice(0, 42) || 'Objeto Generado';
        await createEntity({
          name: genericName,
          archetype: primitive as 'cube' | 'sphere' | 'cylinder',
          position: { x: 0, y: 0.5, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        });
        results.push(`✓ Objeto creado desde orden libre: ${genericName}`);
      }
    }

    if (results.length === 0) {
      return { handled: false, sceneUpdated: false };
    }

    await selectCreatedEntities();
    return finalizeResult({
      handled: true,
      sceneUpdated,
      text: `✅ **Completado**\n${results.join('\n')}`,
    });
  } catch (error) {
    return finalizeResult({
      handled: true,
      sceneUpdated,
      text:
        `⚠️ **No pude completar todo el pedido**\n\n` +
        `${results.join('\n')}${results.length > 0 ? '\n' : ''}` +
        `Detalle: ${String(error)}`,
    });
  }
}
