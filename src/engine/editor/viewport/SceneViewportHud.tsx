'use client';

import type { ComponentProps } from 'react';
import { Box, Camera, Circle, Lightbulb, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorToolbar } from '../EditorToolbar';

type QuickCreateEntityType = 'cube' | 'sphere' | 'light' | 'camera';

interface SceneViewportHudProps {
  toolbarProps: ComponentProps<typeof EditorToolbar>;
  onCreateEntity: (type: QuickCreateEntityType) => void;
  onRemoveSelected: () => void;
}

const QUICK_CREATE_ACTIONS: Array<{
  id: QuickCreateEntityType;
  label: string;
  icon: typeof Box;
  testId: string;
}> = [
  { id: 'cube', label: 'Cubo', icon: Box, testId: 'scene-add-cube' },
  { id: 'sphere', label: 'Esfera', icon: Circle, testId: 'scene-add-sphere' },
  { id: 'light', label: 'Luz', icon: Lightbulb, testId: 'scene-add-light' },
  { id: 'camera', label: 'Camara', icon: Camera, testId: 'scene-add-camera' },
];

export function SceneViewportHud({
  toolbarProps,
  onCreateEntity,
  onRemoveSelected,
}: SceneViewportHudProps) {
  return (
    <>
      <div
        className="absolute left-2 right-2 top-2 z-20"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
      >
        <EditorToolbar {...toolbarProps} />
      </div>

      <div
        className="absolute left-2 top-[4.75rem] z-20"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseUp={(event) => event.stopPropagation()}
      >
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/92 p-2 backdrop-blur-sm shadow-lg shadow-black/20">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Quick Add
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Primitivas y nodos base para construir la escena.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-500/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
              onClick={onRemoveSelected}
              data-testid="scene-remove-selected"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar seleccion
            </Button>
          </div>

          <div className="flex max-w-[480px] flex-wrap gap-1.5">
            {QUICK_CREATE_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  size="sm"
                  variant="secondary"
                  className="h-8 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  onClick={() => onCreateEntity(action.id)}
                  data-testid={action.testId}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
