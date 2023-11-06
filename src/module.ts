import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';

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
  // const url = `data:text/javascript;base64,${base64.encodeBase64(code)}`;
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
  // Replace default export with return statement
  const component = code.match(/export\s+default\s+(\w+);/)?.[1];
  let statement = `return { default: ${component}`;
  // Add named exports to return statement
  let match;
  const regexp = /^export\s+{(.*?)};$/gm;
  while ((match = regexp.exec(code)) !== null) {
    match[1].split(',').map((i) => {
      statement += `, ${i.trim()}`;
    });
  }
  statement += ' };';
  code = code.replaceAll(/^export\s+(.*?);$/gm, '');
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
