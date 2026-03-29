// ============================================
// AI Orchestrator - Coordinates AI Agents
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import type { AIMode, AgentType, AgentTask, Agent, Entity, Asset, Scene, Component } from '@/types/engine';
import type { BuildReport, BuildDiagnostic } from '@/engine/reyplay/types';
import { useEngineStore } from '@/store/editorStore';
import { agentRegistry } from '@/engine/agents/AgentSystem';
import { v4 as uuidv4 } from 'uuid';
import type { AutomationAction } from '@/types/engine';

// Task Graph Node
interface TaskNode {
  id: string;
  task: AgentTask;
  dependencies: string[];
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

// Task Graph
class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map();
  private executionOrder: string[] = [];

  addTask(task: AgentTask, dependencies: string[] = []): string {
    const node: TaskNode = {
      id: uuidv4(),
      task,
      dependencies,
      status: dependencies.length === 0 ? 'ready' : 'pending',
    };
    this.nodes.set(node.id, node);
    this.recalculateOrder();
    return node.id;
  }

  getReadyTasks(): TaskNode[] {
    return Array.from(this.nodes.values())
      .filter(n => n.status === 'ready');
  }

  markRunning(taskId: string): void {
    const node = this.nodes.get(taskId);
    if (node) {
      node.status = 'running';
    }
  }

  markCompleted(taskId: string, result: unknown): void {
    const node = this.nodes.get(taskId);
    if (node) {
      node.status = 'completed';
      node.result = result;
      this.updateDependencies(taskId);
    }
  }

  markFailed(taskId: string, error: string): void {
    const node = this.nodes.get(taskId);
    if (node) {
      node.status = 'failed';
      node.error = error;
    }
  }

  private updateDependencies(completedTaskId: string): void {
    this.nodes.forEach(node => {
      if (node.dependencies.includes(completedTaskId) && node.status === 'pending') {
        const allDepsComplete = node.dependencies.every(depId => {
          const dep = this.nodes.get(depId);
          return dep && dep.status === 'completed';
        });
        if (allDepsComplete) {
          node.status = 'ready';
        }
      }
    });
    this.recalculateOrder();
  }

  private recalculateOrder(): void {
    // Topological sort
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        node.dependencies.forEach(visit);
        order.push(nodeId);
      }
    };

    this.nodes.forEach((_, id) => visit(id));
    this.executionOrder = order;
  }

  getExecutionOrder(): string[] {
    return this.executionOrder;
  }

  clear(): void {
    this.nodes.clear();
    this.executionOrder = [];
  }
}

// AI Orchestrator Class
export class AIOrchestrator {
  private mode: AIMode = 'OFF';
  private taskGraph: TaskGraph;
  private agents: Map<AgentType, Agent> = new Map();
  private taskQueue: AgentTask[] = [];
  private isProcessing: boolean = false;
  private readonly maxRetriesDefault = 2;

  constructor() {
    this.taskGraph = new TaskGraph();
    this.initializeAgents();
  }

  setMode(mode: AIMode): void {
    this.mode = mode;
    useEngineStore.getState().setAIMode(mode);
  }

  getMode(): AIMode {
    return this.mode;
  }

  /**
   * E2E pipeline: single prompt -> create scene -> generate scripts -> compile -> validate -> autocorrect loop.
   */
  async runSinglePromptPipeline(prompt: string, options?: { sceneName?: string; maxRetries?: number }): Promise<{
    report: BuildReport;
    retries: number;
    sceneId: string;
    scriptDiagnostics: Array<{ file: string; ok: boolean; diagnostics: Array<{ code: number; text: string; category: string; line?: number; column?: number }> }>;
    logs: Array<{ stage: string; status: 'ok' | 'retry' | 'error'; detail?: string }>;
  }> {
    if (this.mode === 'OFF') {
      this.setMode('API');
    }

    const logs: Array<{ stage: string; status: 'ok' | 'retry' | 'error'; detail?: string }> = [];
    const store = useEngineStore.getState();
    this.isProcessing = true;
    store.setAiProcessing(true);

    try {
      const scene = this.ensureScene(options?.sceneName || this.deriveSceneName(prompt));
      logs.push({ stage: 'scene', status: 'ok', detail: `Scene ${scene.name}` });

      // Bootstrap entities (camera + player + controller)
      const playerId = this.bootstrapSceneEntities(scene.id);
      logs.push({ stage: 'bootstrap', status: 'ok', detail: 'Camera + Player + GameController' });

      // Generate scripts from gameplay agent
      const scripts = await this.generateGameplayScripts(prompt);
      const scriptDiagnostics = await this.persistScriptsAndAttach(scripts, playerId);
      logs.push({ stage: 'scripts', status: 'ok', detail: `${scripts.length} script(s) generated` });

      // Main compile + autocorrect loop
      const maxRetries = options?.maxRetries ?? this.maxRetriesDefault;
      let report: BuildReport = store.runReyPlayCompile();
      let retries = 0;

      while (!report.ok && retries < maxRetries) {
        retries += 1;
        const corrected = await this.autocorrectFromDiagnostics(report.diagnostics);
        logs.push({
          stage: 'autocorrect',
          status: corrected ? 'retry' : 'error',
          detail: corrected
            ? `Retry ${retries} after fixes`
            : 'No automated fix available',
        });
        report = store.runReyPlayCompile();
      }

      logs.push({ stage: 'compile', status: report.ok ? 'ok' : 'error', detail: report.summary });

      return { report, retries, sceneId: scene.id, scriptDiagnostics, logs };
    } finally {
      this.isProcessing = false;
      useEngineStore.getState().setAiProcessing(false);
    }
  }

