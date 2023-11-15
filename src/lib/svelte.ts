import {path, svelte} from '../deps.ts';
import {transpileTs} from './typescript.ts';
import type {BumbleOptions} from '../types.ts';

const componentName = (entry: string) => {
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
  code: string,
  options?: BumbleOptions
): Promise<string> => {
  const group: Array<svelte.PreprocessorGroup> = [
    {
      script: (script) => {
        let code = script.content;
        if (script.attributes.lang === 'ts') {
          code = transpileTs(script.content, options?.typescript);
        }
        return {code};
      }
    }
  ];
  if (options?.sveltePreprocess) {
    group.push(...[options.sveltePreprocess].flat(2));
  }
  const process = await svelte.preprocess(code, group, {
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

// Needed for Deno Deploy limitations
export const svelteMap: Record<string, () => Promise<unknown>> = {
  svelte: () => import('npm:svelte@4.2.2'),
  'svelte/action': () => import('npm:svelte@4.2.2/action'),
  'svelte/animate': () => import('npm:svelte@4.2.2/animate'),
  'svelte/easing': () => import('npm:svelte@4.2.2/easing'),
  'svelte/elements': () => import('npm:svelte@4.2.2/elements'),
  'svelte/motion': () => import('npm:svelte@4.2.2/motion'),
  'svelte/store': () => import('npm:svelte@4.2.2/store'),
  'svelte/transition': () => import('npm:svelte@4.2.2/transition'),
  'svelte/internal': () => import('npm:svelte@4.2.2/internal'),
  'svelte/internal/disclose-version': () =>
    import('npm:svelte@4.2.2/internal/disclose-version')
};
