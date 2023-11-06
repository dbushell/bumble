import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';
import {splitLines, parseExport} from './parse.ts';

/** Import bundle from a blob URL */
export const importDynamicBundle = async <M>(
  bundle: BumbleBundle
): Promise<BumbleModule<M>> => {
  let {code, external} = bundle;
  // Append import statements
  for (const [from, imports] of external.entries()) {
    const statement = `import { ${imports.join(', ')} } from "npm:${from}";`;
    code = `${statement}\n${code}`;
  }
  const blob = new Blob([code], {type: 'text/javascript'});
  const url = URL.createObjectURL(blob);
  const mod = await import(url);
  URL.revokeObjectURL(url);
  return mod;
};

/** Evaluate bundle in a function that returns the exports */
export const importFunctionBundle = async <M>(
  bundle: BumbleBundle
): Promise<BumbleModule<M>> => {
  let {code, external} = bundle;
  window['📦'] = {};
  // Needed for Deno Deploy limitations
  const map: Record<string, () => unknown> = {
    svelte: async () => await import('npm:svelte'),
    'svelte/store': async () => await import('npm:svelte/store'),
    'svelte/internal': async () => await import('npm:svelte/internal')
  };
  // Reference imports from global namespace
  for (const [from, imports] of external.entries()) {
    if (Object.hasOwn(map, from)) {
      window['📦'][from] = await map[from]();
      imports.forEach((name) => {
        code = `const {${name}} = window['📦']['${from}'];\n${code}`;
      });
    }
  }
  const [exported, codeLines] = splitLines(code, /^\s*export\s+(.+?);\s*$/);
  code = codeLines.join('\n');
  // Return values
  const values: string[] = [];
  for (const line of exported) {
    const name = parseExport(line);
    if (typeof name === 'string') {
      values.push(`default: ${name}`);
    } else if (name.length) {
      values.push(...name);
    }
  }
  const statement = `return { ${values.join(', ')} };`;
  code = `'use strict';\n${code}\n${statement}`;
  return Function(code)();
};

/** Import module bundle */
export const importBundle = <M>(
  options: BumbleOptions,
  bundle: BumbleBundle
): Promise<BumbleModule<M>> => {
  if (options.dynamicImports) {
    return importDynamicBundle<M>(bundle);
  }
  return importFunctionBundle<M>(bundle);
};
