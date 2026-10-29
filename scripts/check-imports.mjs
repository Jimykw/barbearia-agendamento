import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, "src");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts"]);
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".css"];
const importPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g;

function walk(dir, collected = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, collected);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      collected.push(fullPath);
    }
  }
  return collected;
}

function resolveImport(importerFile, specifier) {
  let basePath = null;
  if (specifier.startsWith("@/")) {
    basePath = path.join(srcRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = path.resolve(path.dirname(importerFile), specifier);
  } else {
    return true;
  }

  const candidates = [];
  candidates.push(basePath);
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(basePath + ext);
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(path.join(basePath, `index${ext}`));
  }

  return candidates.some((candidate) => fs.existsSync(candidate));
}

if (!fs.existsSync(srcRoot)) {
  console.error("Diretorio src nao encontrado.");
  process.exit(1);
}

const files = walk(srcRoot);
const unresolved = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier || specifier.startsWith("figma:")) {
      continue;
    }
    if (!resolveImport(file, specifier)) {
      unresolved.push({
        file: path.relative(projectRoot, file).replaceAll("\\", "/"),
        specifier,
      });
    }
  }
}

if (unresolved.length > 0) {
  console.error("Imports invalidos encontrados:");
  for (const issue of unresolved) {
    console.error(`- ${issue.file} -> ${issue.specifier}`);
  }
  process.exit(1);
}

console.log(`OK: ${files.length} arquivos verificados, nenhum import quebrado.`);
