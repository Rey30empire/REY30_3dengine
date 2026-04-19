'use client';

import type { Entity, HealthData, Scene } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import type { ComposerRuntimePlan, RuntimePlanNode } from '@/engine/scrib';
import {
  UIPanel,
  UIProgressBar,
  UIText,
  uiManager,
  type UIAnchor,
  type UIManager,
  type UICanvas,
} from './UIRuntime';

export const UI_RUNTIME_CANVAS_ID = 'runtime-ui-hud';

const PANEL_MARGIN = 16;
const PANEL_SPACING = 12;
const PANEL_MIN_HEIGHT = 72;
const PANEL_HEALTH_HEIGHT = 102;

type StoreState = ReturnType<typeof useEngineStore.getState>;

interface RuntimeUIConfig {
  panel: string;
  title: string | null;
  text: string | null;
  anchor: UIAnchor;
  offsetX: number;
  offsetY: number;
  width: number;
  showHealth: boolean;
}

interface RuntimeUIViewModel {
  nodeId: string;
  title: string;
  subtitle: string;
  anchor: UIAnchor;
  offsetX: number;
  offsetY: number;
  width: number;
  health: { current: number; max: number } | null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readAnchor(value: unknown, fallback: UIAnchor): UIAnchor {
  switch (value) {
    case 'top-left':
    case 'top-center':
    case 'top-right':
    case 'center-left':
    case 'center':
    case 'center-right':
    case 'bottom-left':
    case 'bottom-center':
    case 'bottom-right':
      return value;
    default:
      return fallback;
  }
}

function getActiveScene(state: StoreState): Scene | null {
  if (!state.activeSceneId) return null;
  return state.scenes.find((scene) => scene.id === state.activeSceneId) ?? null;
}

function getEntity(state: StoreState, entityId: string): Entity | null {
  return state.entities.get(entityId) ?? null;
}

function readHealth(entity: Entity | null): { current: number; max: number } | null {
  if (!entity) return null;
  const component = entity.components.get('Health');
  if (!component?.enabled) return null;
  const data = component.data as Partial<HealthData>;
  const max = Math.max(readNumber(data.maxHealth, 100), 1);
  const current = Math.max(0, Math.min(max, readNumber(data.currentHealth, max)));
  return { current, max };
}

function resolveAnchor(config: Record<string, unknown>): UIAnchor {
  const explicit = readAnchor(config.anchor, 'top-left');
  if (explicit !== 'top-left' || config.anchor === 'top-left') {
    return explicit;
  }

  const panel = readString(config.panel)?.toLowerCase() ?? 'hud';
  if (panel.includes('right')) return 'top-right';
  if (panel.includes('center')) return 'top-center';
  if (panel.includes('bottom-left')) return 'bottom-left';
  if (panel.includes('bottom-right')) return 'bottom-right';
  if (panel.includes('bottom')) return 'bottom-center';
  return 'top-left';
}

function normalizeConfig(config: Record<string, unknown>): RuntimeUIConfig {
  return {
    panel: readString(config.panel) ?? 'hud',
    title: readString(config.title),
    text: readString(config.text),
    anchor: resolveAnchor(config),
    offsetX: readNumber(config.offsetX, 0),
    offsetY: readNumber(config.offsetY, 0),
    width: Math.max(180, readNumber(config.width, 240)),
    showHealth: readBoolean(config.showHealth, true),
  };
}

function resolveSubtitle(state: StoreState, node: RuntimePlanNode, entity: Entity | null): string {
  if (entity) {
    return `Entidad · ${entity.name}`;
  }

  const scene = getActiveScene(state);
  const entityCount = scene?.entities.length ?? 0;
  return `${state.playRuntimeState} · ${entityCount} entidad${entityCount === 1 ? '' : 'es'}`;
}

function buildViewModel(state: StoreState, node: RuntimePlanNode): RuntimeUIViewModel | null {
  const config = normalizeConfig(node.config);
  const entity = node.target.scope === 'entity' ? getEntity(state, node.target.id) : null;
  const scene = node.target.scope === 'scene' ? getActiveScene(state) : null;

  if (node.target.scope === 'entity' && !entity) {
    return null;
  }

  if (node.target.scope === 'scene' && !scene) {
    return null;
  }

  const health = config.showHealth ? readHealth(entity) : null;
  const title =
    config.title
    ?? (entity ? entity.name : scene?.name)
    ?? 'Runtime HUD';
  const subtitle =
    config.text
    ?? (health ? `${Math.round(health.current)} / ${Math.round(health.max)} HP` : resolveSubtitle(state, node, entity));

  return {
    nodeId: node.id,
    title,
    subtitle,
    anchor: config.anchor,
    offsetX: config.offsetX,
    offsetY: config.offsetY,
    width: config.width,
    health,
  };
}

function getActiveUiNodes(plan: ComposerRuntimePlan | null): RuntimePlanNode[] {
  if (!plan?.ok) return [];
  return plan.nodes.filter((node) => node.enabled && node.type === 'ui');
}

function resolvePanelPosition(params: {
  canvas: UICanvas;
  anchor: UIAnchor;
  width: number;
  height: number;
  index: number;
  offsetX: number;
  offsetY: number;
}): { x: number; y: number } {
  const { canvas, anchor, width, height, index, offsetX, offsetY } = params;
  const resolution = canvas.getResolution();
  const stackOffset = index * (height + PANEL_SPACING);
  const topY = PANEL_MARGIN + stackOffset + offsetY;
  const bottomY = Math.max(PANEL_MARGIN, resolution.y - height - PANEL_MARGIN - stackOffset - offsetY);
  const centerY = Math.max(PANEL_MARGIN, resolution.y / 2 - height / 2 + stackOffset + offsetY);

  const leftX = PANEL_MARGIN + offsetX;
  const rightX = Math.max(PANEL_MARGIN, resolution.x - width - PANEL_MARGIN - offsetX);
  const centerX = Math.max(PANEL_MARGIN, resolution.x / 2 - width / 2 + offsetX);

  switch (anchor) {
    case 'top-center':
      return { x: centerX, y: topY };
    case 'top-right':
      return { x: rightX, y: topY };
    case 'center-left':
      return { x: leftX, y: centerY };
    case 'center':
      return { x: centerX, y: centerY };
    case 'center-right':
      return { x: rightX, y: centerY };
    case 'bottom-left':
      return { x: leftX, y: bottomY };
    case 'bottom-center':
      return { x: centerX, y: bottomY };
    case 'bottom-right':
      return { x: rightX, y: bottomY };
    case 'top-left':
    default:
      return { x: leftX, y: topY };
  }
}

function createPanelWidget(
  canvas: UICanvas,
  model: RuntimeUIViewModel,
  index: number
): UIPanel {
  const height = model.health ? PANEL_HEALTH_HEIGHT : PANEL_MIN_HEIGHT;
  const position = resolvePanelPosition({
    canvas,
    anchor: model.anchor,
    width: model.width,
    height,
    index,
    offsetX: model.offsetX,
    offsetY: model.offsetY,
  });

  const panel = new UIPanel(`${model.nodeId}:panel`);
  panel.setAnchor(model.anchor);
  panel.setPosition(position.x, position.y);
  panel.setSize(model.width, height);
  panel.setStyle({
    backgroundColor: 'rgba(8, 14, 28, 0.78)',
    borderColor: 'rgba(96, 165, 250, 0.28)',
    borderWidth: 1,
    borderRadius: 12,
  });

  const title = new UIText(`${model.nodeId}:title`, model.title);
  title.setPosition(position.x + 14, position.y + 12);
  title.setSize(model.width - 28, 18);
  title.setStyle({
    color: '#eff6ff',
    fontSize: 16,
    fontWeight: '700',
  });
  panel.addChild(title);

  const subtitle = new UIText(`${model.nodeId}:subtitle`, model.subtitle);
  subtitle.setPosition(position.x + 14, position.y + 36);
  subtitle.setSize(model.width - 28, 18);
  subtitle.setStyle({
    color: '#bfdbfe',
    fontSize: 12,
  });
  panel.addChild(subtitle);

  if (model.health) {
    const progress = new UIProgressBar(`${model.nodeId}:health`);
    progress.setPosition(position.x + 14, position.y + height - 28);
    progress.setSize(model.width - 28, 16);
    progress.setMaxValue(model.health.max);
    progress.setValue(model.health.current);
    panel.addChild(progress);
  }

  return panel;
}

export class UIRuntimeBridge {
  private readonly manager: UIManager;
  private container: HTMLElement | null = null;

