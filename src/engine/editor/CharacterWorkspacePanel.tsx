'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CharacterBuilderPanel } from './CharacterBuilderPanel';
import { ModularCharacterLabPanel } from './ModularCharacterLabPanel';

export function CharacterWorkspacePanel() {
  const [workspace, setWorkspace] = useState<'builder' | 'modular-lab'>('builder');

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-100">Character Workspace</div>
            <div className="text-[11px] text-slate-400">
              Builder clasico y laboratorio modular conviviendo en la misma herramienta.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={workspace === 'builder' ? 'secondary' : 'outline'}
              onClick={() => setWorkspace('builder')}
            >
              Builder
            </Button>
            <Button
              size="sm"
              variant={workspace === 'modular-lab' ? 'secondary' : 'outline'}
              onClick={() => setWorkspace('modular-lab')}
            >
              Modular Lab
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {workspace === 'builder' ? <CharacterBuilderPanel /> : <ModularCharacterLabPanel />}
      </div>
    </div>
  );
}
