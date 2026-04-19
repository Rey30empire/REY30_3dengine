'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDown, Component } from 'lucide-react';
import type { Component as ComponentType } from '@/types/engine';
import { readCharacterBuilderSceneData } from '../characterBuilderSceneSync';
import { InspectorComponentEditorBody } from './ComponentEditors';

interface ComponentEditorCardProps {
  type: string;
  component: ComponentType;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (data: Record<string, unknown>) => void;
}

export function ComponentEditorCard({
  type,
  component,
  isExpanded,
  onToggle,
  onChange,
}: ComponentEditorCardProps) {
  const data = component.data as Record<string, unknown>;
  const hasCharacterBuilderData =
    type === 'MeshRenderer' && Boolean(readCharacterBuilderSceneData(data.characterBuilder));

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-left hover:bg-slate-900">
        <div className="flex items-center gap-2">
          <Component className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-sm text-slate-200">
            {type}
            {hasCharacterBuilderData ? ' · CharacterBuilder3D' : ''}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-slate-400 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 py-3">
        <InspectorComponentEditorBody type={type} data={data} onChange={onChange} />
      </CollapsibleContent>
    </Collapsible>
  );
}
