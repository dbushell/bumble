import {path} from './deps.ts';
import {compileSvelte} from './svelte.ts';
import {transpileTs} from './typescript.ts';
import {parseImports, parseExports} from './parse.ts';
import type {CompileProps, BumbleBundle, BumbleOptions} from './types.ts';

// Return the imported file or component name
const getName = (entry: string) => {
  const ext = path.extname(entry);
  let name = path.basename(entry, ext);
  if (ext === '.svelte') {
    name = name
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  }
  return name;
};

// Supported file types for relative imports
const supportedExtensions = ['.svelte', '.ts', '.js', '.json'];
const supportedType = (entry: string) => {
  const ext = path.extname(entry);
  return supportedExtensions.includes(ext);
};

// Recursively compile and bundle files
const compile = async (props: CompileProps, depth = 0): Promise<string> => {
  const {dir, entry} = props;

  if (!supportedType(entry)) {
    throw new Error(`Unsupported file type (${entry})`);
  }

  const start = performance.now();

  const rel = path.relative(dir, entry);
  const ext = path.extname(entry);

  // Check if already compiled
  if (props.imports.has(rel)) {
    throw new Error(`Already compiled (${entry})`);
  }
  props.imports.add(rel);

  let code = await Deno.readTextFile(entry);

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

  const parsed = parseImports(code);
  code = parsed.code;

  let subCode = '';

  for (let [from, names] of parsed.map) {
    if (from.startsWith('@')) {
      from = path.resolve(dir, from.slice(1));
    }
    if ((/^(\.|\/)/.test(from) && supportedType(entry)) === false) {
      props.external.push({from, names});
      continue;
    }
    const newEntry = path.resolve(path.dirname(entry), from);
    const newRel = path.relative(dir, newEntry);
    if (props.imports.has(newRel)) {
      for (const name of names) {
        const line = `const ${name.local} = globalThis['🥡'].get('${newRel}').${name.alias};`;
        code = `${line}\n${code}`;
      }
      continue;
    }
    let newCode = await compile({...props, entry: newEntry}, depth + 1);
    const parsed = parseExports(newCode);
    newCode = parsed.code;
    for (const [alias, name] of parsed.map) {
      newCode += `\n{ let M = globalThis['🥡']; let K = '${newRel}'; M.set(K, {...M.get(K) ?? {}, ${alias}: ${name}}); }\n`;
    }
    subCode += `/* ${newRel} */\n{\n${newCode}\n}\n`;
    code = `const ${names[0].local} = globalThis['🥡'].get('${newRel}').${names[0].alias};\n${code}\n`;
  }

  code = `${subCode}\n${code}`;

  if (depth === 0) {
    code = `globalThis['🥡'] = new Map();\n${code}\n`;
  }

  if (props.options?.dev) {
    const time = (performance.now() - start).toFixed(2);
    console.log(`🥢 ${time}ms (${rel})`);
  }

  return code;
};

export const bundle = async (
  dir: string,
  entry: string,
  options: BumbleOptions
): Promise<BumbleBundle> => {
  const start = performance.now();
  // Start new bundle
  const props: CompileProps = {
    dir,
    entry,
    options,
    imports: new Set(),
    external: []
  };
  // Compile from main entry
  const code = await compile(props);
  // Reduce external imports to remove duplicates
  const external = new Map<string, string[]>();
  for (const {from, names} of props.external!) {
    if (!from.startsWith('svelte')) {
      throw new Error(`Unknown import (${entry}) (${from})`);
    }
    external.set(from, [
      ...new Set([...(external.get(from) || []), ...names.map((n) => n.alias)])
    ]);
  }
  if (options?.dev) {
    const time = (performance.now() - start).toFixed(2);
    console.log(`🥡 ${time}ms (${path.relative(dir, entry)})`);
  }
  return {code, external};
};
