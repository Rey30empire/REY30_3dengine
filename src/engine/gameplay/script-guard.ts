import * as ts from 'typescript';

export const SANDBOX_GUARD_FUNCTION_NAME = '__rey30SandboxGuard__';

function createGuardCallStatement(): ts.Statement {
  return ts.factory.createExpressionStatement(
    ts.factory.createCallExpression(
      ts.factory.createIdentifier(SANDBOX_GUARD_FUNCTION_NAME),
      undefined,
      []
    )
  );
}

function isGuardCallStatement(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement)) return false;
  const expression = statement.expression;
  if (!ts.isCallExpression(expression)) return false;
  if (!ts.isIdentifier(expression.expression)) return false;
  return expression.expression.text === SANDBOX_GUARD_FUNCTION_NAME;
}

function wrapLoopBodyWithGuard(statement: ts.Statement): ts.Statement {
  if (ts.isBlock(statement)) {
    if (statement.statements.length > 0 && isGuardCallStatement(statement.statements[0])) {
      return statement;
    }
    return ts.factory.updateBlock(statement, [createGuardCallStatement(), ...statement.statements]);
  }

  return ts.factory.createBlock([createGuardCallStatement(), statement], true);
}

export function instrumentSandboxRuntimeGuards(scriptId: string, sourceText: string): string {
  const sourceFile = ts.createSourceFile(
    scriptId,
    sourceText,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.JS
  );

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isForStatement(node)) {
        const statement = ts.visitNode(node.statement, visit) as ts.Statement;
        return ts.factory.updateForStatement(
          node,
          node.initializer,
          node.condition,
          node.incrementor,
          wrapLoopBodyWithGuard(statement)
        );
      }

      if (ts.isForInStatement(node)) {
        const statement = ts.visitNode(node.statement, visit) as ts.Statement;
        return ts.factory.updateForInStatement(
          node,
          node.initializer,
          node.expression,
          wrapLoopBodyWithGuard(statement)
        );
      }

      if (ts.isForOfStatement(node)) {
        const statement = ts.visitNode(node.statement, visit) as ts.Statement;
        return ts.factory.updateForOfStatement(
          node,
          node.awaitModifier,
          node.initializer,
          node.expression,
          wrapLoopBodyWithGuard(statement)
        );
      }

      if (ts.isWhileStatement(node)) {
        const statement = ts.visitNode(node.statement, visit) as ts.Statement;
        return ts.factory.updateWhileStatement(
          node,
          node.expression,
          wrapLoopBodyWithGuard(statement)
        );
      }

      if (ts.isDoStatement(node)) {
        const statement = ts.visitNode(node.statement, visit) as ts.Statement;
        return ts.factory.updateDoStatement(
          node,
          wrapLoopBodyWithGuard(statement),
          node.expression
        );
      }

      return ts.visitEachChild(node, visit, context);
    };

    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };

  const transformed = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const output = printer.printFile(transformed.transformed[0]);
  transformed.dispose();
  return output;
}
