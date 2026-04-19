import { describe, expect, it } from 'vitest';
import { resolveAICommandIntent } from '@/engine/editor/ai/intentRouter';

describe('intent router', () => {
  it('routes scene requests with a character as direct scene actions', () => {
    const intent = resolveAICommandIntent(
      'crea una escena con un personaje caminando, texturizado, con rig y animacion walk'
    );

    expect(intent.wantsCharacter).toBe(true);
    expect(intent.wants3D).toBe(true);
    expect(intent.wantsDirectSceneAction).toBe(true);
  });

  it('keeps standalone rigged character asset requests out of direct scene actions', () => {
    const intent = resolveAICommandIntent('genera un personaje rigged en glb para descargar');

    expect(intent.wantsCharacter).toBe(true);
    expect(intent.wants3D).toBe(true);
    expect(intent.wantsDirectSceneAction).toBe(false);
  });
});
