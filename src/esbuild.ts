import {path, svelte, deepMerge} from './deps.ts';
import Script from './script.ts';
import type {Deferred, BumbleOptions, EsbuildMetafile} from './types.ts';
import * as esbuildType from 'https://deno.land/x/esbuild@v0.19.6/mod.d.ts';

export type {esbuildType};

let esbuild: typeof esbuildType | undefined;

export const esbuildStart = async () => {
  if (esbuild) {
    return esbuild;
  }
  const wasm = Deno.env.has('DENO_REGION');
  esbuild = wasm
    ? await import('https://deno.land/x/esbuild@v0.19.6/wasm.js')
    : await import('https://deno.land/x/esbuild@v0.19.6/mod.js');
  await esbuild.initialize({
    worker: false
  });
  return esbuild;
};

export const esbuildStop = () => {
  if (esbuild) {
    esbuild.stop();
  }
};

const deferredMap = new Map<string, Deferred<string>>();

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

const normalizeKey = (dir: string, key: string) => {
  // Ignore prefixed paths like `fetch:`
  if (/^.+?:/.test(key)) {
    return key;
  }
  // Check if WASM path or relative path
  let newKey = `/${key}`;
  if (!newKey.startsWith(dir)) {
    newKey = path.resolve(Deno.cwd(), `${key}`);
  }
  return newKey;
};

// Resolve all metafile paths to absolute paths
// esbuild WASM resolves differently
const normalizeMeta = (dir: string, oldMeta: EsbuildMetafile) => {
  const newMeta: EsbuildMetafile = {inputs: {}, outputs: {}};
  if (Object.hasOwn(newMeta, 'inputs')) {
    for (const [k, input] of Object.entries(oldMeta.inputs)) {
      const newInput = deepMerge({}, input);
      newMeta.inputs[normalizeKey(dir, k)] = newInput;
      for (const v2 of newInput.imports) {
        v2.path = normalizeKey(dir, v2.path);
      }
    }
    for (const [k, output] of Object.entries(oldMeta.outputs)) {
      const newOutput = deepMerge({}, output);
      newMeta.outputs[k] = newOutput;
      if (newOutput.entryPoint) {
        newOutput.entryPoint = normalizeKey(dir, newOutput.entryPoint);
      }
      for (const [k2, v2] of Object.entries(newOutput.inputs)) {
        delete newOutput.inputs[k2];
        newOutput.inputs[normalizeKey(dir, k2)] = v2;
      }
    }
  }
  return newMeta;
};

export const esbuildBundle = async (
  dir: string,
  entry: string,
  options?: BumbleOptions
) => {
  const generate = options?.svelteCompile?.generate ?? 'ssr';

  const group: Array<svelte.PreprocessorGroup> = [];
  let preprocess = options?.sveltePreprocess;
  if (preprocess) {
    if (typeof preprocess === 'function') {
      preprocess = preprocess(entry, options);
    }
    group.push(...[preprocess].flat(2));
  }

  const process = async (entry: string, src?: string) => {
    src ??= await Deno.readTextFile(entry);
    group.unshift({
      script: async ({content, attributes}) => {
        if (attributes.lang === 'ts') {
          const result = await esbuild.transform(content, {
            loader: 'ts',
            format: 'esm',
            target: 'esnext',
            tsconfigRaw: {
              compilerOptions: {
                target: 'esnext',
                verbatimModuleSyntax: true
              }
            }
          });
          return {code: result.code};
        }
        return {code: content};
      }
    });

    const preprocess = await svelte.preprocess(src, [...group], {
      filename: entry
    });

    const opts: svelte.CompileOptions = {
      name: componentName(entry),
      generate: 'ssr',
      hydratable: true,
      immutable: true,
      discloseVersion: false,
      enableSourcemap: false,
      css: 'none',
      ...options?.svelteCompile
    };
    const result = svelte.compile(preprocess.code, opts);
    return result;
  };

  const sveltePlugin: esbuildType.Plugin = {
    name: 'svelte',
    setup(build) {
      build.onResolve({filter: /.*/}, async (args) => {
        if (options?.esbuildResolve) {
          const result = await options.esbuildResolve(args);
          if (result) return result;
        }
        if (/^(file|https):/.test(args.path)) {
          return {
            path: args.path,
            namespace: 'fetch'
          };
        }
        if (args.path.startsWith('@')) {
          return {path: path.resolve(dir, args.path.slice(1))};
        }
        if (args.path.startsWith('svelte')) {
          const href = `https://esm.sh/${args.path.replace(
            'svelte',
            'svelte@4.2.7'
          )}?target=esnext`;
          return {
            path: href,
            namespace: 'fetch'
          };
        }
        if (args.namespace === 'fetch') {
          return {
            path: new URL(args.path, args.importer).href,
            namespace: 'fetch'
          };
        }
        if (args.path.startsWith('.')) {
          return {path: path.resolve(args.resolveDir, args.path)};
        }
        return {path: args.path};
      });
      build.onLoad({filter: /^(file|https):/}, async (args) => {
        const key = `fetch:${args.path}`;
        if (!deferredMap.has(key)) {
          const deffered = Promise.withResolvers<string>();
          deferredMap.set(key, deffered);
          const response = await fetch(args.path);
          const contents = await response.text();
          deffered.resolve(contents);
        }
        let contents = await deferredMap.get(key)!.promise;

        // TODO: cleanup duplicate code
        if (args.path.endsWith('.svelte')) {
          const pathname = new URL(args.path).pathname;
          const key = `compile:${generate}:${pathname}`;
          if (!deferredMap.has(key)) {
            const deffered = Promise.withResolvers<string>();
            deferredMap.set(key, deffered);
            const compile = await process(pathname, contents);
            deffered.resolve(compile.js.code);
          }
          contents = await deferredMap.get(key)!.promise;
        }
        return {
          contents,
          loader: 'js'
        };
      });
      build.onLoad({filter: /\.svelte$/}, async (args) => {
        const key = `compile:${generate}:${args.path}`;
        if (!deferredMap.has(key)) {
          const deffered = Promise.withResolvers<string>();
          deferredMap.set(key, deffered);
          const compile = await process(args.path);
          deffered.resolve(compile.js.code);
        }
        return {
          contents: await deferredMap.get(key)!.promise
        };
      });
      build.onLoad({filter: /\.(js|ts|json)$/}, async (args) => {
        const src = await Deno.readTextFile(args.path);
        const ext = path.extname(args.path);
        return {
          contents: src,
          loader: ext.substring(1) as esbuildType.Loader
        };
      });
    }
  };
  const esbuild = await esbuildStart();
  const results = await esbuild.build({
    entryPoints: [entry],
    plugins: [sveltePlugin],
    format: 'esm',
    target: 'esnext',
    bundle: true,
    minify: false,
    minifyWhitespace: options?.svelteCompile?.generate === 'dom',
    minifyIdentifiers: options?.svelteCompile?.generate === 'dom',
    write: false,
    metafile: true
  });
  const script = new Script(results.outputFiles[0].text, entry, dir);
  const metafile = normalizeMeta(dir, results.metafile);
  return {script, metafile};
};
