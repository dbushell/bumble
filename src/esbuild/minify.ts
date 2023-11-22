// @deno-types="https://deno.land/x/esbuild@v0.19.6/mod.d.ts"
import esbuild from './mod.ts';
import {path} from '../deps.ts';
import Script from '../script.ts';
import type {BumbleOptions, BumbleManifest} from '../types.ts';
import {svelteLocalMap} from '../lib/svelte.ts';

export const sveltePlugin: esbuild.Plugin = {
  name: 'svelte',
  setup(build) {
    build.onResolve({filter: /.*/}, (args) => {
      if (args.path.startsWith('svelte')) {
        if (Object.hasOwn(svelteLocalMap, args.path)) {
          const url = import.meta.resolve(
            svelteLocalMap[args.path as keyof typeof svelteLocalMap]
          );
          return {path: new URL(url).pathname};
        }
      }
      if (args.path.startsWith('.')) {
        return {path: path.resolve(args.resolveDir, args.path)};
      }
      return {path: args.path};
    });
    build.onLoad({filter: /\.js$/}, async (args) => {
      const src = await Deno.readTextFile(args.path);
      return {
        contents: src,
        loader: 'js'
      };
    });
  }
};

const minifyCache = new Map<string, Script>();

export const minify = async (
  dir: string,
  entry: string,
  script: Script,
  manifest: BumbleManifest,
  options?: BumbleOptions
) => {
  if (minifyCache.has(entry)) {
    return minifyCache.get(entry)!;
  }
  const start = performance.now();
  let code = script.getCode({exports: true});
  for (const [from, names] of manifest.external.entries()) {
    code = `import {${names.join(',')}} from "${from}";\n${code}`;
  }
  const bundle = await esbuild.build({
    stdin: {
      contents: code
    },
    plugins: [sveltePlugin],
    format: 'esm',
    target: 'esnext',
    bundle: true,
    minify: false,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    write: false
  });
  esbuild.stop();
  script = new Script(bundle.outputFiles[0].text, entry, dir);
  minifyCache.set(entry, script);
  if (options?.dev) {
    const time = (performance.now() - start).toFixed(2);
    console.log(`🛠️ ${time}ms (${path.relative(dir, entry)})`);
  }
  return script;
};
