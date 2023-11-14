import {path} from './deps.ts';
import {compileSvelte} from './lib/svelte.ts';
import {transpileTs} from './lib/typescript.ts';
import Script from './script.ts';
import type {
  BumbleOptions,
  BumbleManifest,
  BumbleBundle,
  CompileProps
} from './types.ts';

const codeCache = new Map<string, string>();

// Recursively compile and bundle files
const compile = async (props: CompileProps, depth = 0): Promise<Script> => {
  const {
    entry,
    manifest: {dir, dependencies}
  } = props;

  if (!Script.supportedType(entry)) {
    throw new Error(`Unsupported file type (${entry})`);
  }

  const start = performance.now();

  const rel = path.relative(dir, entry);
  const ext = path.extname(entry);

  if (!dependencies.has(entry)) {
    dependencies.set(entry, []);
  }

  // Check if already compiled
  if (props.compiled.has(rel)) {
    throw new Error(`Already compiled (${entry})`);
  }
  props.compiled.add(rel);

  let code: string;

  let cacheKey = entry;
  if (props.options.svelte?.generate) {
    cacheKey = `${cacheKey}-${props.options.svelte.generate}`;
  }
  if (codeCache.has(cacheKey)) {
    code = codeCache.get(cacheKey)!;
  } else {
    code = await Deno.readTextFile(entry);
    // Convert formats to JavaScript
    if (ext === '.svelte') {
      code = await compileSvelte(entry, code, props.options);
    } else if (ext === '.ts') {
      code = transpileTs(code, props.options?.typescript);
    } else if (ext === '.json') {
      code = `const json = ${code};\nexport default json;`;
    }
    codeCache.set(cacheKey, code);
  }
  // Return immediately (no imports or exports)
  if (ext === '.json') {
    return new Script(code, entry, dir);
  }

  const script = new Script(code, entry, dir);

  for (const [from, names] of script.externalImports) {
    props.external.push({from, names});
  }

  const prepend = [];

  for (const [newEntry, names] of script.localImports) {
    const newRel = path.relative(dir, newEntry);
    dependencies.get(entry)?.push(newEntry);
    if (props.compiled.has(newRel)) {
      for (const {local, alias} of names) {
        script.prepend(`const ${local} = $$$.get('${newRel}').${alias};`);
      }
      continue;
    }
    const newScript = await compile({...props, entry: newEntry}, depth + 1);
    for (const [alias, name] of newScript.exports) {
      newScript.append(
        `{ let K = '${newRel}'; $$$.set(K, {...$$$.get(K) ?? {}, ${alias}: ${name}}); }`
      );
    }
    prepend.push(`/* ${newRel} */\n{\n${newScript.getCode()}\n}\n`);
    script.prepend(
      `const ${names[0].local} = $$$.get('${newRel}').${names[0].alias};`
    );
  }

  script.prepend(prepend.join('\n'));
  if (depth === 0) {
    script.prepend(`const $$$ = new Map();`);
  }

  if (props.options?.dev) {
    const time = (performance.now() - start).toFixed(2);
    console.log(`🥢 ${time}ms (${rel})`);
  }

  return script;
};

export const bundleModule = async (
  dir: string,
  entry: string,
  options: BumbleOptions
): Promise<BumbleBundle> => {
  const start = performance.now();
  const manifest: BumbleManifest = {
    dir,
    entry,
    dependencies: new Map(),
    external: new Map()
  };
  // Start new bundle
  const props: CompileProps = {
    entry,
    options,
    manifest,
    external: [],
    compiled: new Set()
  };
  // Compile from main entry
  const script = await compile(props);
  // Reduce external imports to remove duplicates
  for (const {from, names} of props.external!) {
    if (!from.startsWith('svelte')) {
      throw new Error(`Unknown import (${entry}) (${from})`);
    }
    manifest.external.set(from, [
      ...new Set([
        ...(manifest.external.get(from) || []),
        ...names.map((n) => n.alias)
      ])
    ]);
  }
  if (options?.dev) {
    const time = (performance.now() - start).toFixed(2);
    console.log(`🥡 ${time}ms (${path.relative(dir, entry)})`);
  }
  return {script, manifest};
};
