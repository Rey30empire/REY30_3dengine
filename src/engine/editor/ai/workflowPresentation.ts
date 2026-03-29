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
    ? 'Solo guía textual. La creación/edición se hace desde Scene + Scrib Studio manual.'
    : engineMode === 'MODE_HYBRID'
      ? 'La IA genera la base y tú iteras manifest/config/código en Scrib Studio.'
      : 'Prompt único. El orquestador ejecuta pipeline completo sobre Scene + Entities + Scribs.';

  const inputPlaceholder = isManualWorkflow
    ? 'Modo manual: crea/edita desde Scrib Studio'
    : isAIFirstWorkflow
      ? 'Prompt único (ej: crea un juego survival en desierto)'
      : 'Describe lo que quieres crear...';

  return {
    isManualWorkflow,
    isAIFirstWorkflow,
    modeLabel,
    modeDescription,
    inputPlaceholder,
  };
}
