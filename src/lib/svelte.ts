import {path, svelte} from '../deps.ts';
import {transpileTs} from './typescript.ts';
import Script from '../script.ts';
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
      script: (params) => {
        let code = params.content;
        if (params.attributes.lang === 'ts') {
          code = transpileTs(params.content, options?.typescript);
        }
        if (
          options?.svelte?.generate === 'dom' &&
          params.attributes.context === 'module'
        ) {
          // TODO: allow builtin components? (e.g. island)
          const script = new Script(code, entry, path.dirname(entry));
          return {code: script.getCode({exports: true})};
        }
        return {code};
      }
    }
  ];
  // TODO: use generator function to pass options back
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
  svelte: () => import('npm:svelte@4.2.3'),
  'svelte/animate': () => import('npm:svelte@4.2.3/animate'),
  'svelte/easing': () => import('npm:svelte@4.2.3/easing'),
  'svelte/motion': () => import('npm:svelte@4.2.3/motion'),
  'svelte/store': () => import('npm:svelte@4.2.3/store'),
  'svelte/transition': () => import('npm:svelte@4.2.3/transition'),
  'svelte/internal': () => import('npm:svelte@4.2.3/internal'),
  'svelte/internal/disclose-version': () =>
    import('npm:svelte@4.2.3/internal/disclose-version')
};
