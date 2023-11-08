import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';
import {parseExports} from './parse.ts';

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
    svelte: async () => await import('npm:svelte@4.2.2'),
    'svelte/internal': async () => await import('npm:svelte@4.2.2/internal'),
    'svelte/internal/disclose-version': async () =>
      await import('npm:svelte@4.2.2/internal/disclose-version'),
    'svelte/action': async () => await import('npm:svelte@4.2.2/action'),
    'svelte/animate': async () => await import('npm:svelte@4.2.2/animate'),
    'svelte/easing': async () => await import('npm:svelte@4.2.2/easing'),
    'svelte/elements': async () => await import('npm:svelte@4.2.2/elements'),
    'svelte/motion': async () => await import('npm:svelte@4.2.2/motion'),
    'svelte/store': async () => await import('npm:svelte@4.2.2/store'),
    'svelte/transition': async () => await import('npm:svelte@4.2.2/transition')
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
  const parsed = parseExports(code);
  code = parsed.code;
  const values: string[] = [];
  for (const [alias, name] of parsed.map) {
    values.push(`${alias}: ${name}`);
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
