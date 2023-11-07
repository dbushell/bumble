import {path} from './deps.ts';
import {compileSvelte} from './svelte.ts';
import {transpileTs} from './typescript.ts';
import {shrinkCode, splitLines, parseImport, parseExport} from './parse.ts';
import type {CompileProps, BumbleBundle, BumbleOptions} from './types.ts';

/** Return unique path for imported file */
const getPath = (entry: string) => {
  return path.relative(Deno.cwd(), entry);
};

/** Return the imported file or component name */
const getName = (entry: string) => {
  const ext = path.extname(entry);
  let name = path.basename(entry, ext);
  if (ext === '.svelte') {
    name = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  return name;
};

/** Recursively compile and bundle files */
const compile = async (props: CompileProps, depth = 0): Promise<string> => {
  const {dir, entry} = props;

  const importPath = getPath(entry);
  const ext = path.extname(entry);

  let code = await Deno.readTextFile(entry);

  /*
  // Check compiled cache
  const {kvPath: cachePath, deployId: cacheId} = props.options ?? {};
  if (cacheId) {
    const db = await Deno.openKv(cachePath);
    const cached = await db.get<string>(['cache', cacheId, importPath]);
    db.close();
    if (cached.value) {
      return cached.value;
    }
  }
  */

  // Check if already compiled
  if (props.imports.has(importPath)) {
    throw new Error(`Already compiled (${entry})`);
  }
  props.imports.add(importPath);

  // Handle Svelte components
  if (ext === '.svelte') {
    code = await compileSvelte(getName(entry), code, props.options);
  }
  // Handle TypeScript
  else if (ext === '.ts') {
    code = transpileTs(code, props.options?.typescript);
  }
  // Handle JSON
  else if (ext === '.json') {
    return `const json = ${code};\nexport default json;`;
  }
  // Unknown extension
  else if (ext !== '.js') {
    throw new Error(`Unknown extension (${entry})`);
  }

  // Cleanup code to make line parsing easier
  code = shrinkCode(code);

  const codeLines = [];
  if (depth === 0) {
    codeLines.push(`globalThis['🥡'] = new Map();`);
  }

  // Iterate over code lines to handle imports
  for (const line of code.split('\n')) {
    if (!line.trim()) continue;
    // Ignore non import statements
    let [names, from] = parseImport(line);
    if (names.length !== 1) {
      codeLines.push(line);
      continue;
    }
    // Resolve relative imports from root directory
    if (from.startsWith('@')) {
      from = path.resolve(dir, from.slice(1));
    }
    // Skip non-path or unknown imports
    if (
      (/^(\.|\/)/.test(from) && /\.(svelte|ts|js|json)$/.test(entry)) === false
    ) {
      codeLines.push(line);
      continue;
    }
    const newEntry = path.resolve(path.dirname(entry), from);
    const newPath = getPath(newEntry);
    // Check if import was already compiled
    if (props.imports.has(newPath)) {
      codeLines.push(`const ${names[0]} = globalThis['🥡'].get('${newPath}');`);
      continue;
    }
    // Otherwise, compile and bundle
    const newCode = await compile({...props, entry: newEntry}, depth + 1);
    const [exported, subLines] = splitLines(newCode, /^\s*export\s+(.+?);\s*$/);
    for (const line of exported) {
      const name = parseExport(line);
      if (typeof name === 'string') {
        subLines.push(`globalThis['🥡'].set('${newPath}', ${name});`);
      } else {
        subLines.push(line);
      }
    }
    // TODO: check for default export?
    codeLines.push(`/* ${newPath} */`, '{', subLines.join('\n'), '}');
    codeLines.push(`const ${names[0]} = globalThis['🥡'].get('${newPath}');`);
  }
  // Return compiled code and cache if enabled
  code = codeLines.join('\n');

  /*
  if (cacheId) {
    const db = await Deno.openKv(cachePath);
    await db.set(['cache', cacheId, importPath], code);
    db.close();
  }
  */
  return code;
};

export const bundle = async (
  dir: string,
  entry: string,
  options?: BumbleOptions
): Promise<BumbleBundle> => {
  // Start new bundle
  const props: CompileProps = {
    imports: new Set(),
    dir,
    entry,
    options
  };
  // Compile from main entry
  let code = await compile(props);
  const [imported, codeLines] = splitLines(code, /^\s*import\s+(.+?);\s*$/);
  code = codeLines.join('\n');
  // Merge external Svelte imports
  const external = new Map<string, string[]>();
  for (const line of imported) {
    const [names, from] = parseImport(line);
    if (!from.startsWith('svelte')) {
      throw new Error(`Unknown import (${entry}) (${line})`);
    }
    external.set(from, [...new Set([...(external.get(from) || []), ...names])]);
  }
  return {code, external};
};