  private initializeAgents(): void {
    const agentTypes: AgentType[] = [
      'orchestrator',
      'world_builder',
      'model_generator',
      'animation',
      'gameplay',
      'ui',
      'optimization',
      'terrain',
    ];

    agentTypes.forEach(type => {
      this.agents.set(type, {
        id: uuidv4(),
        type,
        name: this.getAgentName(type),
        status: 'idle',
        tools: [],
        currentTask: null,
      });
    });
  }

  private getAgentName(type: AgentType): string {
    const names: Record<AgentType, string> = {
      orchestrator: 'AI Orchestrator',
      world_builder: 'World Builder Agent',
      model_generator: '3D Model Agent',
      animation: 'Animation Agent',
      gameplay: 'Gameplay Agent',
      ui: 'UI Agent',
      optimization: 'Optimization Agent',
      terrain: 'Terrain Agent',
    };
    return names[type];
  }

  // Parse user prompt and create task breakdown
  async parsePrompt(prompt: string): Promise<AgentTask[]> {
    if (this.mode === 'OFF') {
      return [];
    }

    // Analyze prompt and determine tasks
    const tasks = this.analyzePrompt(prompt);
    return tasks;
  }

  private analyzePrompt(prompt: string): AgentTask[] {
    const tasks: AgentTask[] = [];
    const lowerPrompt = prompt.toLowerCase();

    // Terrain/World tasks
    if (lowerPrompt.includes('terrain') || lowerPrompt.includes('world') || lowerPrompt.includes('map') || lowerPrompt.includes('island')) {
      tasks.push({
        id: uuidv4(),
        agentId: this.agents.get('terrain')?.id || '',
        type: 'generate_terrain',
        prompt: `Generate terrain based on: ${prompt}`,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      });
    }

    // Model tasks
    if (lowerPrompt.includes('model') || lowerPrompt.includes('character') || lowerPrompt.includes('enemy') || lowerPrompt.includes('castle')) {
      tasks.push({
        id: uuidv4(),
        agentId: this.agents.get('model_generator')?.id || '',
        type: 'generate_model',
        prompt: `Generate 3D model based on: ${prompt}`,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      });
    }

    // Animation tasks
    if (lowerPrompt.includes('animation') || lowerPrompt.includes('animate') || lowerPrompt.includes('walk') || lowerPrompt.includes('run')) {
      tasks.push({
        id: uuidv4(),
        agentId: this.agents.get('animation')?.id || '',
        type: 'generate_animation',
        prompt: `Generate animation based on: ${prompt}`,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      });
    }

    // Gameplay tasks
    if (lowerPrompt.includes('game') || lowerPrompt.includes('play') || lowerPrompt.includes('enemy') || lowerPrompt.includes('spell')) {
      tasks.push({
        id: uuidv4(),
        agentId: this.agents.get('gameplay')?.id || '',
        type: 'generate_gameplay',
        prompt: `Generate gameplay elements based on: ${prompt}`,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      });
    }

    // UI tasks
    if (lowerPrompt.includes('ui') || lowerPrompt.includes('menu') || lowerPrompt.includes('hud') || lowerPrompt.includes('button')) {
      tasks.push({
        id: uuidv4(),
        agentId: this.agents.get('ui')?.id || '',
        type: 'generate_ui',
        prompt: `Generate UI based on: ${prompt}`,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      });
    }

    // If no specific tasks detected, create a general world building task
    if (tasks.length === 0) {
      tasks.push({
        id: uuidv4(),
        agentId: this.agents.get('world_builder')?.id || '',
        type: 'build_world',
        prompt: prompt,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      });
    }

    return tasks;
  }

