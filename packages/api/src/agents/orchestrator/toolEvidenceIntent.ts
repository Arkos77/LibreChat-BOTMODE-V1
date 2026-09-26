import type { OracleValue } from '../oracle';

export interface ToolEvidenceIntentDeclaration {
  toolName: string;
  criterionId: string;
  expectedValue: OracleValue;
}

export interface ToolEvidenceIntentInput {
  toolName: string;
  declarations: readonly ToolEvidenceIntentDeclaration[];
}

export interface ToolEvidenceIntentResolution {
  criterionId: string;
  value: OracleValue;
  declaredByHost: true;
}

function requiredText(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ToolEvidenceIntent ${name} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Resolves only explicit host-owned declarations. It never interprets tool output,
 * tool arguments, artifacts, model text, confidence, or producer instructions.
 */
export function resolveToolEvidenceIntent(
  input: ToolEvidenceIntentInput,
): ToolEvidenceIntentResolution | undefined {
  const toolName = requiredText('toolName', input.toolName);
  const matches = input.declarations.filter(
    (declaration) => requiredText('declaration.toolName', declaration.toolName) === toolName,
  );

  if (matches.length === 0) {
    return undefined;
  }
  if (matches.length !== 1) {
    throw new Error('ToolEvidenceIntent declaration must be unambiguous');
  }

  const declaration = matches[0];
  return {
    criterionId: requiredText('criterionId', declaration.criterionId),
    value: declaration.expectedValue,
    declaredByHost: true,
  };
}
