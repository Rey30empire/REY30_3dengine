// ============================================
// Terminal Panel - Allowlisted admin actions
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Play, RefreshCw, Terminal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface TerminalActionDescriptor {
  id: string;
  label: string;
  description: string;
  commandPreview: string;
  acceptsPath: boolean;
}

interface TerminalEntry {
  id: string;
  actionId: string;
  label: string;
  commandPreview: string;
  cwd: string;
  stdout: string;
  stderr: string;
  code: number;
  ts: string;
}

export function TerminalPanel() {
  const [actions, setActions] = useState<TerminalActionDescriptor[]>([]);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [relativePath, setRelativePath] = useState('.');
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [loadingActions, setLoadingActions] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Cargando acciones permitidas...');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(100);

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === selectedActionId) ?? null,
    [actions, selectedActionId]
  );

  const quickActions = useMemo(
    () =>
      [
        'project.list_directory',
        'project.git_status',
        'project.typecheck',
        'project.lint',
        'project.build',
      ]
        .map((id) => actions.find((action) => action.id === id))
        .filter((value): value is TerminalActionDescriptor => Boolean(value)),
    [actions]
  );

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [history, autoScroll]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setAutoScroll(distanceFromBottom <= 20);
      const max = viewport.scrollHeight - viewport.clientHeight;
      if (max <= 0) {
        setScrollProgress(100);
      } else {
        setScrollProgress(Math.round((viewport.scrollTop / max) * 100));
      }
    };
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadActions = async () => {
      setLoadingActions(true);
      try {
        const response = await fetch('/api/terminal', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        if (cancelled) return;

        if (!response.ok) {
          const message =
            typeof payload.error === 'string'
              ? payload.error
              : 'No se pudo cargar el catálogo de operaciones.';
          setStatusMessage(message);
          setActions([]);
          setSelectedActionId('');
          return;
        }

        const nextActions = Array.isArray(payload.actions)
          ? (payload.actions as TerminalActionDescriptor[])
          : [];
        setActions(nextActions);
        setSelectedActionId(nextActions[0]?.id ?? '');
        setStatusMessage(
          nextActions.length > 0
            ? 'Solo se permiten acciones auditables del catálogo.'
            : 'No hay acciones permitidas disponibles.'
        );
      } catch (error) {
        if (cancelled) return;
        setActions([]);
        setSelectedActionId('');
        setStatusMessage(`No se pudo cargar el terminal: ${String(error)}`);
      } finally {
        if (!cancelled) {
          setLoadingActions(false);
        }
      }
    };

    void loadActions();

    return () => {
      cancelled = true;
    };
  }, []);

  const runAction = async (actionId?: string) => {
    const nextActionId = actionId ?? selectedActionId;
    const action = actions.find((item) => item.id === nextActionId);
    if (!action) return;

    setRunning(true);
    try {
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: action.id,
          relativePath: action.acceptsPath ? relativePath : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      const entry: TerminalEntry = {
        id: crypto.randomUUID(),
        actionId: action.id,
        label: typeof payload.label === 'string' ? payload.label : action.label,
        commandPreview:
          typeof payload.commandPreview === 'string'
            ? payload.commandPreview
            : action.commandPreview,
        cwd: typeof payload.cwd === 'string' ? payload.cwd : '.',
        stdout: typeof payload.stdout === 'string' ? payload.stdout : '',
        stderr:
          typeof payload.stderr === 'string'
            ? payload.stderr
            : typeof payload.error === 'string'
              ? payload.error
              : '',
        code:
          typeof payload.code === 'number'
            ? payload.code
            : response.ok
              ? 0
              : 1,
        ts: new Date().toISOString(),
      };
      setHistory((prev) => [...prev, entry]);
      setStatusMessage(
        response.ok
          ? `Acción ejecutada: ${entry.label}`
          : `Acción fallida: ${entry.label}`
      );
    } catch (error) {
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          actionId: action.id,
          label: action.label,
          commandPreview: action.commandPreview,
          cwd: '.',
          stdout: '',
          stderr: String(error),
          code: 1,
          ts: new Date().toISOString(),
        },
      ]);
      setStatusMessage(`No se pudo ejecutar la acción: ${String(error)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-800 px-2 py-2">
        <div className="min-w-[220px] flex-1">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Acción permitida
          </p>
          <Select
            value={selectedActionId}
            onValueChange={setSelectedActionId}
            disabled={loadingActions || running || actions.length === 0}
          >
            <SelectTrigger className="h-9 border-slate-800 bg-slate-900 text-xs text-slate-100">
              <SelectValue placeholder="Selecciona una acción" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
              {actions.map((action) => (
                <SelectItem key={action.id} value={action.id}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[180px] flex-1">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Ruta relativa
          </p>
          <Input
            value={relativePath}
            onChange={(event) => setRelativePath(event.target.value)}
            className="h-9 border-slate-800 bg-slate-900 text-xs text-slate-100"
            placeholder="."
            disabled={!selectedAction?.acceptsPath || running}
          />
        </div>

        <Button
          size="sm"
          disabled={running || !selectedAction}
          onClick={() => void runAction()}
          className="h-9"
        >
          {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </Button>
      </div>

      <div className="border-b border-slate-800 px-2 py-2">
        <div className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          <div className="font-medium text-slate-100">
            {selectedAction?.label || 'Terminal administrativo'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {selectedAction?.description || statusMessage}
          </div>
          {selectedAction ? (
            <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[11px] text-cyan-200">
              {selectedAction.commandPreview}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-800 px-2 py-2">
        {quickActions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            className="h-7 border-slate-700 text-[11px]"
            onClick={() => {
              setSelectedActionId(action.id);
              void runAction(action.id);
            }}
            disabled={running}
          >
            {action.label}
          </Button>
        ))}
      </div>

      <div className="mx-2 mt-1 h-1 shrink-0 overflow-hidden rounded-full border border-slate-800 bg-slate-950/80">
        <div
          className="h-full rounded-full bg-cyan-400/80 transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
          aria-label="Barra de movimiento de terminal"
        />
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="space-y-2 p-2 font-mono text-xs">
          {history.length === 0 && (
            <div className="flex items-center gap-2 text-slate-500">
              <Terminal className="h-4 w-4" /> {statusMessage}
            </div>
          )}
          {history.map((entry) => (
            <Card
              key={entry.id}
              className={cn(
                'border border-slate-800 bg-slate-900 p-2',
                entry.code !== 0 && 'border-red-700'
              )}
            >
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold text-slate-200">{entry.label}</span>
                <span>{entry.ts}</span>
              </div>
              <div className="mb-1 rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] text-cyan-200">
                {entry.commandPreview}
              </div>
              <div className="mb-1 text-[10px] text-slate-500">cwd: {entry.cwd}</div>
              {entry.stdout && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-950/70 p-2 text-[11px] text-slate-200">
                  {entry.stdout}
                </pre>
              )}
              {entry.stderr && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-red-950/40 p-2 text-[11px] text-red-300">
                  {entry.stderr}
                </pre>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                {entry.code === 0 ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <Zap className="h-3 w-3" /> exit 0
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" /> exit {entry.code}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-slate-800 px-2 py-1 text-[10px] text-slate-500">
        <span>Entradas: {history.length}</span>
        <button
          type="button"
          className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800"
          onClick={() => {
            setAutoScroll(true);
            scrollToBottom();
          }}
        >
          {autoScroll ? 'Auto-scroll ON' : 'Ir al final'}
        </button>
      </div>
    </div>
  );
}
