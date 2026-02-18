import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const contractsPath = path.join(repoRoot, "src/features/contracts.ts");

let cachedSourceFile = null;

async function loadContractsSource() {
  if (cachedSourceFile) {
    return cachedSourceFile;
  }

  const sourceText = await readFile(contractsPath, "utf8");
  cachedSourceFile = ts.createSourceFile(
    contractsPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return cachedSourceFile;
}

function findInterface(sourceFile, interfaceName) {
  const match = sourceFile.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  );
  assert.ok(match, `Expected interface ${interfaceName} to be declared`);
  return match;
}

function findTypeAlias(sourceFile, aliasName) {
  const match = sourceFile.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === aliasName,
  );
  assert.ok(match, `Expected type alias ${aliasName} to be declared`);
  return match;
}

function interfacePropertyNames(interfaceDeclaration) {
  const names = [];

  for (const member of interfaceDeclaration.members) {
    if (!ts.isPropertySignature(member) || !member.name) {
      continue;
    }

    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
      names.push(member.name.text);
    }
  }

  return names;
}

function unwrapExpression(expression) {
  let currentExpression = expression;

  while (
    ts.isAsExpression(currentExpression) ||
    ts.isSatisfiesExpression(currentExpression) ||
    ts.isParenthesizedExpression(currentExpression)
  ) {
    currentExpression = currentExpression.expression;
  }

  return currentExpression;
}

function findConstArrayLiteralValues(sourceFile, constantName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== constantName || !declaration.initializer) {
        continue;
      }

      const unwrappedInitializer = unwrapExpression(declaration.initializer);
      assert.ok(
        ts.isArrayLiteralExpression(unwrappedInitializer),
        `Expected ${constantName} to be initialized with an array literal`,
      );

      const literalValues = [];
      for (const element of unwrappedInitializer.elements) {
        if (!ts.isStringLiteral(element)) {
          continue;
        }
        literalValues.push(element.text);
      }

      return literalValues;
    }
  }

  assert.fail(`Could not find constant ${constantName}`);
}

test("long-division step contracts include required algorithm step kinds", async () => {
  const sourceFile = await loadContractsSource();
  const stepKindAlias = findTypeAlias(sourceFile, "LongDivisionStepKind");

  assert.ok(ts.isUnionTypeNode(stepKindAlias.type), "LongDivisionStepKind should be a string literal union");

  const unionValues = stepKindAlias.type.types
    .filter((typeNode) => ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal))
    .map((typeNode) => typeNode.literal.text);

  assert.deepEqual(unionValues, ["quotient-digit", "multiply-result", "subtraction-result", "bring-down"]);

  const orderedSteps = findConstArrayLiteralValues(sourceFile, "LONG_DIVISION_STEP_ORDER");
  assert.deepEqual(orderedSteps, ["quotient-digit", "multiply-result", "subtraction-result", "bring-down"]);
});

test("active input target contract includes workspace positioning fields", async () => {
  const sourceFile = await loadContractsSource();
  const targetContract = findInterface(sourceFile, "ActiveInputTarget");
  const propertyNames = interfacePropertyNames(targetContract);

  assert.deepEqual(propertyNames, ["id", "problemId", "stepId", "lane", "rowIndex", "columnIndex"]);
});

test("player progress contracts expose both session and lifetime progress", async () => {
  const sourceFile = await loadContractsSource();
  const progressContract = findInterface(sourceFile, "PlayerProgressState");
  const propertyNames = interfacePropertyNames(progressContract);

  assert.deepEqual(propertyNames, ["session", "lifetime"]);
  findInterface(sourceFile, "PlayerSessionProgress");
  findInterface(sourceFile, "PlayerLifetimeProgress");
});
