/**
 * Loads a TypeScript module from this repo in plain Node (no bundler) by
 * transpiling it — and every relative / `@/` import it reaches — into `data:`
 * URLs. Bare specifiers (`@libsql/client`, `node:fs`, …) are rewritten to
 * absolute file URLs so the data-URL modules can import them.
 *
 * Used by the CLI/migration scripts and tests so they exercise the exact same
 * code the Next.js app runs instead of re-implementing it in JavaScript.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const scriptsLibDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptsLibDir, "..", "..");

const BUILTIN_MODULE_NAMES = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

const SPECIFIER_PATTERN =
  /((?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?|import\s*\(\s*)(["'])([^"']+)\2/g;

function isBuiltinSpecifier(specifier) {
  return BUILTIN_MODULE_NAMES.has(specifier);
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function isAliasSpecifier(specifier) {
  return specifier.startsWith("@/");
}

function resolveWithExtensions(basePath) {
  if (RESOLVABLE_EXTENSIONS.some((extension) => basePath.endsWith(extension)) && existsSync(basePath)) {
    return basePath;
  }

  for (const extension of RESOLVABLE_EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  for (const extension of RESOLVABLE_EXTENSIONS) {
    const candidate = path.join(basePath, `index${extension}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve module file for ${basePath}`);
}

function resolveLocalSpecifier(specifier, importerAbsolutePath) {
  const basePath = isAliasSpecifier(specifier)
    ? path.join(repoRoot, "src", specifier.slice(2))
    : path.resolve(path.dirname(importerAbsolutePath), specifier);
  return resolveWithExtensions(basePath);
}

function transpileSource(source, absolutePath) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: absolutePath,
  }).outputText;
}

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

/**
 * @typedef {object} LoadOptions
 * @property {Record<string, string>} [replacements] Specifier → module URL overrides
 *   (relative, alias, or bare specifiers). Lets tests stub a dependency.
 * @property {Map<string, Promise<string>>} [cache] Memo of file → data URL. Defaults
 *   to a process-wide cache so repeated loads share module instances (and thus
 *   database connections); a fresh cache is used whenever `replacements` are
 *   given so stubbed graphs never leak into the shared one.
 */

const sharedModuleCache = new Map();

function resolveModuleCache(options) {
  if (options.cache) {
    return options.cache;
  }

  return options.replacements && Object.keys(options.replacements).length > 0
    ? new Map()
    : sharedModuleCache;
}

/**
 * Transpiles `relativeOrAbsolutePath` (relative to the repo root unless
 * absolute) and returns a `data:` URL for it with all imports resolved.
 * @param {string} relativeOrAbsolutePath
 * @param {LoadOptions} [options]
 * @returns {Promise<string>}
 */
export async function transpileTypeScriptModuleToUrl(relativeOrAbsolutePath, options = {}) {
  const cache = resolveModuleCache(options);
  const replacements = options.replacements ?? {};
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);

  const cached = cache.get(absolutePath);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const source = await readFile(absolutePath, "utf8");
    const compiled = transpileSource(source, absolutePath);

    const rewrites = new Map();
    for (const match of compiled.matchAll(SPECIFIER_PATTERN)) {
      const specifier = match[3];
      if (rewrites.has(specifier) || isBuiltinSpecifier(specifier)) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(replacements, specifier)) {
        rewrites.set(specifier, replacements[specifier]);
        continue;
      }

      if (isRelativeSpecifier(specifier) || isAliasSpecifier(specifier)) {
        const dependencyPath = resolveLocalSpecifier(specifier, absolutePath);
        rewrites.set(
          specifier,
          await transpileTypeScriptModuleToUrl(dependencyPath, { replacements, cache }),
        );
        continue;
      }

      // Bare package specifier: resolve from the repo's node_modules.
      // (import.meta.resolve resolves relative to this file, which lives inside
      // the repo, so the repo's node_modules is what gets searched.)
      rewrites.set(specifier, import.meta.resolve(specifier));
    }

    const rewritten = compiled.replace(SPECIFIER_PATTERN, (full, prefix, quote, specifier) => {
      const replacement = rewrites.get(specifier);
      return replacement ? `${prefix}${quote}${replacement}${quote}` : full;
    });

    return toDataUrl(rewritten);
  })();

  cache.set(absolutePath, pending);
  return pending;
}

/**
 * Imports a TypeScript module from the repo.
 * @param {string} relativeOrAbsolutePath
 * @param {LoadOptions} [options]
 */
export async function loadTypeScriptModule(relativeOrAbsolutePath, options = {}) {
  const url = await transpileTypeScriptModuleToUrl(relativeOrAbsolutePath, options);
  return import(url);
}

/**
 * Loads `.env.local` then `.env` from the repo root into `process.env` without
 * overriding variables that are already set (mirrors Next.js precedence).
 */
export function loadRepoEnvFiles() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(repoRoot, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      process.loadEnvFile(filePath);
    } catch (error) {
      console.warn(`[env] failed to load ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
