// ============================================
// Console Panel - Logging System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Terminal,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConsoleLog {
  id: string;
  type: 'log' | 'info' | 'warn' | 'error' | 'success';
  message: string;
  timestamp: Date;
  count: number;
  collapsed?: boolean;
  stack?: string;
  data?: any;
}

// Global console manager
class ConsoleManager {
  private static instance: ConsoleManager;
  private logs: ConsoleLog[] = [];
  private listeners: Set<(logs: ConsoleLog[]) => void> = new Set();
  private maxLogs: number = 1000;

  static getInstance(): ConsoleManager {
    if (!ConsoleManager.instance) {
      ConsoleManager.instance = new ConsoleManager();
    }
    return ConsoleManager.instance;
  }

  setMaxLogs(max: number) {
    this.maxLogs = max;
  }

  log(message: string, data?: any) {
    this.addLog('log', message, data);
  }

  info(message: string, data?: any) {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: any) {
    this.addLog('warn', message, data);
  }

  error(message: string, error?: Error) {
    this.addLog('error', message, {
      error,
      stack: error?.stack,
    });
  }

  success(message: string, data?: any) {
    this.addLog('success', message, data);
  }

  private addLog(type: ConsoleLog['type'], message: string, data?: any) {
    const lastLog = this.logs[this.logs.length - 1];
    if (lastLog && lastLog.message === message && lastLog.type === type) {
      lastLog.count++;
      this.notifyListeners();
      return;
    }

    const log: ConsoleLog = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date(),
      count: 1,
      data,
      stack: data?.stack,
    };

    this.logs.push(log);

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.notifyListeners();
  }

  getLogs(): ConsoleLog[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(listener: (logs: ConsoleLog[]) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.logs]));
  }
}

export const consoleManager = ConsoleManager.getInstance();

interface ConsolePanelProps {
  maxLogs?: number;
}

export function ConsolePanel({ maxLogs = 500 }: ConsolePanelProps) {
  const [logs, setLogs] = useState<ConsoleLog[]>(() => consoleManager.getLogs());
  const [filter, setFilter] = useState<'all' | ConsoleLog['type']>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(100);

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  useEffect(() => {
    consoleManager.setMaxLogs(maxLogs);
    const unsubscribe = consoleManager.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, [maxLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollToBottom();
    }
  }, [logs, autoScroll]);

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

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.type !== filter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const logCounts = {
    all: logs.length,
    log: logs.filter(l => l.type === 'log').length,
    info: logs.filter(l => l.type === 'info').length,
    warn: logs.filter(l => l.type === 'warn').length,
    error: logs.filter(l => l.type === 'error').length,
    success: logs.filter(l => l.type === 'success').length,
  };

  const getLogIcon = (type: ConsoleLog['type']) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
      case 'warn': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
      case 'info': return <Info className="w-3.5 h-3.5 text-blue-400" />;
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
      default: return <Terminal className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getLogColor = (type: ConsoleLog['type']) => {
    switch (type) {
      case 'error': return 'bg-red-500/10 border-l-2 border-red-500';
      case 'warn': return 'bg-yellow-500/10 border-l-2 border-yellow-500';
      case 'info': return 'bg-blue-500/10 border-l-2 border-blue-500';
      case 'success': return 'bg-green-500/10 border-l-2 border-green-500';
      default: return 'border-l-2 border-transparent';
    }
  };

  const copyToClipboard = (message: string) => {
    navigator.clipboard.writeText(message);
  };

  const handleClear = () => {
    consoleManager.clear();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800">
        <FilterButton filter={filter} setFilter={setFilter} counts={logCounts} />
        
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="h-6 pl-6 text-xs bg-slate-900 border-slate-800"
          />
        </div>

        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleClear}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      <div className="mx-2 mt-1 h-1 overflow-hidden rounded-full border border-slate-800 bg-slate-950/80 shrink-0">
        <div
          className="h-full rounded-full bg-cyan-400/80 transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
          aria-label="Barra de movimiento de consola"
        />
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 py-8">
              No logs to display
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "group px-2 py-1 hover:bg-slate-900/50 cursor-pointer",
                  getLogColor(log.type)
                )}
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="flex items-start gap-2">
                  {(log.stack || log.data) && (
                    <button className="mt-0.5">
                      {expandedId === log.id ? (
                        <ChevronDown className="w-3 h-3 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-slate-500" />
                      )}
                    </button>
                  )}

                  {getLogIcon(log.type)}

                  <span className="text-slate-600 shrink-0">
                    {log.timestamp.toLocaleTimeString()}
                  </span>

                  <span className={cn(
                    "flex-1 break-all",
                    log.type === 'error' ? "text-red-300" :
                    log.type === 'warn' ? "text-yellow-300" :
                    log.type === 'success' ? "text-green-300" :
                    "text-slate-300"
                  )}>
                    {log.message}
                  </span>

                  {log.count > 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 rounded-full text-slate-300">
                      {log.count}
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(log.message);
                    }}
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </Button>
                </div>

                {expandedId === log.id && (log.stack || log.data) && (
                  <div className="mt-1 ml-8 p-2 bg-slate-900 rounded text-slate-400 whitespace-pre-wrap">
                    {log.stack && (
                      <div className="mb-2">
                        <span className="text-slate-500">Stack trace:</span>
                        <pre className="mt-1 text-[10px] overflow-x-auto">{log.stack}</pre>
                      </div>
                    )}
                    {log.data && !log.stack && (
                      <pre className="text-[10px] overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Status Bar */}
      <div className="flex items-center gap-2 px-2 py-1 border-t border-slate-800 text-[10px] text-slate-500">
        <span>{filteredLogs.length} logs</span>
        <span>|</span>
        <span className="text-red-400">{logCounts.error} errors</span>
        <span className="text-yellow-400">{logCounts.warn} warnings</span>
        <span>|</span>
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

function FilterButton({
  filter,
  setFilter,
  counts,
}: {
  filter: 'all' | ConsoleLog['type'];
  setFilter: (f: 'all' | ConsoleLog['type']) => void;
  counts: Record<string, number>;
}) {
  const options: { value: 'all' | ConsoleLog['type']; label: string; color: string }[] = [
    { value: 'all', label: 'All', color: 'text-slate-400' },
    { value: 'error', label: 'Errors', color: 'text-red-400' },
    { value: 'warn', label: 'Warnings', color: 'text-yellow-400' },
    { value: 'info', label: 'Info', color: 'text-blue-400' },
    { value: 'log', label: 'Logs', color: 'text-slate-400' },
    { value: 'success', label: 'Success', color: 'text-green-400' },
  ];

  return (
    <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
      <SelectTrigger className="h-6 w-28 text-xs bg-slate-900 border-slate-800">
        <Filter className="w-3 h-3 mr-1" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700">
        {options.map(option => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            <span className={option.color}>{option.label}</span>
            <span className="ml-auto text-slate-500">({counts[option.value]})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useConsole() {
  return {
    log: (message: string, data?: any) => consoleManager.log(message, data),
    info: (message: string, data?: any) => consoleManager.info(message, data),
    warn: (message: string, data?: any) => consoleManager.warn(message, data),
    error: (message: string, error?: Error) => consoleManager.error(message, error),
    success: (message: string, data?: any) => consoleManager.success(message, data),
  };
}
