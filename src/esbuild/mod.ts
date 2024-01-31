import {path, svelte} from '../deps.ts';
import Script from '../script.ts';
import {typescriptGroup} from './typescript.ts';
import {componentName, normalizeMeta} from './utils.ts';
import type {EsbuildType, Deferred, BumbleBundleOptions} from '../types.ts';

let esbuild: typeof EsbuildType | undefined;

export const esbuildStart = async () => {
  if (esbuild) {
    return esbuild;
  }
  const wasm = Deno.env.has('DENO_REGION');
  esbuild = wasm
    ? await import('https://deno.land/x/esbuild@v0.20.0/wasm.js')
    : await import('https://deno.land/x/esbuild@v0.20.0/mod.js');
  await esbuild.initialize({
    worker: false
  });
  return esbuild;
};

export const esbuildStop = async () => {
  if (esbuild) {
    await esbuild.stop();
  }
};

const TOKENS = new Map<string, string>();
if (Deno.env.has('DENO_AUTH_TOKENS')) {
  const tokens = Deno.env
    .get('DENO_AUTH_TOKENS')!
    .split(';')
    .map((t) => t.trim().split('@'));
  for (const [token, host] of tokens) {
    TOKENS.set(host, token);
  }
}

const fetchHeaders = (fetchpath: string) => {
  const headers: Record<string, string> = {};
  const url = new URL(fetchpath);
  for (const [k, v] of TOKENS) {
    if (url.host.startsWith(k)) {
      headers['authorization'] = `Bearer ${v}`;
      break;
    }
  }
  return headers;
};

const deferredMap = new Map<string, Deferred<string>>();
const mtimeMap = new Map<string, number>();

const deferredCode = (
  key: string,
  entry: string | null,
  callback: () => Promise<string>
) => {
  if (entry) {
    const stat = Deno.statSync(entry);
    if (stat.mtime && stat.mtime.getTime() !== mtimeMap.get(key)) {
      mtimeMap.set(key, stat.mtime.getTime());
      deferredMap.delete(key);
    }
  }
  if (!deferredMap.has(key)) {
    const deffered = Promise.withResolvers<string>();
    deferredMap.set(key, deffered);
    callback().then((code) => deffered.resolve(code));
  }
  return deferredMap.get(key)!.promise;
};

export const esbuildBundle = async (
  dir: string,
  entry: string,
  options: BumbleBundleOptions
) => {
  const esbuild = await esbuildStart();
  const generate = options.svelteCompile?.generate ?? 'ssr';

  // Setup preprocessors
  const group: Array<svelte.PreprocessorGroup> = [
    typescriptGroup(esbuild.transform)
  ];
  let svelteGroup = options.sveltePreprocess;
  if (svelteGroup) {
    if (typeof svelteGroup === 'function') {
      svelteGroup = svelteGroup(entry, options);
    }
    group.push(...[svelteGroup].flat(2));
  }

  const svelteProcess = async (entry: string, src?: string) => {
    src ??= await Deno.readTextFile(entry);
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

  const sveltePlugin: EsbuildType.Plugin = {
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
        if (args.path.startsWith('svelte')) {
          const href = `https://esm.sh/${args.path.replace(
            'svelte',
            `svelte@${svelte.VERSION}`
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
        if (args.path.startsWith('@')) {
          return {path: path.resolve(dir, args.path.slice(1))};
        }
        if (args.path.startsWith('/')) {
          return {path: args.path};
        }
        if (args.path.startsWith('.')) {
          return {path: path.resolve(args.resolveDir, args.path)};
        }
        return {path: path.join(dir, args.path)};
      });
      build.onLoad({filter: /^(file|https):/}, async (args) => {
        const key = `fetch:${args.path}`;
        let loader: EsbuildType.Loader = 'js';
        let contents = await deferredCode(key, null, async () => {
          const response = await fetch(args.path, {
            headers: {...fetchHeaders(args.path)}
          });
          if (!response.ok) {
            console.error(`Failed to fetch: "${args.path}"`, response);
            throw new Error();
          }
          return await response.text();
        });
        if (args.path.endsWith('.svelte')) {
          const pathname = new URL(args.path).pathname;
          const key = `compile:${generate}:${pathname}`;
          contents = await deferredCode(key, null, async () => {
            const compile = await svelteProcess(pathname, contents);
            return compile.js.code;
          });
        } else {
          const ext = path.extname(args.path).substring(1);
          if (/^(js|ts|json)$/.test(ext)) {
            loader = ext as EsbuildType.Loader;
          }
        }
        return {
          contents,
          loader
        };
      });
      build.onLoad({filter: /\.svelte$/}, async (args) => {
        const key = `compile:${generate}:${args.path}`;
        return {
          contents: await deferredCode(key, args.path, async () => {
            const compile = await svelteProcess(args.path);
            return compile.js.code;
          })
        };
      });
      build.onLoad({filter: /\.(js|ts|json)$/}, async (args) => {
        const key = `file:${generate}:${args.path}`;
        const ext = path.extname(args.path).substring(1);
        return {
          contents: await deferredCode(key, args.path, () => {
            return Deno.readTextFile(args.path);
          }),
          loader: ext as EsbuildType.Loader
        };
      });
    }
  };

  const esbuildOptions: EsbuildType.BuildOptions = {
    entryPoints: [entry],
    plugins: [sveltePlugin],
    format: 'esm',
    target: 'esnext',
    bundle: true,
    minify: false,
    minifyWhitespace: options?.svelteCompile?.generate === 'dom',
    minifyIdentifiers: options?.svelteCompile?.generate === 'dom',
    write: false,
    metafile: true,
    ...options?.esbuildOptions
  };
  const results = await esbuild.build(esbuildOptions);
  const script = new Script(results.outputFiles![0].text);
  const metafile = normalizeMeta(dir, results.metafile!);
  return {script, metafile};
};
