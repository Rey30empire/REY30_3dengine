import type { EditorProjectSaveData, EditorProjectSaveSummary } from '@/engine/serialization';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';

type RemoteEditorProjectPayload = {
  success?: boolean;
  active?: boolean;
  projectKey?: string;
  slot?: string;
  updatedAt?: number | null;
  summary?: EditorProjectSaveSummary | null;
  saveData?: unknown;
  error?: string;
};

function buildProjectHeaders(projectName: string) {
  return {
    'Content-Type': 'application/json',
    'x-rey30-project': normalizeProjectKey(projectName),
  };
}

export async function fetchRemoteEditorProjectSummary(params: {
  projectName: string;
  slot?: string;
}) {
  const query = new URLSearchParams({
    slot: params.slot || DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
    projectKey: normalizeProjectKey(params.projectName),
  });
  const response = await fetch(`/api/editor-project?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'x-rey30-project': normalizeProjectKey(params.projectName),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as RemoteEditorProjectPayload;
  return { response, payload };
}

export async function fetchRemoteEditorProjectSave(params: {
  projectName: string;
  slot?: string;
}) {
  const query = new URLSearchParams({
    slot: params.slot || DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
    includeSave: '1',
    projectKey: normalizeProjectKey(params.projectName),
  });
  const response = await fetch(`/api/editor-project?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'x-rey30-project': normalizeProjectKey(params.projectName),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as RemoteEditorProjectPayload;
  return { response, payload };
}

export async function saveRemoteEditorProject(params: {
  projectName: string;
  saveData: EditorProjectSaveData;
  slot?: string;
}) {
  const response = await fetch('/api/editor-project', {
    method: 'POST',
    headers: buildProjectHeaders(params.projectName),
    body: JSON.stringify({
      slot: params.slot || DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
      saveData: params.saveData,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as RemoteEditorProjectPayload;
  return { response, payload };
}
