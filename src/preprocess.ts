import {svelte, typescript} from './deps.ts';
import compilerOptions from './tsconfig.ts';
import type {BumbleOptions} from './types.ts';

/** Svelte preprocess */
export const sveltePreprocess = async (
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
        const result = typescript.transpileModule(match[2], {
          compilerOptions: {
            ...options?.typescript,
            ...compilerOptions
          }
        });
        // Replace with transpiled code
        attr = attr.replace('lang="ts"', '');
        scripts += `<script${attr}>\n${result.outputText}\n</script>`;
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
