import {parseExports} from './parse.ts';
import {svelteMap} from './svelte.ts';
import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';

/** Import bundle from a blob URL */
export const importDynamicBundle = async <M>(
  bundle: BumbleBundle
): Promise<BumbleModule<M>> => {
  let {code, external} = bundle;
  // Append import statements
  for (const [from, names] of external.entries()) {
    code = `import {${names.join(',')}} from "npm:${from}";\n${code}`;
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
  // Reference imports from global
  window['📦'] = {};
  for (const [from, names] of external.entries()) {
    if (Object.hasOwn(svelteMap, from)) {
      window['📦'][from] = await svelteMap[from]();
      names.forEach((name) => {
        code = `const {${name}} = window['📦']['${from}'];\n${code}`;
      });
    }
  }
  const parsed = parseExports(code);
  code = parsed.code;
  const values: string[] = [];
  for (const [alias, name] of parsed.map) {
    values.push(`${alias}:${name}`);
  }
  const statement = `return {${values.join(',')}};`;
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
