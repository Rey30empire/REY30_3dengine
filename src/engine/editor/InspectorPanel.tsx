// ============================================
// Inspector Panel - Entity Properties
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useEngineStore } from '@/store/editorStore';
import { EntitySummarySection } from './inspector/EntitySummarySection';
import { SimulationToolsSection } from './inspector/SimulationToolsSection';
import { ComponentEditorCard } from './inspector/ComponentEditorCard';
import {
  SIMULATION_COMPONENT_DEFAULTS,
  type AddableSimulationComponent,
} from './inspector/simulation';

function InspectorSelectionState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex h-full flex-col bg-slate-800/50">
      <div className="border-b border-slate-700 px-3 py-2">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-slate-500">
        {message}
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const { entities, editor, updateEntity, removeEntity } = useEngineStore();
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(
    () => new Set(['Transform'])
  );

  const selectedEntity =
    editor.selectedEntities.length === 1 ? entities.get(editor.selectedEntities[0]) : null;

  const componentEntries = useMemo(
    () => (selectedEntity ? Array.from(selectedEntity.components.entries()) : []),
    [selectedEntity]
  );

  if (editor.selectedEntities.length === 0) {
    return <InspectorSelectionState title="Inspector" message="No object selected" />;
  }

  if (editor.selectedEntities.length > 1) {
    return (
      <InspectorSelectionState
        title="Inspector"
        message={`${editor.selectedEntities.length} objects selected`}
      />
    );
  }

  if (!selectedEntity) return null;

  const toggleComponent = (type: string) => {
    setExpandedComponents((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const updateComponentData = (type: string, patch: Record<string, unknown>) => {
    const target = selectedEntity.components.get(type);
    if (!target) return;

    target.data = { ...target.data, ...patch };
    updateEntity(selectedEntity.id, {
      components: new Map(selectedEntity.components),
    });
  };

  const addSimulationComponent = (type: AddableSimulationComponent) => {
    if (selectedEntity.components.has(type)) return;

    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set(type, {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      data: structuredClone(SIMULATION_COMPONENT_DEFAULTS[type]),
    });

    updateEntity(selectedEntity.id, { components: nextComponents });
    setExpandedComponents((current) => new Set([...current, type]));
  };

  return (
    <div className="flex h-full flex-col bg-slate-800/50">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Inspector</h3>
          <p className="text-[11px] text-slate-500">Selección activa y stack de componentes.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
          onClick={() => removeEntity(selectedEntity.id)}
          title="Eliminar entidad"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <EntitySummarySection
            entity={selectedEntity}
            onNameChange={(name) => updateEntity(selectedEntity.id, { name })}
            onActiveChange={(active) => updateEntity(selectedEntity.id, { active })}
          />

          <SimulationToolsSection
            existingComponents={new Set(componentEntries.map(([type]) => type))}
            onAddComponent={addSimulationComponent}
          />

          <section className="space-y-2">
            {componentEntries.map(([type, component]) => (
              <ComponentEditorCard
                key={type}
                type={type}
                component={component}
                isExpanded={expandedComponents.has(type)}
                onToggle={() => toggleComponent(type)}
                onChange={(patch) => updateComponentData(type, patch)}
              />
            ))}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
