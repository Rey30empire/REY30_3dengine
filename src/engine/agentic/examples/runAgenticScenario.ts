import { MasterOrchestrator } from '../execution/MasterOrchestrator';
import type { AgenticRunResult } from '../execution/MasterOrchestrator';

export async function runAgenticScenario(prompt: string): Promise<AgenticRunResult> {
  const orchestrator = new MasterOrchestrator();
  return orchestrator.run(prompt);
}

export const AGENTIC_SCENARIOS = [
  'añade niebla, mejora la iluminación y reorganiza esta escena',
  'crea un NPC con patrulla simple y colisiones correctas',
  'corrige esta escena porque el pedido pedía ambiente oscuro y quedó demasiado iluminada',
] as const;
