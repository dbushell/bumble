import {path, svelte} from '../deps.ts';
import {transpileTs} from './typescript.ts';
import type {BumbleOptions} from '../types.ts';

// Needed for Deno Deploy limitations
export const svelteNpmMap: Record<string, () => Promise<unknown>> = {
  svelte: () => import('npm:svelte@4.2.7'),
  'svelte/animate': () => import('npm:svelte@4.2.7/animate'),
  'svelte/easing': () => import('npm:svelte@4.2.7/easing'),
  'svelte/motion': () => import('npm:svelte@4.2.7/motion'),
  'svelte/store': () => import('npm:svelte@4.2.7/store'),
  'svelte/transition': () => import('npm:svelte@4.2.7/transition'),
  'svelte/internal': () => import('npm:svelte@4.2.7/internal'),
  'svelte/internal/disclose-version': () =>
    import('npm:svelte@4.2.7/internal/disclose-version')
};

export const componentName = (entry: string) => {
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

export const processSvelte = async (
  entry: string,
  entryCode: string,
  options?: BumbleOptions
): Promise<string> => {
  const group: Array<svelte.PreprocessorGroup> = [
    {
      script: (params) => {
        let code = params.content;
        if (params.attributes.lang === 'ts') {
          code = transpileTs(params.content, options?.typescript);
        }
        return {code};
      }
    }
  ];
  // Pass through additional groups
  let preprocess = options?.sveltePreprocess;
  if (preprocess) {
    if (typeof preprocess === 'function') {
      preprocess = preprocess(entry, options);
    }
    group.push(...[preprocess].flat(2));
  }
  const process = await svelte.preprocess(entryCode, group, {
    filename: entry
  });
  return process.code;
};

export const compileSvelte = async (
  entry: string,
  code: string,
  options?: BumbleOptions
) => {
  const name = componentName(entry);
  code = await processSvelte(entry, code, options);
  const result = svelte.compile(code, {
    name,
    generate: 'ssr',
    hydratable: true,
    immutable: true,
    discloseVersion: false,
    enableSourcemap: false,
    css: 'none',
    ...options?.svelte
  });
  return result.js.code;
};
