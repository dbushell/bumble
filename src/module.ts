import {svelteNpmMap} from './lib/svelte.ts';
import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';

/** Import bundle from a blob URL */
export const importDynamicBundle = async <M>(
  bundle: BumbleBundle,
  options?: BumbleOptions
): Promise<BumbleModule<M>> => {
  const {script, manifest} = bundle;
  let code = script.getCode({
    exports: true,
    filterExports: options?.filterExports
  });
  // Append external import statements
  for (const [from, names] of manifest.external.entries()) {
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
  bundle: BumbleBundle,
  options?: BumbleOptions
): Promise<BumbleModule<M>> => {
  const {script, manifest} = bundle;
  let code = script.getCode({
    exports: false,
    filterExports: options?.filterExports
  });
  // Reference imports from global
  window['📦'] = {};
  for (const [from, names] of manifest.external.entries()) {
    if (Object.hasOwn(svelteNpmMap, from)) {
      window['📦'][from] = await svelteNpmMap[from]();
      names.forEach((name) => {
        code = `const {${name}} = window['📦']['${from}'];\n${code}`;
      });
    }
  }
  const values: string[] = [];
  for (const [alias, name] of script.exports) {
    if (options?.filterExports?.includes(alias) === false) {
      continue;
    }
    values.push(`${alias}:${name}`);
  }
  const statement = `return {${values.join(',')}};`;
  code = `'use strict';\n${code}\n${statement}`;
  return Function(code)();
};

/** Import module bundle */
export const importBundle = <M>(
  bundle: BumbleBundle,
  options?: BumbleOptions
): Promise<BumbleModule<M>> => {
  if (options?.dynamicImports) {
    return importDynamicBundle<M>(bundle, options);
  }
  return importFunctionBundle<M>(bundle, options);
};
