import * as ts from 'typescript';
import { SANDBOX_GUARD_FUNCTION_NAME } from '@/engine/gameplay/script-guard';

const BLOCKED_GLOBAL_IDENTIFIERS = new Set([
  'window',
  'document',
  'globalThis',
  'self',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'process',
  'require',
  'Function',
  'eval',
  SANDBOX_GUARD_FUNCTION_NAME,
]);

const BLOCKED_REQUIRE_MODULES = new Set([
  'fs',
  'child_process',
  'net',
  'tls',
  'http',
  'https',
  'worker_threads',
]);

const BLOCKED_MEMBER_NAMES = new Set([
  'constructor',
  '__proto__',
  'prototype',
]);

const RESERVED_SANDBOX_IDENTIFIERS = new Set([
  SANDBOX_GUARD_FUNCTION_NAME,
]);

function formatLocation(source: ts.SourceFile, node: ts.Node): string {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${line + 1}:${character + 1}`;
}

function collectBindingNames(binding: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(binding)) {
    out.add(binding.text);
    return;
  }

  for (const element of binding.elements) {
    if (ts.isOmittedExpression(element)) {
      continue;
    }
    collectBindingNames(element.name, out);
  }
}

function isTypePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;

  return (
    ts.isTypeReferenceNode(parent) ||
    ts.isExpressionWithTypeArguments(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isHeritageClause(parent) ||
    ts.isTypeParameterDeclaration(parent) ||
    ts.isImportTypeNode(parent) ||
    ts.isLiteralTypeNode(parent)
  );
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;

  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return true;
  if (ts.isFunctionExpression(parent) && parent.name === node) return true;
  if (ts.isClassDeclaration(parent) && parent.name === node) return true;
  if (ts.isClassExpression(parent) && parent.name === node) return true;
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) return true;
  if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return true;
  if (ts.isEnumDeclaration(parent) && parent.name === node) return true;
  if (ts.isImportClause(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && parent.name === node) return true;
  if (ts.isNamespaceImport(parent) && parent.name === node) return true;
  if (ts.isPropertySignature(parent) && parent.name === node) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if (ts.isGetAccessorDeclaration(parent) && parent.name === node) return true;
  if (ts.isSetAccessorDeclaration(parent) && parent.name === node) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isPropertyAccessChain(parent) && parent.name === node) return true;

  return false;
}

function asStaticElementName(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function isNumericElementAccess(node: ts.Expression | undefined): boolean {
  if (!node) return false;
  if (ts.isNumericLiteral(node)) return true;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return true;
  }
  return false;
}

function assertSafeMemberAccess(
  source: ts.SourceFile,
  node:
    | ts.PropertyAccessExpression
    | ts.PropertyAccessChain
    | ts.ElementAccessExpression
    | ts.ElementAccessChain
): void {
  if (ts.isPropertyAccessExpression(node) || ts.isPropertyAccessChain(node)) {
    if (BLOCKED_MEMBER_NAMES.has(node.name.text)) {
      throw new Error(
        `[Sandbox:${source.fileName}] dangerous member access "${node.name.text}" blocked at ${formatLocation(source, node)}`
      );
    }
    return;
  }

  const argName = node.argumentExpression ? asStaticElementName(node.argumentExpression) : null;
  if (!argName) {
    if (isNumericElementAccess(node.argumentExpression)) return;
    throw new Error(
      `[Sandbox:${source.fileName}] dynamic element access is blocked in sandbox at ${formatLocation(source, node)}`
    );
  }

  if (BLOCKED_MEMBER_NAMES.has(argName) || BLOCKED_GLOBAL_IDENTIFIERS.has(argName)) {
    throw new Error(
      `[Sandbox:${source.fileName}] dangerous member access "[${argName}]" blocked at ${formatLocation(source, node)}`
    );
  }
}

function isMemberAccessNode(
  node: ts.Node
): node is ts.PropertyAccessExpression | ts.PropertyAccessChain | ts.ElementAccessExpression | ts.ElementAccessChain {
  return (
    ts.isPropertyAccessExpression(node) ||
    ts.isPropertyAccessChain(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isElementAccessChain(node)
  );
}

export function assertSafeScriptContent(scriptId: string, content: string): void {
  const source = ts.createSourceFile(
    scriptId,
    content,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TS
  );

  const scopes: Set<string>[] = [];
  const pushScope = () => scopes.push(new Set<string>());
  const popScope = () => {
    scopes.pop();
  };
  const currentScope = () => {
    if (scopes.length === 0) pushScope();
    return scopes[scopes.length - 1];
  };
  const declareIdentifier = (name: string) => {
    currentScope().add(name);
  };
  const isDeclared = (name: string) => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) {
      if (scopes[i].has(name)) return true;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      throw new Error(
        `[Sandbox:${scriptId}] import statements are blocked in runtime scripts at ${formatLocation(source, node)}`
      );
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      throw new Error(
        `[Sandbox:${scriptId}] re-export from module is blocked in runtime scripts at ${formatLocation(source, node)}`
      );
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      declareIdentifier(node.name.text);
    }
    if (ts.isClassDeclaration(node) && node.name) {
      declareIdentifier(node.name.text);
    }
    if (ts.isVariableDeclaration(node)) {
      collectBindingNames(node.name, currentScope());
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      collectBindingNames(node.variableDeclaration.name, currentScope());
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expr = node.expression;
      if (ts.isCallExpression(node) && expr.kind === ts.SyntaxKind.ImportKeyword) {
        throw new Error(
          `[Sandbox:${scriptId}] dynamic import() is blocked in runtime scripts at ${formatLocation(source, node)}`
        );
      }

      if (ts.isIdentifier(expr) && !isDeclared(expr.text)) {
        if (expr.text === 'eval' || expr.text === 'Function') {
          throw new Error(
            `[Sandbox:${scriptId}] dynamic code execution blocked in sandbox at ${formatLocation(source, node)}`
          );
        }

        if (expr.text === 'require') {
          const firstArg = ts.isCallExpression(node) ? node.arguments[0] : undefined;
          const moduleName =
            firstArg && (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg))
              ? firstArg.text
              : '';
          if (BLOCKED_REQUIRE_MODULES.has(moduleName)) {
            throw new Error(
              `[Sandbox:${scriptId}] dangerous module access blocked in sandbox at ${formatLocation(source, node)}`
            );
          }
          throw new Error(
            `[Sandbox:${scriptId}] require() is blocked in runtime scripts at ${formatLocation(source, node)}`
          );
        }
      }

      if (isMemberAccessNode(expr)) {
        assertSafeMemberAccess(source, expr);
      }
    }

    if (isMemberAccessNode(node)) {
      assertSafeMemberAccess(source, node);
    }

    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      throw new Error(
        `[Sandbox:${scriptId}] import.meta is blocked in runtime scripts at ${formatLocation(source, node)}`
      );
    }

    if (ts.isIdentifier(node)) {
      if (RESERVED_SANDBOX_IDENTIFIERS.has(node.text) && isDeclarationName(node)) {
        throw new Error(
          `[Sandbox:${scriptId}] identifier "${node.text}" is reserved for sandbox runtime at ${formatLocation(source, node)}`
        );
      }

      if (
        BLOCKED_GLOBAL_IDENTIFIERS.has(node.text) &&
        !isDeclared(node.text) &&
        !isDeclarationName(node) &&
        !isTypePosition(node)
      ) {
        throw new Error(
          `[Sandbox:${scriptId}] identifier "${node.text}" is blocked in sandbox at ${formatLocation(source, node)}`
        );
      }
    }

    const createsScope =
      ts.isSourceFile(node) ||
      ts.isBlock(node) ||
      ts.isCaseBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isFunctionLike(node);

    if (createsScope) {
      pushScope();
      if (ts.isFunctionLike(node)) {
        for (const param of node.parameters) {
          collectBindingNames(param.name, currentScope());
        }
        if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
          declareIdentifier(node.name.text);
        }
      }
      ts.forEachChild(node, visit);
      popScope();
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}
