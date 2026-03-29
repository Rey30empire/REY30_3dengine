'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useEngineStore } from '@/store/editorStore';
import { defaultScribRegistry, type AtomicScribType, type ScribType } from '@/engine/scrib';
import { MODE_AUTO_GUIDE, SCRIB_HYBRID_GUIDE } from './autoGuide';
import {
  FileCode2,
  LibraryBig,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  TerminalSquare,
  Trash2,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type StudioTab = 'create' | 'assign' | 'edit' | 'library' | 'console';
type CreateTargetType = 'character' | 'terrain' | 'object' | 'scene' | 'weapon' | 'enemy';

interface ScriptEntry {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
}

interface ScriptCompileDiagnostic {
  category: 'error' | 'warning' | 'message' | 'suggestion';
  code: number;
  text: string;
}

interface ScriptCompileResult {
  ok: boolean;
  diagnostics: ScriptCompileDiagnostic[];
}

interface ConsoleLine {
  id: string;
  level: 'info' | 'success' | 'warn' | 'error';
  text: string;
}
interface AuthSessionPayload {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
}

interface ScriptRuntimeWarningEventDetail {
  kind?: 'legacy-load-failed' | 'legacy-script-disabled';
  scriptId?: string;
  message?: string;
  suggestion?: string;
  failures?: number;
  retryInMs?: number;
}

const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'create', label: 'Create' },
  { id: 'assign', label: 'Assign' },
  { id: 'edit', label: 'Edit' },
  { id: 'library', label: 'Library' },
  { id: 'console', label: 'Console' },
];

const CREATE_TARGET_OPTIONS: Array<{ value: CreateTargetType; label: string }> = [
  { value: 'character', label: 'character' },
  { value: 'terrain', label: 'terrain' },
  { value: 'object', label: 'object' },
  { value: 'scene', label: 'scene' },
  { value: 'weapon', label: 'weapon' },
  { value: 'enemy', label: 'enemy' },
];
const SCRIPT_STUDIO_AUTH_HINT = 'Inicia sesion en Config APIs -> Usuario para usar Scrib Studio.';
const SCRIPT_STUDIO_ROLE_HINT = 'Tu rol actual no tiene permisos para esta accion de scripts.';

function parseJsonLoose(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    try {
      const normalized = trimmed
        .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"');
      return JSON.parse(normalized) as Record<string, unknown>;
    } catch {
      throw new Error(
        'JSON inválido. Usa createScrib({ target, type, config }) o pega código TypeScript para guardarlo como script.'
      );
    }
  }
}

function looksLikeScriptSource(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//')) return true;
  return /\b(import|export|class|interface|function|const|let|var|enum|type)\b/.test(trimmed);
}

function parseInlineScript(raw: string): { relativePath: string; content: string } | null {
  const trimmed = raw.trim();
  if (!looksLikeScriptSource(trimmed)) return null;

  let fileName: string | null = null;
  let content = trimmed;

  const inlineHeader = trimmed.match(
    /^\/\/\s*([A-Za-z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|mjs|cjs|lua))\s+([\s\S]+)$/i
  );
  if (inlineHeader) {
    fileName = inlineHeader[1];
    content = inlineHeader[2].trimStart();
  } else {
    const firstLineBreak = trimmed.indexOf('\n');
    const firstLine = firstLineBreak >= 0 ? trimmed.slice(0, firstLineBreak).trim() : trimmed;
    const headerOnly = firstLine.match(/^\/\/\s*([A-Za-z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|mjs|cjs|lua))\s*$/i);
    if (headerOnly) {
      fileName = headerOnly[1];
      content = firstLineBreak >= 0 ? trimmed.slice(firstLineBreak + 1).trimStart() : '';
    }
  }

  if (!content.trim()) return null;

  const normalizedName = (fileName || `scribs/inline_${Date.now()}.scrib.ts`)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const relativePath = normalizedName.includes('/') ? normalizedName : `scribs/${normalizedName}`;

  return { relativePath, content };
}

function makeScribTemplate(type: AtomicScribType): string {
  return `// scribs/${type}.scrib.ts
// Editable Scrib

export default function(entity, config, ctx) {
  if (config?.debug) {
    console.log('[${type}]', entity?.name || ctx?.entityId);
  }
}
`;
}

