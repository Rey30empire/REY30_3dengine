'use client';

import { Button } from '@/components/ui/button';
import { InspectorSection } from './shared';
import type { AddableSimulationComponent } from './simulation';

interface SimulationToolsSectionProps {
  existingComponents: Set<string>;
  onAddComponent: (type: AddableSimulationComponent) => void;
}

const SIMULATION_COMPONENTS: AddableSimulationComponent[] = [
  'Collider',
  'Rigidbody',
  'ParticleSystem',
];

export function SimulationToolsSection({
  existingComponents,
  onAddComponent,
}: SimulationToolsSectionProps) {
  return (
    <InspectorSection
      title="Component Stack"
      description="Agrega bloques de simulación y luego afina cada componente desde su editor."
      action={
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          Simulation ready
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SIMULATION_COMPONENTS.map((componentType) => {
          const exists = existingComponents.has(componentType);
          return (
            <Button
              key={componentType}
              variant={exists ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => onAddComponent(componentType)}
              disabled={exists}
            >
              {exists ? `${componentType} listo` : `Add ${componentType}`}
            </Button>
          );
        })}
      </div>
    </InspectorSection>
  );
}