  constructor(manager: UIManager = uiManager) {
    this.manager = manager;
  }

  get isActive(): boolean {
    return Boolean(this.manager.getCanvas(UI_RUNTIME_CANVAS_ID));
  }

  attachToContainer(container: HTMLElement | null): void {
    this.container = container;
    const canvas = this.manager.getCanvas(UI_RUNTIME_CANVAS_ID);
    if (!canvas) {
      return;
    }

    if (container) {
      this.mountCanvas(canvas);
    } else {
      canvas.detach();
    }
  }

  reset(): void {
    this.manager.removeCanvas(UI_RUNTIME_CANVAS_ID);
  }

  update(deltaTime: number, plan: ComposerRuntimePlan | null): void {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !this.container) {
      return;
    }

    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      this.reset();
      return;
    }

    const nodes = getActiveUiNodes(plan);
    if (nodes.length === 0) {
      this.reset();
      return;
    }

    const canvas = this.manager.createCanvas(UI_RUNTIME_CANVAS_ID);
    this.mountCanvas(canvas);
    canvas.clearChildren();

    const models = nodes
      .map((node) => buildViewModel(state, node))
      .flatMap((model) => (model ? [model] : []));

    if (models.length === 0) {
      this.reset();
      return;
    }

    models.forEach((model, index) => {
      canvas.addChild(createPanelWidget(canvas, model, index));
    });

    this.manager.update(deltaTime);
  }

  private mountCanvas(canvas: UICanvas): void {
    canvas.attach(this.container);
    canvas.setInteractionEnabled(false);
    canvas.setZIndex(14);
  }
}

export const uiRuntimeBridge = new UIRuntimeBridge();