  // Execute tasks with agents
  async executeTasks(tasks: AgentTask[]): Promise<void> {
    if (this.mode === 'OFF') {
      console.log('AI is disabled. Tasks not executed.');
      return;
    }

    this.isProcessing = true;
    useEngineStore.getState().setAiProcessing(true);

    // Add tasks to queue
    this.taskQueue.push(...tasks);
    tasks.forEach(task => useEngineStore.getState().addTask(task));

    // Process task queue
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (task) {
        await this.executeTask(task);
      }
    }

    this.isProcessing = false;
    useEngineStore.getState().setAiProcessing(false);
  }

  private async executeTask(task: AgentTask): Promise<void> {
    const agent = Array.from(this.agents.values()).find(a => a.id === task.agentId);
    if (!agent) {
      useEngineStore.getState().updateTask(task.id, { status: 'failed', error: 'Agent not found' });
      return;
    }

    // Update task status
    useEngineStore.getState().updateTask(task.id, { status: 'processing' });
    this.updateAgentStatus(agent.type, 'working');

    try {
      // Simulate task execution based on mode
      const result = await this.processTask(task, agent);

      useEngineStore.getState().updateTask(task.id, { 
        status: 'completed', 
        result,
        completedAt: new Date(),
      });
      this.updateAgentStatus(agent.type, 'idle');
    } catch (error) {
      useEngineStore.getState().updateTask(task.id, { 
        status: 'failed', 
        error: String(error) 
      });
      this.updateAgentStatus(agent.type, 'error');
    }
  }

  private async processTask(task: AgentTask, agent: Agent): Promise<unknown> {
    // Route to specialized agent implementation when available
    const specializedAgent = agentRegistry.get(agent.type);
    if (specializedAgent) {
      return specializedAgent.processTask(task);
    }

    // Default fallback
    return {
      type: task.type,
      agent: agent.type,
      completed: true,
      data: { prompt: task.prompt },
    };
  }

  private updateAgentStatus(type: AgentType, status: Agent['status']): void {
    const agent = this.agents.get(type);
    if (agent) {
      agent.status = status;
    }
  }

  private assertPermission(action: AutomationAction, reason: string): void {
    const permissions = useEngineStore.getState().automationPermissions;
    const perm = permissions[action];
    if (!perm || !perm.allowed) {
      throw new Error(`Permiso denegado para ${action}: ${reason}`);
    }
    if (perm.requireConfirm) {
      throw new Error(`Permiso ${action} requiere confirmación manual: ${reason}`);
    }
  }

  // Get agent status
  getAgentStatus(type: AgentType): Agent['status'] {
    return this.agents.get(type)?.status || 'disabled';
  }

  // Cancel all tasks
  cancelAll(): void {
    this.taskQueue = [];
    this.taskGraph.clear();
    this.isProcessing = false;
    useEngineStore.getState().setAiProcessing(false);
  }

  // -----------------------------
  // Internal helpers
  // -----------------------------

  private deriveSceneName(prompt: string): string {
    const base = prompt.split(' ').slice(0, 5).join('-').replace(/[^a-z0-9\-]/gi, '').toLowerCase();
    return base ? `AutoScene-${base}` : `AutoScene-${Date.now()}`;
  }

  private ensureScene(name: string): Scene {
    const store = useEngineStore.getState();
    const existing = store.activeSceneId
      ? store.scenes.find((s) => s.id === store.activeSceneId)
      : null;
    if (existing) return existing;
    return store.createScene(name);
  }

  private bootstrapSceneEntities(_sceneId: string): string {
    const store = useEngineStore.getState();
    const playerId = uuidv4();
    const cameraId = uuidv4();
    const controllerId = uuidv4();

    const entities: Entity[] = [
      this.makeEntity(cameraId, 'MainCamera', [
        this.makeTransform({ x: 0, y: 3, z: -6 }),
        this.makeCamera(true),
      ]),
      this.makeEntity(playerId, 'Player', [
        this.makeTransform({ x: 0, y: 0, z: 0 }),
        this.makeScriptComponent(null),
      ], ['player']),
      this.makeEntity(controllerId, 'GameController', [
        this.makeTransform({ x: 0, y: 0, z: 0 }),
      ]),
    ];

    entities.forEach((ent) => {
      store.addEntity(ent);
    });

    return playerId;
  }

  private makeEntity(id: string, name: string, components: Component[], tags: string[] = []): Entity {
    return {
      id,
      name,
      components: new Map(components.map((c) => [c.type, c])),
      children: [],
      parentId: null,
      active: true,
      tags,
    };
  }

  private makeTransform(position: { x: number; y: number; z: number }): Component {
    return {
      id: uuidv4(),
      type: 'Transform',
      data: {
        position,
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      enabled: true,
    };
  }

  private makeCamera(isMain: boolean): Component {
    return {
      id: uuidv4(),
      type: 'Camera',
      data: {
        fov: 60,
        near: 0.1,
        far: 1000,
        orthographic: false,
        clearColor: { r: 0, g: 0, b: 0, a: 1 },
        isMain,
      },
      enabled: true,
    };
  }

  private makeScriptComponent(scriptId: string | null): Component {
    return {
      id: uuidv4(),
      type: 'Script',
      data: {
        scriptId,
        parameters: {},
        enabled: true,
      },
      enabled: true,
    };
  }

  private async generateGameplayScripts(prompt: string): Promise<Array<{ name: string; code: string }>> {
    const gameplayAgent = agentRegistry.get('gameplay');
    if (!gameplayAgent) return [];

    const tasks = [{
      id: uuidv4(),
      agentId: gameplayAgent.id,
      type: 'generate_gameplay',
      prompt,
      status: 'pending',
      result: null,
      createdAt: new Date(),
    } satisfies AgentTask];

    const scripts: Array<{ name: string; code: string }> = [];
    for (const task of tasks) {
      const result = await gameplayAgent.processTask(task);
      const systems = (result as { systems?: Array<{ params?: { name?: string }; code?: string }> }).systems || [];
      systems.forEach((sys, index) => {
        const name = sys.params?.name || `AutoScript${index + 1}`;
        scripts.push({
          name: name.endsWith('.ts') ? name : `${name}.ts`,
          code: sys.code || this.defaultScriptTemplate(name),
        });
      });
    }

    // Fallback script if none produced
    if (scripts.length === 0) {
      scripts.push({
        name: 'AutoGameController.ts',
        code: this.defaultScriptTemplate('AutoGameController'),
      });
    }

    return scripts;
  }

  private defaultScriptTemplate(name: string): string {
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    return `// ${name}
// Auto-generado por AIOrchestrator

export interface ${safeName}Context {
  deltaTime: number;
  entityId?: string;
}

export function update(context: ${safeName}Context): void {
  // Movimiento placeholder controlado por IA
  const speed = 3.5;
  const moveX = (globalThis as any)?.Input?.GetAxis?.('horizontal') ?? 0;
  const moveZ = (globalThis as any)?.Input?.GetAxis?.('vertical') ?? 0;

  if ((globalThis as any)?.Entity?.translate && context.entityId) {
    (globalThis as any).Entity.translate(context.entityId, {
      x: moveX * speed * context.deltaTime,
      y: 0,
      z: moveZ * speed * context.deltaTime,
    });
  }
}
`;
  }

  private async persistScriptsAndAttach(
    scripts: Array<{ name: string; code: string }>,
    playerId: string
  ): Promise<Array<{ file: string; ok: boolean; diagnostics: Array<{ code: number; text: string; category: string; line?: number; column?: number }> }>> {
    this.assertPermission('filesystem_write', 'Guardar scripts generados');
    this.assertPermission('scene_edit', 'Adjuntar scripts a entidades');

    const diagnostics: Array<{ file: string; ok: boolean; diagnostics: Array<{ code: number; text: string; category: string; line?: number; column?: number }> }> = [];
    for (const script of scripts) {
      const relativePath = this.normalizeScriptPath(script.name);
      await this.writeScriptFile(relativePath, script.code);
      const diag = await this.compileScript(relativePath, script.code);
      diagnostics.push(diag);
      this.registerScriptAsset(relativePath, script.code.length);
      this.attachScriptToEntity(playerId, relativePath);
    }
    return diagnostics;
  }

  private normalizeScriptPath(name: string): string {
    const cleaned = name.trim().replace(/\\+/g, '/').replace(/[^a-zA-Z0-9_\\.\\/]/g, '_');
    return cleaned.startsWith('autogen/') ? cleaned : `autogen/${cleaned}`;
  }

  private async writeScriptFile(relativePath: string, content: string): Promise<void> {
    // Node-side write; guarded to avoid browser usage.
    if (typeof window !== 'undefined') {
      console.warn('writeScriptFile should run server-side; skipped.');
      return;
    }

    this.assertPermission('filesystem_write', 'Escritura de archivo de script');
    const { upsertStoredScript } = await import('@/lib/server/script-storage');
    await upsertStoredScript(relativePath, content);
  }

  private async compileScript(filePath: string, content: string): Promise<{
    file: string;
    ok: boolean;
    diagnostics: Array<{ code: number; text: string; category: string; line?: number; column?: number }>;
  }> {
    // Lightweight transpile for syntax validation
    const ts = await import('typescript');
    const result = ts.transpileModule(content, {
      fileName: filePath,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        jsx: ts.JsxEmit.ReactJSX,
        skipLibCheck: true,
      },
    });

    const diagnostics = (result.diagnostics || []).map((item) => {
      const text = ts.flattenDiagnosticMessageText(item.messageText, '\n');
      const detail: { code: number; text: string; category: string; line?: number; column?: number } = {
        code: item.code,
        text,
        category: this.tsCategoryToText(item.category),
      };
      if (item.file && typeof item.start === 'number') {
        const location = item.file.getLineAndCharacterOfPosition(item.start);
        detail.line = location.line + 1;
        detail.column = location.character + 1;
      }
      return detail;
    });

    return { file: filePath, ok: diagnostics.every((d) => d.category !== 'error'), diagnostics };
  }

  private tsCategoryToText(category: import('typescript').DiagnosticCategory): string {
    switch (category) {
      case 1: return 'error';       // DiagnosticCategory.Error
      case 0: return 'warning';     // Warning in TS enum is 0? Actually DiagnosticCategory.Warning = 0
      case 2: return 'suggestion';
      default: return 'message';
    }
  }

  private registerScriptAsset(relativePath: string, size: number): void {
    const asset: Asset = {
      id: uuidv4(),
      name: relativePath.split('/').pop() || relativePath,
      type: 'script',
      path: relativePath,
      size,
      createdAt: new Date(),
      metadata: {
        generatedBy: 'AIOrchestrator',
        workflow: 'auto_e2e',
      },
    };
    useEngineStore.getState().addAsset(asset);
  }

  private attachScriptToEntity(entityId: string, scriptPath: string): void {
    this.assertPermission('scene_edit', 'Asignar script a entidad');
    const store = useEngineStore.getState();
    const entity = store.entities.get(entityId);
    if (!entity) return;

    const components = new Map(entity.components);
    const existing = components.get('Script');
    if (existing) {
      existing.data = { ...(existing.data as Record<string, unknown>), scriptId: scriptPath };
      components.set('Script', existing);
    } else {
      components.set('Script', this.makeScriptComponent(scriptPath));
    }

    store.updateEntity(entityId, { components });
  }

  private async autocorrectFromDiagnostics(diagnostics: BuildDiagnostic[]): Promise<boolean> {
    const store = useEngineStore.getState();
    let applied = false;

    for (const diag of diagnostics) {
      if (diag.code === 'RYP_MESH_MISSING' && diag.target) {
        const entity = store.entities.get(diag.target);
        if (entity) {
          const components = new Map(entity.components);
          const mesh = components.get('MeshRenderer');
          if (mesh) {
            const data = { ...(mesh.data as Record<string, unknown>), meshId: null };
            components.set('MeshRenderer', { ...mesh, data });
            store.updateEntity(entity.id, { components });
            applied = true;
          }
        }
      }

      if (diag.code === 'RYP_TERRAIN_BAD_DATA' && diag.target) {
        const entity = store.entities.get(diag.target);
        if (entity) {
          const components = new Map(entity.components);
          components.delete('Terrain');
          store.updateEntity(entity.id, { components });
          applied = true;
        }
      }

      if (diag.code === 'RYP_NO_SCENES') {
        this.ensureScene('AutoScene-Fallback');
        applied = true;
      }
    }

    return applied;
  }
}

// Global orchestrator instance
export const orchestrator = new AIOrchestrator();
