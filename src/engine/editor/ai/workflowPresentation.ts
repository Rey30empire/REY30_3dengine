import type { EngineWorkflowMode } from '@/types/engine';

export function getWorkflowPresentation(engineMode: EngineWorkflowMode) {
  const isManualWorkflow = engineMode === 'MODE_MANUAL';
  const isAIFirstWorkflow = engineMode === 'MODE_AI_FIRST';

  const modeLabel = isManualWorkflow
    ? 'Manual'
    : engineMode === 'MODE_HYBRID'
      ? 'Hybrid'
      : 'AI First';

  const modeDescription = isManualWorkflow
    ? 'Trabajas con control directo sobre la escena y los ajustes.'
    : engineMode === 'MODE_HYBRID'
      ? 'La IA prepara una primera versión y tú la refinas.'
      : 'Describe lo que quieres y la app lo construye por ti.';

  const inputPlaceholder = isManualWorkflow
    ? 'Modo manual: crea/edita desde Scrib Studio'
    : isAIFirstWorkflow
      ? 'Describe tu juego o escena ideal'
      : 'Describe lo que quieres crear...';

  return {
    isManualWorkflow,
    isAIFirstWorkflow,
    modeLabel,
    modeDescription,
    inputPlaceholder,
  };
}
