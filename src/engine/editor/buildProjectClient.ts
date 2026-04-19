import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import type { BuildReport } from '@/engine/reyplay/types';
import { normalizeProjectKey } from '@/lib/project-key';
import type { BuildArtifact } from '@/types/engine';

export type BuildTarget = 'web' | 'windows-exe' | 'windows-msi';

export type RemoteBuildPayload = {
  ok?: boolean;
  target?: BuildTarget;
  buildId?: string;
  report?: BuildReport;
  artifacts?: BuildArtifact[];
  missingDeps?: string[];
  logs?: string[];
  error?: string;
  projectKey?: string;
  slot?: string;
  source?: string;
};

export async function buildRemoteProject(params: {
  projectName: string;
  target: BuildTarget;
  slot?: string;
}) {
  const response = await fetch('/api/build', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rey30-project': normalizeProjectKey(params.projectName),
    },
    body: JSON.stringify({
      target: params.target,
      slot: params.slot || DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      projectKey: normalizeProjectKey(params.projectName),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as RemoteBuildPayload;
  return { response, payload };
}
