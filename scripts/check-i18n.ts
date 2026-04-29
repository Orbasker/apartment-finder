#!/usr/bin/env bun
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("..", import.meta.url).pathname;
const WEB_DIR = join(ROOT, "apps/web");
const SCAN_DIRS = [join(WEB_DIR, "app"), join(WEB_DIR, "src")];
const MESSAGES_DIR = join(WEB_DIR, "messages");
const SOURCE_LOCALE = "he";
const CATALOG_PATH = join(MESSAGES_DIR, `${SOURCE_LOCALE}.json`);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "out"]);
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".d.ts"];
const SELF_PATH = join(WEB_DIR, "src/i18n/request.ts");

const TRANSLATION_HOOKS = new Set(["useTranslations", "getTranslations"]);
const T_METHODS = new Set(["rich", "has", "raw", "markup"]);

function walkFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else if (
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !SKIP_SUFFIXES.some((s) => full.endsWith(s)) &&
      full !== SELF_PATH
    ) {
      out.push(full);
    }
  }
  return out;
}

function flatten(obj: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

type Issue = { file: string; line: number; message: string };

function scan(file: string, used: Set<string>, dynamicCalls: Issue[]): void {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  type Scope = Map<string, string>;
  const stack: Scope[] = [new Map()];

  function lookup(name: string): string | undefined {
    for (let i = stack.length - 1; i >= 0; i--) {
      const v = stack[i].get(name);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  function loc(node: ts.Node) {
    return sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }

  function captureBinding(node: ts.VariableDeclaration) {
    if (!node.initializer || !ts.isIdentifier(node.name)) return;
    let init: ts.Expression = node.initializer;
    if (ts.isAwaitExpression(init)) init = init.expression;
    if (!ts.isCallExpression(init)) return;
    const callee = init.expression;
    if (!ts.isIdentifier(callee) || !TRANSLATION_HOOKS.has(callee.text)) return;
    const arg = init.arguments[0];
    const ns = arg && ts.isStringLiteral(arg) ? arg.text : "";
    stack[stack.length - 1].set(node.name.text, ns);
  }

  function captureCall(node: ts.CallExpression) {
    let callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      if (T_METHODS.has(callee.name.text)) callee = callee.expression;
      else return;
    }
    if (!ts.isIdentifier(callee)) return;
    const ns = lookup(callee.text);
    if (ns === undefined) return;
    const arg0 = node.arguments[0];
    if (!arg0) return;
    if (!ts.isStringLiteral(arg0) && !ts.isNoSubstitutionTemplateLiteral(arg0)) {
      dynamicCalls.push({
        file,
        line: loc(node),
        message: `dynamic key in ${callee.text}() - keys must be string literals`,
      });
      return;
    }
    const key = ns ? `${ns}.${arg0.text}` : arg0.text;
    used.add(key);
  }

  function visit(node: ts.Node) {
    const opensScope =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isBlock(node) ||
      ts.isSourceFile(node);
    if (opensScope && !ts.isSourceFile(node)) stack.push(new Map());
    if (ts.isVariableDeclaration(node)) captureBinding(node);
    if (ts.isCallExpression(node)) captureCall(node);
    ts.forEachChild(node, visit);
    if (opensScope && !ts.isSourceFile(node)) stack.pop();
  }

  visit(sf);
}

const used = new Set<string>();
const dynamicCalls: Issue[] = [];
const files = SCAN_DIRS.flatMap((d) => walkFiles(d));
for (const file of files) scan(file, used, dynamicCalls);

const catalogRaw = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const defined = flatten(catalogRaw);

const missing = [...used].filter((k) => !defined.has(k)).sort();
const unused = [...defined].filter((k) => !used.has(k)).sort();

let exitCode = 0;

if (missing.length) {
  console.error(`\n❌ ${missing.length} key(s) used in code but missing from messages/he.json:`);
  for (const k of missing) console.error(`   - ${k}`);
  exitCode = 1;
}

if (unused.length) {
  console.error(`\n❌ ${unused.length} key(s) in messages/he.json but unused in code:`);
  for (const k of unused) console.error(`   - ${k}`);
  exitCode = 1;
}

if (dynamicCalls.length) {
  console.error(
    `\n❌ ${dynamicCalls.length} dynamic translation key call(s) - keys must be literal:`,
  );
  for (const c of dynamicCalls) {
    console.error(`   - ${relative(ROOT, c.file)}:${c.line}: ${c.message}`);
  }
  exitCode = 1;
}

// Locale parity: every other messages/<locale>.json must define the same keys
// as the source-of-truth catalog. Missing or extra keys in any locale fail CI.
const otherLocaleFiles = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json") && f !== `${SOURCE_LOCALE}.json`)
  .map((f) => ({ name: f.replace(/\.json$/, ""), path: join(MESSAGES_DIR, f) }));

for (const { name, path: filePath } of otherLocaleFiles) {
  const localeDefined = flatten(JSON.parse(readFileSync(filePath, "utf8")));
  const missingHere = [...defined].filter((k) => !localeDefined.has(k)).sort();
  const extraHere = [...localeDefined].filter((k) => !defined.has(k)).sort();
  if (missingHere.length) {
    console.error(
      `\n❌ ${missingHere.length} key(s) defined in ${SOURCE_LOCALE}.json but missing from ${name}.json:`,
    );
    for (const k of missingHere) console.error(`   - ${k}`);
    exitCode = 1;
  }
  if (extraHere.length) {
    console.error(
      `\n❌ ${extraHere.length} key(s) defined in ${name}.json but missing from ${SOURCE_LOCALE}.json:`,
    );
    for (const k of extraHere) console.error(`   - ${k}`);
    exitCode = 1;
  }
}

if (exitCode === 0) {
  const localeNames = [SOURCE_LOCALE, ...otherLocaleFiles.map((l) => l.name)].join(", ");
  console.log(
    `✓ i18n keys in sync (${used.size} key(s) used, ${defined.size} defined; locales: ${localeNames}).`,
  );
} else {
  console.error(
    "\nFix: add missing keys to apps/web/messages/<locale>.json, remove unused or extra keys, or replace dynamic t() calls with literals.",
  );
}

process.exit(exitCode);
