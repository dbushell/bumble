import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';

/** Import bundle from a blob URL */
export const importDynamicBundle = async (
  bundle: BumbleBundle
): Promise<BumbleModule> => {
  let {code, external} = bundle;
  // Append import statements
  for (const [from, imports] of external.entries()) {
    const statement = `import { ${imports.join(', ')} } from "npm:${from}";`;
    code = `${statement}\n${code}`;
  }
  const blob = new Blob([code], {type: 'application/javascript'});
  const url = URL.createObjectURL(blob);
  const mod = await import(url);
  URL.revokeObjectURL(url);
  return mod;
};

/** Evaluate bundle in a function that returns the exports */
export const importFunctionBundle = async (
  bundle: BumbleBundle
): Promise<BumbleModule> => {
  let {code, external} = bundle;
  //@ts-ignore: lol
  globalThis['📦'] = {};
  // Needed for Deno Deploy limitations
  const map = {
    svelte: async () => await import('npm:svelte'),
    'svelte/internal': async () => await import('npm:svelte/internal')
  };
  // Reference imports from global namespace
  for (const [from, imports] of external.entries()) {
    if (Object.hasOwn(map, from)) {
      //@ts-ignore: lol
      globalThis['📦'][from] = await map[from]();
      imports.forEach((name) => {
        code = `const {${name}} = globalThis['📦']['${from}'];\n${code}`;
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
export const importBundle = (
  options: BumbleOptions,
  bundle: BumbleBundle
): Promise<BumbleModule> => {
  if (options.dynamicImports) {
    return importDynamicBundle(bundle);
  }
  return importFunctionBundle(bundle);
};
