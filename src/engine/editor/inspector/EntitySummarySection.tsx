'use client';

import type { Entity } from '@/types/engine';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { InspectorSection } from './shared';

interface EntitySummarySectionProps {
  entity: Entity;
  onNameChange: (name: string) => void;
  onActiveChange: (active: boolean) => void;
}

export function EntitySummarySection({
  entity,
  onNameChange,
  onActiveChange,
}: EntitySummarySectionProps) {
  return (
    <InspectorSection
      title="Entity"
      description="Identidad base, tags y estado activo del objeto seleccionado."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Name</Label>
          <Input
            value={entity.name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-8 border-slate-700 bg-slate-950"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Tags</Label>
          <div className="flex flex-wrap gap-1">
            {entity.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
              >
                {tag}
              </span>
            ))}
            <button className="rounded border border-dashed border-slate-700 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-600">
              + Add Tag
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
          <Label className="text-xs text-slate-400">Active</Label>
          <Switch checked={entity.active} onCheckedChange={onActiveChange} />
        </div>
      </div>
    </InspectorSection>
  );
}