function id(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function asScribType(value: string): ScribType {
  return value as ScribType;
}

export function ScriptWorkspacePanel() {
  const {
    entities,
    scenes,
    activeSceneId,
    engineMode,
    editor,
    scribInstances,
    addAsset,
    updateEntity,
    assignScribToEntity,
    assignScribToScene,
  } = useEngineStore();

  const selectedEntityId = editor.selectedEntities[0] || null;
  const selectedEntityName = selectedEntityId ? entities.get(selectedEntityId)?.name || selectedEntityId : null;
  const activeSceneName = scenes.find((item) => item.id === activeSceneId)?.name || null;
  const modeGuide = MODE_AUTO_GUIDE[engineMode];

  const defs = useMemo(() => defaultScribRegistry.list(), []);
  const atomicDefs = useMemo(() => defaultScribRegistry.list('atomic'), []);
  const composedDefs = useMemo(() => defaultScribRegistry.list('composed'), []);

  const [activeTab, setActiveTab] = useState<StudioTab>('create');
  const [status, setStatus] = useState('Listo.');

  const [createTargetType, setCreateTargetType] = useState<CreateTargetType>('character');
  const [createCapability, setCreateCapability] = useState<ScribType>('movement');
  const [createConfigText, setCreateConfigText] = useState('{\n  "speed": 5\n}');
  const [createTargetEntityId, setCreateTargetEntityId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [assignTargetKey, setAssignTargetKey] = useState<string>('scene');
  const [assignType, setAssignType] = useState<ScribType>('movement');
  const [assignConfigText, setAssignConfigText] = useState('{}');
  const [assignLoading, setAssignLoading] = useState(false);

  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryScope, setLibraryScope] = useState<'entity' | 'scene'>('entity');
  const [libraryLoading, setLibraryLoading] = useState(false);

  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [scriptSearch, setScriptSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [newScriptName, setNewScriptName] = useState('scribs/movement.scrib.ts');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingScript, setLoadingScript] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [applyingScrib, setApplyingScrib] = useState<'entity' | 'scene' | null>(null);
  const [compileResult, setCompileResult] = useState<ScriptCompileResult | null>(null);

  const [consoleInput, setConsoleInput] = useState(
    'createScrib({ target: "player_01", type: "movement", config: { speed: 10 } })'
  );
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLine[]>([]);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sessionRole, setSessionRole] = useState<string | null>(null);

  const filteredLibrary = useMemo(() => {
    const needle = librarySearch.trim().toLowerCase();
    if (!needle) return defs;
    return defs.filter((item) => item.type.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle));
  }, [defs, librarySearch]);

  const filteredScripts = useMemo(() => {
    const needle = scriptSearch.trim().toLowerCase();
    if (!needle) return scripts;
    return scripts.filter((item) => item.relativePath.toLowerCase().includes(needle));
  }, [scriptSearch, scripts]);

  const selectedScribType = useMemo(() => {
    if (!selectedPath) return null;
    const normalized = selectedPath.replace(/\\/g, '/');
    const match = normalized.match(/([^/]+)\.scrib\.(ts|tsx|js|jsx|mjs|cjs|lua)$/i);
    if (!match) return null;
    const type = asScribType(match[1]);
    return defs.some((def) => def.type === type) ? type : null;
  }, [defs, selectedPath]);

  const entityScribs = useMemo(() => {
    if (!selectedEntityId) return [];
    return Array.from(scribInstances.values()).filter((item) => item.target.scope === 'entity' && item.target.id === selectedEntityId);
  }, [scribInstances, selectedEntityId]);

  const sceneScribs = useMemo(() => {
    if (!activeSceneId) return [];
    return Array.from(scribInstances.values()).filter((item) => item.target.scope === 'scene' && item.target.id === activeSceneId);
  }, [scribInstances, activeSceneId]);

  useEffect(() => {
    if (selectedEntityId) {
      setCreateTargetEntityId((current) => current || selectedEntityId);
      setAssignTargetKey((current) => (current === 'scene' ? current : selectedEntityId));
    }
  }, [selectedEntityId]);

  const refreshSession = async (): Promise<boolean> => {
    setSessionChecking(true);
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as AuthSessionPayload;
      const authenticated = Boolean(payload.authenticated);
      setSessionReady(authenticated);
      setSessionRole(authenticated ? payload.user?.role || null : null);
      if (!authenticated) {
        setScripts([]);
        setSelectedPath(null);
        setContent('');
        setDirty(false);
      }
      return authenticated;
    } catch {
      setSessionReady(false);
      setSessionRole(null);
      return false;
    } finally {
      setSessionChecking(false);
    }
  };

  const ensureSessionReady = (): boolean => {
    if (sessionReady) return true;
    setStatus(SCRIPT_STUDIO_AUTH_HINT);
    return false;
  };

  const parseScriptApiPayload = async <T,>(
    response: Response,
    fallbackError: string
  ): Promise<T> => {
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

    if (response.status === 401) {
      setSessionReady(false);
      setSessionRole(null);
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }

    if (response.status === 403) {
      throw new Error(payload.error ? `${SCRIPT_STUDIO_ROLE_HINT} (${payload.error})` : SCRIPT_STUDIO_ROLE_HINT);
    }

    if (!response.ok) {
      throw new Error(payload.error || fallbackError);
    }

    return payload;
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void loadScripts();
  }, [sessionReady]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onRuntimeWarning = (event: Event) => {
      const detail = (event as CustomEvent<ScriptRuntimeWarningEventDetail>).detail || {};
      const scriptId = typeof detail.scriptId === 'string' ? detail.scriptId : 'script';
      const message = typeof detail.message === 'string' ? detail.message : 'Advertencia de runtime';
      const suggestion = typeof detail.suggestion === 'string' ? detail.suggestion : '';
      const isDisabled = detail.kind === 'legacy-script-disabled';
      const level: ConsoleLine['level'] = isDisabled ? 'error' : 'warn';

      setConsoleLogs((prev) => [
        ...prev,
        { id: id(), level, text: `[Runtime][${scriptId}] ${message}` },
        ...(suggestion
          ? [{ id: id(), level: 'info' as const, text: `Sugerencia: ${suggestion}` }]
          : []),
      ]);
      setStatus(`Runtime reportado para ${scriptId}`);
    };

    window.addEventListener('script:runtime-warning', onRuntimeWarning as EventListener);
    return () => {
      window.removeEventListener('script:runtime-warning', onRuntimeWarning as EventListener);
    };
  }, []);

  const addConsole = (level: ConsoleLine['level'], text: string) => {
    setConsoleLogs((prev) => [...prev, { id: id(), level, text }]);
  };

  const dispatchHotReload = (path?: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('scrib:code-updated', { detail: { path, reason: 'scrib-studio' } }));
  };

  const dispatchCompose = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('scrib:runtime-compose'));
  };

  const ensureScribFile = async (type: ScribType) => {
    if (!ensureSessionReady()) {
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }
    const atomic = defaultScribRegistry.expandToAtomic(type);
    for (const item of atomic) {
      const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: 'scribs',
          name: `${item}.scrib.ts`,
          content: makeScribTemplate(item),
          overwrite: false,
          onExists: 'return-existing',
        }),
      });
      await parseScriptApiPayload(response, `No se pudo crear ${item}.scrib.ts`);
    }
  };

  const assignToTarget = async (
    target: { scope: 'entity' | 'scene'; id: string },
    type: ScribType,
    config: Record<string, unknown>,
    origin: 'manual' | 'hybrid' | 'ai'
  ) => {
    if (!ensureSessionReady()) {
      throw new Error(SCRIPT_STUDIO_AUTH_HINT);
    }
    await ensureScribFile(type);
    const result = target.scope === 'entity'
      ? assignScribToEntity(target.id, type, { config, origin })
      : assignScribToScene(target.id, type, { config, origin });
    dispatchCompose();
    return result;
  };

  const loadScripts = async () => {
    if (!ensureSessionReady()) return;
    setLoadingList(true);
    try {
      const response = await fetch('/api/scripts');
      const payload = await parseScriptApiPayload<{ scripts?: ScriptEntry[] }>(
        response,
        'No se pudieron cargar scripts'
      );
      setScripts(Array.isArray(payload.scripts) ? (payload.scripts as ScriptEntry[]) : []);
    } catch (error) {
      setStatus(`Error listando scripts: ${String(error)}`);
    } finally {
      setLoadingList(false);
    }
  };

  const openScript = async (path: string) => {
    if (!ensureSessionReady()) return;
    if (dirty && selectedPath && selectedPath !== path) {
      const accepted = window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?');
      if (!accepted) return;
    }
    setLoadingScript(true);
    try {
      const response = await fetch(`/api/scripts?path=${encodeURIComponent(path)}`);
      const payload = await parseScriptApiPayload<{ script: { relativePath: string; content: string } }>(
        response,
        'No se pudo abrir script'
      );
      const script = payload.script as { relativePath: string; content: string };
      setSelectedPath(script.relativePath);
      setContent(script.content || '');
      setDirty(false);
      setCompileResult(null);
      setStatus(`Abierto: ${script.relativePath}`);
    } catch (error) {
      setStatus(`Error abriendo script: ${String(error)}`);
    } finally {
      setLoadingScript(false);
    }
  };

  const createScript = async () => {
    if (!ensureSessionReady()) return;
    const raw = newScriptName.trim();
    if (!raw) return;
    const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
    const directory = slash >= 0 ? raw.slice(0, slash) : '';
    const name = slash >= 0 ? raw.slice(slash + 1) : raw;

    try {
      const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory,
          name,
          content: name.endsWith('.scrib.ts')
            ? makeScribTemplate((name.replace('.scrib.ts', '') as AtomicScribType))
            : undefined,
        }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(response, 'No se pudo crear script');
      const created = payload.script as ScriptEntry;
      addAsset({
        id: crypto.randomUUID(),
        name: created.name,
        type: 'script',
        path: `/api/scripts?path=${encodeURIComponent(created.relativePath)}`,
        size: created.size,
        createdAt: new Date(created.modifiedAt),
        metadata: { source: 'scrib-studio', relativePath: created.relativePath },
      });
      setStatus(`Script creado: ${created.relativePath}`);
      await loadScripts();
      await openScript(created.relativePath);
    } catch (error) {
      setStatus(`Error creando script: ${String(error)}`);
    }
  };

  const saveScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    setSaving(true);
    try {
      const response = await fetch('/api/scripts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(response, 'No se pudo guardar');
      const updated = payload.script as ScriptEntry;
      setDirty(false);
      setStatus(`Guardado: ${updated.relativePath}`);
      dispatchHotReload(updated.relativePath);
      await loadScripts();
    } catch (error) {
      setStatus(`Error guardando: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const reloadScript = async () => {
    if (!selectedPath) return;
    await openScript(selectedPath);
  };

  const duplicateScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    setDuplicating(true);
    try {
      const extension = selectedPath.includes('.') ? selectedPath.slice(selectedPath.lastIndexOf('.')) : '.ts';
      const basePath = selectedPath.slice(0, -extension.length);
      const copyPath = `${basePath}.copy${extension}`;
      const slash = copyPath.lastIndexOf('/');
      const directory = slash >= 0 ? copyPath.slice(0, slash) : '';
      const name = slash >= 0 ? copyPath.slice(slash + 1) : copyPath;

      const response = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, name, content }),
      });
      const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(response, 'No se pudo duplicar');
      const created = payload.script as ScriptEntry;
      setStatus(`Duplicado: ${created.relativePath}`);
      await loadScripts();
      await openScript(created.relativePath);
    } catch (error) {
      setStatus(`Error duplicando: ${String(error)}`);
    } finally {
      setDuplicating(false);
    }
  };

  const deleteScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    const accepted = window.confirm(`¿Borrar script ${selectedPath}?`);
    if (!accepted) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/scripts?path=${encodeURIComponent(selectedPath)}`, { method: 'DELETE' });
      await parseScriptApiPayload(response, 'No se pudo borrar');
      const deletedPath = selectedPath;
      setSelectedPath(null);
      setContent('');
      setDirty(false);
      setCompileResult(null);
      setStatus(`Borrado: ${deletedPath}`);
      dispatchHotReload(deletedPath);
      await loadScripts();
    } catch (error) {
      setStatus(`Error borrando: ${String(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const compileScript = async () => {
    if (!ensureSessionReady()) return;
    if (!selectedPath) return;
    setCompiling(true);
    try {
      const response = await fetch('/api/scripts/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content }),
      });
      const payload = await parseScriptApiPayload<ScriptCompileResult>(response, 'No se pudo compilar');
      setCompileResult(payload as ScriptCompileResult);
      setStatus(payload.ok ? 'Compilación OK' : 'Compilación con errores');
    } catch (error) {
      setStatus(`Error compilando: ${String(error)}`);
    } finally {
      setCompiling(false);
    }
  };

  const bindScriptToEntity = () => {
    if (!selectedEntityId || !selectedPath) return;
    const entity = entities.get(selectedEntityId);
    if (!entity) return;
    const components = new Map(entity.components);
    const current = components.get('Script');
    components.set('Script', {
      id: current?.id || crypto.randomUUID(),
      type: 'Script',
      enabled: true,
      data: {
        scriptId: selectedPath,
        parameters: {},
        enabled: true,
      },
    });
    updateEntity(selectedEntityId, { components });
    setStatus(`Script vinculado a ${entity.name}`);
    dispatchHotReload(selectedPath);
  };

  const applySelectedScrib = async (scope: 'entity' | 'scene') => {
    if (!selectedScribType) {
      setStatus('El archivo actual no es un scrib aplicable. Usa un archivo *.scrib.ts.');
      return;
    }

    setApplyingScrib(scope);
    try {
      if (scope === 'entity') {
        if (!selectedEntityId) throw new Error('Selecciona una entidad para aplicar el scrib.');
        const result = await assignToTarget({ scope: 'entity', id: selectedEntityId }, selectedScribType, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib "${selectedScribType}" aplicado a entidad.`);
      } else {
        if (!activeSceneId) throw new Error('No hay escena activa para aplicar el scrib.');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, selectedScribType, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib "${selectedScribType}" aplicado a escena.`);
      }
    } catch (error) {
      setStatus(`No se pudo aplicar scrib: ${String(error)}`);
    } finally {
      setApplyingScrib(null);
    }
  };

  const handleCreateScrib = async () => {
    setCreateLoading(true);
    try {
      const config = parseJsonLoose(createConfigText);
      if (createTargetType === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, createCapability, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib creado en escena: ${createCapability}`);
      } else {
        const targetId = createTargetEntityId || selectedEntityId;
        if (!targetId) throw new Error('Selecciona entidad objetivo');
        const result = await assignToTarget({ scope: 'entity', id: targetId }, createCapability, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        setStatus(`Scrib creado en entidad: ${createCapability}`);
      }
    } catch (error) {
      setStatus(`Create falló: ${String(error)}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAssignScrib = async () => {
    setAssignLoading(true);
    try {
      const config = parseJsonLoose(assignConfigText);
      if (assignTargetKey === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, assignType, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      } else {
        const result = await assignToTarget({ scope: 'entity', id: assignTargetKey }, assignType, config, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      }
      setStatus(`Assign OK: ${assignType}`);
    } catch (error) {
      setStatus(`Assign falló: ${String(error)}`);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleLibraryAssign = async (type: ScribType) => {
    setLibraryLoading(true);
    try {
      if (libraryScope === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, type, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      } else {
        if (!selectedEntityId) throw new Error('Selecciona entidad');
        const result = await assignToTarget({ scope: 'entity', id: selectedEntityId }, type, {}, 'manual');
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
      }
      setStatus(`Library assign OK: ${type}`);
    } catch (error) {
      setStatus(`Library falló: ${String(error)}`);
    } finally {
      setLibraryLoading(false);
    }
  };

  const runConsole = async () => {
    const raw = consoleInput.trim();
    if (!raw) return;
    setConsoleLoading(true);
    addConsole('info', `> ${raw}`);
    try {
      const inlineScript = parseInlineScript(raw);
      if (inlineScript) {
        if (!ensureSessionReady()) throw new Error(SCRIPT_STUDIO_AUTH_HINT);
        const slash = Math.max(inlineScript.relativePath.lastIndexOf('/'), inlineScript.relativePath.lastIndexOf('\\'));
        const directory = slash >= 0 ? inlineScript.relativePath.slice(0, slash) : '';
        const name = slash >= 0 ? inlineScript.relativePath.slice(slash + 1) : inlineScript.relativePath;
        const response = await fetch('/api/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directory,
            name,
            content: inlineScript.content,
            overwrite: true,
          }),
        });
        const payload = await parseScriptApiPayload<{ script: ScriptEntry }>(
          response,
          'No se pudo guardar script desde consola'
        );
        const saved = payload.script as ScriptEntry;
        setStatus(`Script guardado desde consola: ${saved.relativePath}`);
        addConsole('success', `Script guardado: ${saved.relativePath}`);
        await loadScripts();
        await openScript(saved.relativePath);
        return;
      }

      if (raw.toLowerCase() === 'help') {
        addConsole('info', 'Comandos: help, listScribs(), createScrib({...}) o pega código TS/JS para guardarlo.');
        return;
      }
      if (raw.toLowerCase() === 'listscribs()' || raw.toLowerCase() === 'listscribs') {
        addConsole('success', defaultScribRegistry.list().map((item) => item.type).join(', '));
        return;
      }

      const createMatch = raw.match(/^createScrib\s*\(([\s\S]+)\)\s*;?$/i);
      const payload = createMatch ? parseJsonLoose(createMatch[1]) : parseJsonLoose(raw);
      const type = asScribType(String(payload.type || '').trim());
      if (!type) throw new Error('Falta type');
      const config = (payload.config as Record<string, unknown>) || {};
      const origin = (payload.origin as 'manual' | 'hybrid' | 'ai') || 'manual';
      const scope = payload.scope === 'scene' || String(payload.target || '').toLowerCase() === 'scene' ? 'scene' : 'entity';
      const target = String(payload.target || '').trim();

      if (scope === 'scene') {
        if (!activeSceneId) throw new Error('No hay escena activa');
        const result = await assignToTarget({ scope: 'scene', id: activeSceneId }, type, config, origin);
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        addConsole('success', `createScrib scene OK: ${type}`);
      } else {
        const entityId = target || selectedEntityId || '';
        if (!entityId) throw new Error('Falta target entity');
        const result = await assignToTarget({ scope: 'entity', id: entityId }, type, config, origin);
        if (!result.ok) throw new Error(result.issues.map((item) => item.message).join(' | '));
        addConsole('success', `createScrib entity OK: ${type}`);
      }
    } catch (error) {
      addConsole('error', String(error));
    } finally {
      setConsoleLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-medium text-slate-100">Scrib Studio</h3>
        </div>
      </div>

      <div className="border-b border-slate-800 px-2 py-2 flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              activeTab === tab.id
                ? 'bg-blue-500/25 text-blue-200'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mx-3 mt-2 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
        <p className="text-xs text-cyan-100">
          Auto guía ({engineMode}): <span className="font-medium">{modeGuide.title}</span>
        </p>
        <p className="mt-1 text-[11px] text-cyan-200">{modeGuide.steps[0]}</p>
        {engineMode === 'MODE_HYBRID' && (
          <p className="mt-1 text-[11px] text-cyan-300">
            Recomendación Scrib: {SCRIB_HYBRID_GUIDE[0].path} ({SCRIB_HYBRID_GUIDE[0].language}) para {SCRIB_HYBRID_GUIDE[0].target}.
          </p>
        )}
      </div>
      {!sessionReady && (
        <div className="mx-3 mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-200">
            {sessionChecking ? 'Verificando sesion de Scrib Studio...' : SCRIPT_STUDIO_AUTH_HINT}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            onClick={() => void refreshSession()}
            disabled={sessionChecking}
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', sessionChecking && 'animate-spin')} />
            Reintentar sesion
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {activeTab === 'create' && (
          <div className="p-3 space-y-3">
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-3">
              <div>
                <p className="text-xs text-slate-400">Paso 1: Select target type</p>
                <select
                  value={createTargetType}
                  onChange={(event) => setCreateTargetType(event.target.value as CreateTargetType)}
                  className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                >
                  {CREATE_TARGET_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-slate-400">Paso 2: Select capability</p>
                <select
                  value={createCapability}
                  onChange={(event) => setCreateCapability(asScribType(event.target.value))}
                  className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                >
                  {defs.map((def) => (
                    <option key={def.type} value={def.type}>{def.type} ({def.kind})</option>
                  ))}
                </select>
              </div>
              {createTargetType !== 'scene' && (
                <div>
                  <p className="text-xs text-slate-400">Target entity</p>
                  <select
                    value={createTargetEntityId || ''}
                    onChange={(event) => setCreateTargetEntityId(event.target.value || null)}
                    className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                  >
                    <option value="">Seleccionar entidad</option>
                    {Array.from(entities.values()).map((entity) => (
                      <option key={entity.id} value={entity.id}>{entity.name} ({entity.id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Paso 3: Config form</p>
                <Textarea
                  value={createConfigText}
                  onChange={(event) => setCreateConfigText(event.target.value)}
                  className="mt-1 min-h-24 border-slate-700 bg-slate-900 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Usa JSON puro (sin comillas externas). Ejemplo: {"{"}"speed":5, "debug":true{"}"}.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleCreateScrib} disabled={createLoading}>
                {createLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Paso 4: Save
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'assign' && (
          <div className="p-3 h-full">
            <div className="grid h-full min-h-0 grid-cols-2 gap-3">
              <div className="rounded border border-slate-800 bg-slate-950 min-h-0 flex flex-col">
                <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">Scene tree</div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => setAssignTargetKey('scene')}
                      className={cn(
                        'w-full rounded border px-2 py-1.5 text-left text-xs',
                        assignTargetKey === 'scene' ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-300'
                      )}
                    >
                      Scene: {activeSceneName || 'sin escena'}
                    </button>
                    {Array.from(entities.values()).map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => setAssignTargetKey(entity.id)}
                        className={cn(
                          'w-full rounded border px-2 py-1.5 text-left text-xs',
                          assignTargetKey === entity.id ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-300'
                        )}
                      >
                        {entity.name}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="text-xs text-slate-400">Capabilities</div>
                <select
                  value={assignType}
                  onChange={(event) => setAssignType(asScribType(event.target.value))}
                  className="h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-sm"
                >
                  {defs.map((def) => (
                    <option key={def.type} value={def.type}>{def.type} ({def.kind})</option>
                  ))}
                </select>
                <Textarea
                  value={assignConfigText}
                  onChange={(event) => setAssignConfigText(event.target.value)}
                  className="min-h-24 border-slate-700 bg-slate-900 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500">
                  Este bloque es la config del Scrib para ese target (entidad o escena).
                </p>
                <Button size="sm" variant="secondary" onClick={handleAssignScrib} disabled={assignLoading}>
                  {assignLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  Assign
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="flex h-full">
            <div className="w-80 border-r border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm text-slate-200">Edit Files</p>
                </div>
                <div className="relative">
                  <Search className="h-3 w-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                  <Input
                    value={scriptSearch}
                    onChange={(event) => setScriptSearch(event.target.value)}
                    className="h-8 pl-6 text-xs border-slate-700 bg-slate-900"
                    placeholder="buscar"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newScriptName}
                    onChange={(event) => setNewScriptName(event.target.value)}
                    className="h-8 text-xs border-slate-700 bg-slate-900"
                    placeholder="scribs/movement.scrib.ts"
                  />
                  <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={createScript}>
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs w-full" onClick={loadScripts} disabled={loadingList}>
                  <RefreshCw className={cn('h-3 w-3 mr-1', loadingList && 'animate-spin')} />
                  Reload
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredScripts.map((item) => (
                    <button
                      key={item.relativePath}
                      onClick={() => openScript(item.relativePath)}
                      className={cn(
                        'w-full rounded border px-2 py-2 text-left text-xs',
                        selectedPath === item.relativePath ? 'border-blue-500/60 bg-blue-500/10 text-blue-200' : 'border-slate-800 bg-slate-900 text-slate-300'
                      )}
                    >
                      <div>{item.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.relativePath}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="border-b border-slate-800 px-3 py-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={saveScript} disabled={!selectedPath || saving}>
                  {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  save
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => void applySelectedScrib('entity')}
                  disabled={!selectedScribType || !selectedEntityId || applyingScrib !== null}
                  title={selectedScribType ? 'Aplicar scrib abierto a la entidad seleccionada' : 'Abre un *.scrib.ts para aplicar'}
                >
                  {applyingScrib === 'entity' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  usar en entidad
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => void applySelectedScrib('scene')}
                  disabled={!selectedScribType || !activeSceneId || applyingScrib !== null}
                  title={selectedScribType ? 'Aplicar scrib abierto a la escena activa' : 'Abre un *.scrib.ts para aplicar'}
                >
                  {applyingScrib === 'scene' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  usar en escena
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reloadScript} disabled={!selectedPath || loadingScript}>
                  <RefreshCw className={cn('h-3 w-3 mr-1', loadingScript && 'animate-spin')} />
                  reload
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={duplicateScript} disabled={!selectedPath || duplicating}>
                  {duplicating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                  duplicate
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={deleteScript} disabled={!selectedPath || deleting}>
                  {deleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                  delete
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={compileScript} disabled={!selectedPath || compiling}>
                  {compiling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TerminalSquare className="h-3 w-3 mr-1" />}
                  compile
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={bindScriptToEntity} disabled={!selectedPath || !selectedEntityId}>
                  <Link2 className="h-3 w-3 mr-1" />
                  vincular script
                </Button>
              </div>
              <div className="flex-1 min-h-0 p-3">
                <Textarea
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    if (selectedPath) setDirty(true);
                  }}
                  className="h-full min-h-full resize-none border-slate-700 bg-slate-950 font-mono text-xs"
                  placeholder="Abre un script para editar"
                  disabled={!selectedPath}
                />
                {selectedPath && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Archivo activo: {selectedPath}. Aquí va el código del Scrib/script.
                  </p>
                )}
              </div>
              <div className="border-t border-slate-800 px-3 py-2 text-[11px]">
                {!compileResult && <span className="text-slate-500">Sin compilación</span>}
                {compileResult && (
                  <span className={compileResult.ok ? 'text-green-300' : 'text-red-300'}>
                    {compileResult.ok ? 'Compilación OK' : 'Compilación con errores'} ({compileResult.diagnostics.length})
                  </span>
                )}
                {dirty && <span className="text-amber-300 ml-2">cambios sin guardar</span>}
                {selectedScribType && <span className="text-cyan-300 ml-2">scrib detectado: {selectedScribType}</span>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="p-3 space-y-3 h-full">
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <LibraryBig className="h-4 w-4 text-cyan-300" />
                <p className="text-sm text-slate-200">Scrib Library</p>
              </div>
              <div className="relative">
                <Search className="h-3 w-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                <Input
                  value={librarySearch}
                  onChange={(event) => setLibrarySearch(event.target.value)}
                  className="h-8 pl-6 text-xs border-slate-700 bg-slate-900"
                  placeholder="filtrar"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={libraryScope === 'entity' ? 'secondary' : 'outline'} className="h-7 text-xs" onClick={() => setLibraryScope('entity')}>
                  Entity
                </Button>
                <Button size="sm" variant={libraryScope === 'scene' ? 'secondary' : 'outline'} className="h-7 text-xs" onClick={() => setLibraryScope('scene')}>
                  Scene
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-152px)] rounded border border-slate-800 bg-slate-950">
              <div className="p-2 space-y-2">
                {filteredLibrary.map((def) => (
                  <div key={def.type} className="rounded border border-slate-800 bg-slate-900 p-2">
                    <div className="flex justify-between items-center gap-2">
                      <div>
                        <p className="text-xs text-slate-200">{def.type}</p>
                        <p className="text-[11px] text-slate-500">{def.kind}</p>
                      </div>
                      <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => handleLibraryAssign(def.type)} disabled={libraryLoading}>
                        Assign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="text-[11px] text-slate-500">
              Atomic: {atomicDefs.length} | Recipes: {composedDefs.length} | Entity scribs: {entityScribs.length} | Scene scribs: {sceneScribs.length}
            </div>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="h-full p-3 space-y-3">
            <div className="rounded border border-slate-800 bg-slate-950 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TerminalSquare className="h-4 w-4 text-cyan-300" />
                <p className="text-sm text-slate-200">Scrib Console</p>
              </div>
              <Textarea
                value={consoleInput}
                onChange={(event) => setConsoleInput(event.target.value)}
                className="min-h-24 border-slate-700 bg-slate-900 font-mono text-xs"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="secondary" onClick={runConsole} disabled={consoleLoading}>
                  {consoleLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TerminalSquare className="h-3 w-3 mr-1" />}
                  Run
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConsoleLogs([])}>
                  Clear
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[calc(100%-180px)] rounded border border-slate-800 bg-slate-950">
              <div className="p-2 space-y-1">
                {consoleLogs.length === 0 && <p className="text-[11px] text-slate-500">Usa help para ver comandos.</p>}
                {consoleLogs.map((line) => (
                  <div
                    key={line.id}
                    className={cn(
                      'rounded border px-2 py-1 text-[11px]',
                      line.level === 'success' && 'border-green-500/30 bg-green-500/10 text-green-200',
                      line.level === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                      line.level === 'error' && 'border-red-500/30 bg-red-500/10 text-red-200',
                      line.level === 'info' && 'border-slate-700 bg-slate-900 text-slate-300'
                    )}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
        {status} | Rol: {sessionRole || 'anonimo'} | Entidad: {selectedEntityName || 'ninguna'} | Escena: {activeSceneName || 'ninguna'}
      </div>
    </div>
  );
}
