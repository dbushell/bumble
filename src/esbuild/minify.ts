import {esbuildStart} from './mod.ts';
import {path} from '../deps.ts';
import Script from '../script.ts';
import {svelteLocalMap} from '../lib/svelte.ts';
import type {BumbleOptions, BumbleManifest} from '../types.ts';
import type {esbuildType} from './mod.ts';

export const sveltePlugin: esbuildType.Plugin = {
  name: 'svelte',
  setup(build) {
    build.onResolve({filter: /.*/}, (args) => {
      if (args.path.startsWith('svelte')) {
        if (Object.hasOwn(svelteLocalMap, args.path)) {
          return {
            path: svelteLocalMap[args.path as keyof typeof svelteLocalMap],
            namespace: 'fetch'
          };
        }
      }
      if (args.path.startsWith('.')) {
        if (args.namespace === 'fetch') {
          return {
            path: new URL(args.path, args.importer).href,
            namespace: 'fetch'
          };
        } else {
          return {path: path.resolve(args.resolveDir, args.path)};
        }
      }
      return {path: args.path};
    });
    build.onLoad({filter: /\.js$/}, async (args) => {
      let contents = '';
      if (args.namespace === 'fetch') {
        const response = await fetch(args.path);
        contents = await response.text();
      } else {
        contents = await Deno.readTextFile(args.path);
      }
      return {
        contents,
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
  const esbuild = await esbuildStart();
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
  script = new Script(bundle.outputFiles[0].text, entry, dir);
  minifyCache.set(entry, script);
  if (options?.dev) {
    const time = (performance.now() - start).toFixed(2);
    console.log(`🛠️ ${time}ms (${path.relative(dir, entry)})`);
  }
  return script;
};
