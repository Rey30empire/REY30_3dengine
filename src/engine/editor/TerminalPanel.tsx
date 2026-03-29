// ============================================
// Terminal Panel - Real system/project commands
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Play, AlertTriangle, Terminal, Zap, RefreshCw } from 'lucide-react';

interface TermEntry {
  id: string;
  cmd: string;
  cwd: string;
  stdout: string;
  stderr: string;
  code: number;
  ts: string;
}

export function TerminalPanel() {
  const [cwd, setCwd] = useState<string>('.');
  const [cmd, setCmd] = useState<string>('pnpm tsc --noEmit');
  const [history, setHistory] = useState<TermEntry[]>([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(100);

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

  const runCommand = async (value?: string) => {
    const command = value ?? cmd;
    if (!command.trim()) return;
    setRunning(true);
    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: command, cwd }),
      });
      const payload = await res.json();
      const entry: TermEntry = {
        id: crypto.randomUUID(),
        cmd: command,
        cwd: payload.cwd || cwd,
        stdout: payload.stdout || '',
        stderr: payload.stderr || '',
        code: payload.code ?? (payload.ok ? 0 : 1),
        ts: new Date().toISOString(),
      };
      setHistory((prev) => [...prev, entry]);
    } catch (error) {
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          cmd: command,
          cwd,
          stdout: '',
          stderr: String(error),
          code: 1,
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const quick = [
    { label: 'List', cmd: 'dir' },
    { label: 'Git Status', cmd: 'git status --short' },
    { label: 'Tests', cmd: 'pnpm test' },
    { label: 'Build Web', cmd: 'pnpm build' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-800">
        <Input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          className="h-8 text-xs bg-slate-900 border-slate-800 w-48"
          placeholder="cwd"
        />
        <Input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          className="h-8 text-xs bg-slate-900 border-slate-800 flex-1"
          placeholder="Comando..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !running) runCommand();
          }}
        />
        <Button size="sm" disabled={running} onClick={() => runCommand()}>
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex gap-1 px-2 py-1 border-b border-slate-800">
        {quick.map((q) => (
          <Button
            key={q.label}
            variant="outline"
            size="sm"
            className="h-7 text-[11px] border-slate-700"
            onClick={() => runCommand(q.cmd)}
            disabled={running}
          >
            {q.label}
          </Button>
        ))}
      </div>

      <div className="mx-2 mt-1 h-1 overflow-hidden rounded-full border border-slate-800 bg-slate-950/80 shrink-0">
        <div
          className="h-full rounded-full bg-cyan-400/80 transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
          aria-label="Barra de movimiento de terminal"
        />
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="space-y-2 p-2 font-mono text-xs">
          {history.length === 0 && (
            <div className="text-slate-500 flex items-center gap-2">
              <Terminal className="w-4 h-4" /> No commands yet.
            </div>
          )}
          {history.map((entry) => (
            <Card
              key={entry.id}
              className={cn(
                'bg-slate-900 border border-slate-800 p-2',
                entry.code !== 0 && 'border-red-700'
              )}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span className="font-semibold text-slate-200">{entry.cmd}</span>
                <span>{entry.ts}</span>
              </div>
              <div className="text-[10px] text-slate-500 mb-1">cwd: {entry.cwd}</div>
              {entry.stdout && (
                <pre className="bg-slate-950/70 text-[11px] text-slate-200 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {entry.stdout}
                </pre>
              )}
              {entry.stderr && (
                <pre className="bg-red-950/40 text-[11px] text-red-300 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {entry.stderr}
                </pre>
              )}
              <div className="flex items-center gap-2 text-[11px] mt-1">
                {entry.code === 0 ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> exit 0
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> exit {entry.code}
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
