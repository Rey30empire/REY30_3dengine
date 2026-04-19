'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createDefaultEditorShortcutConfig,
  EDITOR_SHORTCUT_DEFINITIONS,
  findShortcutConflicts,
  formatShortcutCombo,
  normalizeShortcutCombo,
  type EditorShortcutCategory,
  type EditorShortcutConfig,
  type EditorShortcutId,
} from '@/lib/editor-shortcuts';
import { AlertTriangle, Keyboard, Plus, RotateCcw, Trash2 } from 'lucide-react';

interface EditorShortcutSettingsProps {
  value: EditorShortcutConfig;
  onChange: (next: EditorShortcutConfig) => void;
}

const CATEGORY_ORDER: EditorShortcutCategory[] = [
  'Shell',
  'Workspace',
  'Viewport',
  'Selection',
  'History',
];

export function EditorShortcutSettings({
  value,
  onChange,
}: EditorShortcutSettingsProps) {
  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: EDITOR_SHORTCUT_DEFINITIONS.filter(
          (definition) => definition.category === category
        ),
      })).filter((group) => group.items.length > 0),
    []
  );

  const conflicts = useMemo(() => findShortcutConflicts(value), [value]);
  const conflictMap = useMemo(() => {
    const map = new Map<EditorShortcutId, string[]>();
    for (const conflict of conflicts) {
      for (const definition of conflict.definitions) {
        const list = map.get(definition.id) ?? [];
        list.push(formatShortcutCombo(conflict.combo));
        map.set(definition.id, list);
      }
    }
    return map;
  }, [conflicts]);

  const updateCombo = (
    shortcutId: EditorShortcutId,
    index: number,
    nextValue: string
  ) => {
    const normalized = normalizeShortcutCombo(nextValue);
    const next = {
      ...value,
      [shortcutId]: (value[shortcutId] ?? []).map((combo, comboIndex) =>
        comboIndex === index ? normalized : combo
      ),
    };
    onChange(next);
  };

  const removeCombo = (shortcutId: EditorShortcutId, index: number) => {
    onChange({
      ...value,
      [shortcutId]: (value[shortcutId] ?? []).filter((_, comboIndex) => comboIndex !== index),
    });
  };

  const addCombo = (shortcutId: EditorShortcutId) => {
    onChange({
      ...value,
      [shortcutId]: [...(value[shortcutId] ?? []), ''],
    });
  };

  const resetShortcut = (shortcutId: EditorShortcutId) => {
    const definition = EDITOR_SHORTCUT_DEFINITIONS.find((item) => item.id === shortcutId);
    if (!definition) return;
    onChange({
      ...value,
      [shortcutId]: definition.defaults.map((combo) => normalizeShortcutCombo(combo)),
    });
  };

  const resetAll = () => {
    onChange(createDefaultEditorShortcutConfig());
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 rounded-md bg-slate-800 p-2 text-slate-300">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-100">Atajos globales del editor</h3>
              <p className="text-xs text-slate-400">
                Cambia, agrega o elimina combinaciones para shell, workspaces y viewport.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={resetAll}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Restaurar defaults
          </Button>
        </div>

        {conflicts.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Hay atajos duplicados.
            </div>
            <div className="mt-1 text-amber-100/80">
              Revisa los comandos marcados para evitar conflictos globales.
            </div>
          </div>
        )}
      </section>

      {grouped.map((group) => (
        <section
          key={group.category}
          className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
            {group.category}
          </h4>
          <div className="mt-3 space-y-3">
            {group.items.map((definition) => {
              const combos = value[definition.id] ?? [];
              const itemConflicts = conflictMap.get(definition.id) ?? [];
              return (
                <div
                  key={definition.id}
                  className="rounded-md border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-100">{definition.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{definition.description}</div>
                      {itemConflicts.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-300">
                          Conflicto con: {itemConflicts.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addCombo(definition.id)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Alias
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetShortcut(definition.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Reset
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {combos.length === 0 && (
                      <div className="rounded-md border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-500">
                        Sin atajo asignado. Usa "Alias" para agregar uno.
                      </div>
                    )}
                    {combos.map((combo, index) => (
                      <div key={`${definition.id}-${index}`} className="flex items-center gap-2">
                        <Input
                          value={formatShortcutCombo(combo)}
                          onChange={(event) =>
                            updateCombo(definition.id, index, event.target.value)
                          }
                          placeholder="Ej: Ctrl/Cmd+K, W, Delete"
                          className="bg-slate-950 border-slate-700"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => removeCombo(definition.id, index)}
                          title="Eliminar atajo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
