import {svelte} from './deps.ts';
import {transpileTs} from './typescript.ts';
import type {BumbleOptions} from './types.ts';

export const processSvelte = async (
  code: string,
  options?: BumbleOptions
): Promise<string> => {
  const process = await svelte.preprocess(code, {
    markup: (markup) => {
      let scripts = '';
      for (const match of markup.content.matchAll(
        /<script([^>]*)>(.*?)<\/script>/gis
      )) {
        let attr = match[1];
        // Ignore if not TypeScript
        if (!attr.includes('lang="ts"')) {
          scripts += match[0];
          continue;
        }
        // Replace with transpiled code
        attr = attr.replace('lang="ts"', '');
        const code = transpileTs(match[2], options?.typescript);
        scripts += `<script${attr}>\n${code}\n</script>`;
      }
      // Strip existing scripts
      let code = markup.content.replaceAll(
        /<script([^>]*)>(.*?)<\/script>/gis,
        ''
      );
      // Prepend new script
      code = `${scripts}\n${code}`;
      return {code};
    }
  });
  return process.code;
};

export const compileSvelte = async (
  name: string,
  code: string,
  options?: BumbleOptions
) => {
  if (code.includes('lang="ts"')) {
    code = await processSvelte(code, options);
  }
  const result = svelte.compile(code, {
    name,
    generate: 'ssr',
    immutable: true,
    discloseVersion: false,
    enableSourcemap: false,
    css: 'none'
  });
  return result.js.code;
};
