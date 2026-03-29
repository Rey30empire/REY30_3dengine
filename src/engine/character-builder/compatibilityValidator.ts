import type {
  CharacterCompatibilityIssue,
  CharacterCompatibilityResult,
  CharacterPartCategory,
  CharacterPartMetadata,
} from './types';
import { getDefaultSocketForCategory } from './types';

function result(
  ok: boolean,
  targetCategory: CharacterPartCategory,
  resolvedSocket: string,
  issues: CharacterCompatibilityIssue[]
): CharacterCompatibilityResult {
  return {
    ok,
    targetCategory,
    resolvedSocket,
    issues,
  };
}

export class CompatibilityValidator {
  validate(params: {
    part: CharacterPartMetadata | null;
    targetCategory?: CharacterPartCategory | null;
    baseBody: CharacterPartMetadata | null;
  }): CharacterCompatibilityResult {
    const part = params.part;
    const targetCategory = params.targetCategory ?? part?.category ?? 'body';
    const resolvedSocket = getDefaultSocketForCategory(targetCategory);
    const issues: CharacterCompatibilityIssue[] = [];

    if (!part) {
      issues.push({
        code: 'missing_part',
        message: 'La pieza seleccionada no existe en la biblioteca.',
      });
      return result(false, targetCategory, resolvedSocket, issues);
    }

    if (!part.enabled) {
      issues.push({
        code: 'disabled_part',
        message: `${part.name} esta deshabilitada en metadata.`,
      });
    }

    if (part.category !== targetCategory) {
      issues.push({
        code: 'category_mismatch',
        message: `${part.name} pertenece a ${part.category} y no encaja en ${targetCategory}.`,
      });
    }

    if (part.attachmentSocket !== resolvedSocket) {
      issues.push({
        code: 'socket_mismatch',
        message: `${part.name} usa ${part.attachmentSocket} y el slot pide ${resolvedSocket}.`,
      });
    }

    if (part.category !== 'body') {
      const baseBody = params.baseBody;
      if (!baseBody) {
        issues.push({
          code: 'missing_base_body',
          message: 'Carga primero un cuerpo base antes de equipar piezas modulares.',
        });
      } else {
        if (baseBody.skeletonId !== part.skeletonId) {
          issues.push({
            code: 'skeleton_mismatch',
            message: `${part.name} usa skeleton ${part.skeletonId} y el cuerpo base usa ${baseBody.skeletonId}.`,
          });
        }

        if (
          baseBody.bodyType !== part.bodyType &&
          baseBody.bodyType !== 'any' &&
          part.bodyType !== 'any'
        ) {
          issues.push({
            code: 'body_type_mismatch',
            message: `${part.name} es ${part.bodyType} y el cuerpo base es ${baseBody.bodyType}.`,
          });
        }
      }
    }

    return result(issues.length === 0, targetCategory, resolvedSocket, issues);
  }
}
