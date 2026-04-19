'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DatabaseZap, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import { SettingsPanel } from '@/engine/editor/SettingsPanel';
import { TerminalPanel } from '@/engine/editor/TerminalPanel';
import {
  type EditorSessionPayload,
  resolveEditorAccessFromSessionPayload,
} from '@/engine/editor/shell/editorShellAccess';

export default function AdminPage() {
  const [editorAccess, setEditorAccess] = useState(() =>
    resolveEditorAccessFromSessionPayload(null)
  );
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const payload = (await loadClientAuthSession()) as EditorSessionPayload;
        if (!cancelled) {
          setEditorAccess(resolveEditorAccessFromSessionPayload(payload));
        }
      } finally {
        if (!cancelled) {
          setResolved(true);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const canAccessAdmin = resolved && editorAccess.permissions.admin;
  const canAccessTerminal = resolved && editorAccess.permissions.terminalActions;

  if (!resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          <span>Cargando administracion...</span>
        </div>
      </div>
    );
  }

  if (!canAccessAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Acceso restringido</h1>
              <p className="mt-1 text-sm text-slate-400">
                La administracion solo esta disponible para sesiones elevadas.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
            Usa el editor principal para crear contenido. Si necesitas acceso tecnico, inicia sesion
            con una cuenta `OWNER/EDITOR` o pide habilitacion a un administrador.
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al editor
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold">Administracion</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Credenciales, permisos, politicas y atajos viven aqui, fuera del flujo principal de creacion.
            </p>
          </div>

          <Button size="sm" variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al editor
            </Link>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <Link href="/admin/runtime-forensics">
              <DatabaseZap className="mr-2 h-4 w-4" />
              Runtime Forensics
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/admin/runtime-forensics/overview">
              <DatabaseZap className="mr-2 h-4 w-4" />
              Forensics Overview
            </Link>
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden p-3">
        {canAccessTerminal ? (
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <div className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
              <SettingsPanel />
            </div>
            <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
              <div className="border-b border-slate-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-100">Terminal administrativo</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Solo expone acciones permitidas y auditables del backend.
                </p>
              </div>
              <div className="h-[calc(100%-65px)] min-h-[420px]">
                <TerminalPanel />
              </div>
            </section>
          </div>
        ) : (
          <div className="h-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <SettingsPanel />
          </div>
        )}
      </main>
    </div>
  );
}
