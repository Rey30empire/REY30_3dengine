'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useEngineStore } from '@/store/editorStore';
import {
  acceptTopologyIntentStroke,
  applyTopologyAutoWeld,
  applyTopologyCleanup,
  applyTopologyRelax,
  applyTopologySymmetry,
  createTopologyTemplateEditableMesh,
} from './modelerTopologyBridge';
import type { EditableMesh } from './modelerMesh';
import type { TemplateType } from '@/engine/systems/topology-authoring';

type Props = {
  mesh: EditableMesh;
  onApplyMesh: (nextMesh: EditableMesh, message: string) => void;
};

type SymmetryAxis = 'x' | 'y' | 'z';

function readNumericInput(rawValue: string, fallback: number) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const TEMPLATE_TYPES: TemplateType[] = [
  'chair',
  'table',
  'bed',
  'vehicle',
  'humanoid',
  'animal',
  'generic',
];

export function TopologyAuthoringCard({ mesh, onApplyMesh }: Props) {
  const {
    editor,
    setModelerMode,
    setTopologyViewportEnabled,
    setTopologyViewportMode,
    setTopologyViewportTemplateType,
  } = useEngineStore();
  const [templateType, setTemplateType] = useState<TemplateType>('chair');
  const [templateWidth, setTemplateWidth] = useState(1.4);
  const [templateHeight, setTemplateHeight] = useState(1.2);
  const [templateDepth, setTemplateDepth] = useState(1.1);
  const [autoWeldDistance, setAutoWeldDistance] = useState(0.001);
  const [symmetryAxis, setSymmetryAxis] = useState<SymmetryAxis>('x');
  const [lastInsight, setLastInsight] = useState(
    'Topology bridge listo: plantillas, intent presets y cleanup sobre el mesh actual.'
  );

  const applyTemplate = () => {
    const nextMesh = createTopologyTemplateEditableMesh(templateType, {
      width: templateWidth,
      height: templateHeight,
      depth: templateDepth,
    });
    onApplyMesh(nextMesh, `Topology template ${templateType} aplicada al modeler`);
    setLastInsight(`Template ${templateType} convertida a EditableMesh.`);
  };

  const viewportEnabled = Boolean(editor.topologyViewportEnabled);
  const viewportMode = editor.topologyViewportMode ?? 'intent_driven';
  const viewportTemplateType = editor.topologyViewportTemplateType ?? 'chair';

  const enableViewportMode = (enabled: boolean) => {
    setTopologyViewportEnabled(enabled);
    if (enabled) {
      setModelerMode('object');
      setLastInsight(
        'Viewport topology activo: dibuja en SceneView para aplicar intent o plantilla sobre la malla seleccionada.'
      );
      return;
    }
    setLastInsight('Viewport topology desactivado.');
  };

  const applyIntentPreset = (preset: 'vertex' | 'edge' | 'face') => {
    const stroke =
      preset === 'vertex'
        ? [{ x: 0, y: 0, z: 0 }]
        : preset === 'edge'
          ? [
              { x: -0.5, y: 0, z: 0 },
              { x: 0.5, y: 0, z: 0 },
            ]
          : [
              { x: -0.6, y: 0, z: -0.6 },
              { x: 0.6, y: 0, z: -0.6 },
              { x: 0.6, y: 0, z: 0.6 },
              { x: -0.6, y: 0, z: -0.6 },
            ];
    const result = acceptTopologyIntentStroke({
      mesh,
      mode: 'intent_driven',
      stroke,
    });
    if (result.editableMesh) {
      onApplyMesh(
        result.editableMesh,
        `Intent topology aplicada: ${result.suggestionKind ?? preset}`
      );
    }
    setLastInsight(`Ultima sugerencia interpretada: ${result.suggestionKind ?? 'sin sugerencia'}.`);
  };

  return (
    <Card className="border-slate-800 bg-slate-950 p-3">
      <div className="mb-3">
        <p className="text-xs uppercase tracking-wide text-slate-400">Topology Authoring</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Plantillas parametricas y operaciones del brush topologico conectadas al modeler actual.
        </p>
      </div>

      <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
          Template base
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          {TEMPLATE_TYPES.map((entry) => (
            <Button
              key={entry}
              size="sm"
              variant={templateType === entry ? 'default' : 'outline'}
              className="h-7 text-[11px]"
              onClick={() => setTemplateType(entry)}
            >
              {entry}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Width</span>
            <Input
              type="number"
              value={templateWidth}
              min={0.2}
              max={8}
              step={0.1}
              onChange={(event) =>
                setTemplateWidth(readNumericInput(event.target.value, templateWidth))
              }
              className="h-8 border-slate-700 bg-slate-950 text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Height</span>
            <Input
              type="number"
              value={templateHeight}
              min={0.2}
              max={8}
              step={0.1}
              onChange={(event) =>
                setTemplateHeight(readNumericInput(event.target.value, templateHeight))
              }
              className="h-8 border-slate-700 bg-slate-950 text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">Depth</span>
            <Input
              type="number"
              value={templateDepth}
              min={0.2}
              max={8}
              step={0.1}
              onChange={(event) =>
                setTemplateDepth(readNumericInput(event.target.value, templateDepth))
              }
              className="h-8 border-slate-700 bg-slate-950 text-xs"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={applyTemplate}>
            Aplicar template
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
          Intent presets
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => applyIntentPreset('vertex')}>
            Intent vertex
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyIntentPreset('edge')}>
            Intent edge
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyIntentPreset('face')}>
            Intent face
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
          Viewport draw
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={viewportEnabled ? 'default' : 'outline'}
            onClick={() => enableViewportMode(!viewportEnabled)}
          >
            {viewportEnabled ? 'Desactivar viewport draw' : 'Activar viewport draw'}
          </Button>
          <Button
            size="sm"
            variant={viewportMode === 'intent_driven' ? 'default' : 'outline'}
            onClick={() => {
              setTopologyViewportMode('intent_driven');
              setLastInsight('Viewport topology en modo intent-driven.');
            }}
          >
            Intent viewport
          </Button>
          <Button
            size="sm"
            variant={viewportMode === 'template' ? 'default' : 'outline'}
            onClick={() => {
              setTopologyViewportMode('template');
              setLastInsight('Viewport topology en modo template.');
            }}
          >
            Template viewport
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_TYPES.map((entry) => (
            <Button
              key={`viewport_${entry}`}
              size="sm"
              variant={viewportTemplateType === entry ? 'default' : 'outline'}
              className="h-7 text-[11px]"
              onClick={() => {
                setTopologyViewportTemplateType(entry);
                setLastInsight(`Viewport template listo: ${entry}.`);
              }}
            >
              {entry}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Con viewport draw activo, `SceneView` usa el stroke del mouse sobre la malla o plano de
          trabajo y lo convierte con el bridge topológico.
        </p>
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
          Topology ops
        </div>
        <div className="mb-2 grid gap-2 sm:grid-cols-[140px,1fr]">
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">
              Auto weld
            </span>
            <Input
              type="number"
              value={autoWeldDistance}
              min={0.0001}
              max={1}
              step={0.0005}
              onChange={(event) =>
                setAutoWeldDistance(readNumericInput(event.target.value, autoWeldDistance))
              }
              className="h-8 border-slate-700 bg-slate-950 text-xs"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onApplyMesh(applyTopologyCleanup(mesh), 'Topology cleanup aplicada')}
            >
              Cleanup
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onApplyMesh(
                  applyTopologyAutoWeld(mesh, autoWeldDistance),
                  `Topology auto weld ${autoWeldDistance.toFixed(4)} aplicado`
                )
              }
            >
              Auto weld
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onApplyMesh(applyTopologyRelax(mesh), 'Topology relax aplicada')}
            >
              Relax
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['x', 'y', 'z'] as SymmetryAxis[]).map((axis) => (
            <Button
              key={axis}
              size="sm"
              variant={symmetryAxis === axis ? 'default' : 'outline'}
              className="h-7 text-[11px]"
              onClick={() => setSymmetryAxis(axis)}
            >
              Sym {axis.toUpperCase()}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onApplyMesh(
                applyTopologySymmetry(mesh, symmetryAxis),
                `Topology symmetry ${symmetryAxis.toUpperCase()} aplicada`
              )
            }
          >
            Aplicar symmetry
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
        {lastInsight}
      </div>
    </Card>
  );
}
