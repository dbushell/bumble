import type {BumbleBundle, BumbleModule} from './types.ts';

/** Import bundle from a blob URL */
export const importDynamicBundle = async <M>(
  bundle: BumbleBundle,
  filterExports?: string[]
): Promise<BumbleModule<M>> => {
  const {script} = bundle;
  const code = script.getCode({
    exports: true,
    filterExports
  });
  const blob = new Blob([code], {type: 'text/javascript'});
  const url = URL.createObjectURL(blob);
  const mod = await import(url);
  URL.revokeObjectURL(url);
  return mod;
};

/** Evaluate bundle in a function that returns the exports */
export const importFunctionBundle = <M>(
  bundle: BumbleBundle,
  filterExports?: string[]
): Promise<BumbleModule<M>> => {
  const {script} = bundle;
  let code = script.getCode({
    exports: false,
    filterExports
  });
  const values: string[] = [];
  for (const [alias, name] of script.exports) {
    if (filterExports?.includes(alias) === false) {
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
  dynamicImports: boolean,
  filterExports?: string[]
): Promise<BumbleModule<M>> => {
  if (dynamicImports) {
    return importDynamicBundle<M>(bundle, filterExports);
  }
  return importFunctionBundle<M>(bundle, filterExports);
};
