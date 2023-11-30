import {
  path,
  deepMerge,
  existsSync,
  ensureDirSync,
  ensureFileSync
} from './deps.ts';
import {importBundle} from './module.ts';
import {esbuildBundle, esbuildStop, esbuildType} from './esbuild.ts';
import {encodeHash, serialize, deserialize} from './utils.ts';
import type {BumbleOptions, BumbleBundle, BumbleModule} from './types.ts';

export class Bumbler<M> {
  #dir: string;
  #options: BumbleOptions;

  constructor(dir: string, options?: BumbleOptions) {
    this.#dir = dir;
    this.#options = deepMerge<BumbleOptions>(
      {
        dev: false,
        dynamicImports: false
      },
      options ?? {}
    );
    if (this.#options.build) {
      if (existsSync(this.buildDir)) {
        Deno.removeSync(this.buildDir, {recursive: true});
      }
      ensureDirSync(this.buildDir);
    }
  }

  get dev(): boolean {
    return this.#options.dev ?? false;
  }

  get deployHash(): string {
    return this.#options.deployHash ?? 'bumble';
  }

  get buildDir(): string {
    // TODO: make this configurable?
    return path.join(Deno.cwd(), '.bumble');
  }

  stop(): void {
    esbuildStop();
  }

  async #bumble(
    entry: string,
    hash: string,
    options: BumbleOptions
  ): Promise<BumbleBundle> {
    let bundle: BumbleBundle;
    let cache = path.join(Deno.cwd(), '.bumble', this.deployHash);
    cache = path.join(cache, `${hash}.json`);
    if (existsSync(cache)) {
      bundle = deserialize(await Deno.readTextFile(cache));
      bundle.prebuild = true;
    } else {
      bundle = await esbuildBundle(this.#dir, entry, options);
      if (options.build) {
        ensureFileSync(cache);
        await Deno.writeTextFile(cache, serialize(bundle));
      }
    }
    return bundle;
  }

  async bumbleDOM(entry: string, options?: BumbleOptions): Promise<string> {
    options = deepMerge<BumbleOptions>(this.#options, options ?? {});
    options = deepMerge<BumbleOptions>(options, {
      svelteCompile: {
        generate: 'dom'
      }
    });
    const rel = path.relative(this.#dir, entry) + '-dom';
    const hash = encodeHash(rel + this.deployHash);
    const s1 = performance.now();
    const bundle = await this.#bumble(entry, hash, options);
    const code = bundle.script.getCode({
      exports: true,
      filterExports: options?.filterExports
    });
    if (options.dev) {
      const t1 = (performance.now() - s1).toFixed(2);
      console.log(`🐝 ${t1}ms (${rel})`);
    }
    return code;
  }

  async bumbleSSR(
    entry: string,
    options?: BumbleOptions
  ): Promise<{
    metafile?: esbuildType.Metafile;
    mod: BumbleModule<M>;
  }> {
    options = deepMerge<BumbleOptions>(this.#options, options ?? {});
    options = deepMerge<BumbleOptions>(options, {
      svelteCompile: {
        generate: 'ssr'
      }
    });
    const rel = path.relative(this.#dir, entry) + '-ssr';
    const hash = encodeHash(rel + this.deployHash);
    const s1 = performance.now();
    const bundle = await this.#bumble(entry, hash, options);
    const s2 = performance.now();
    const mod = await importBundle<M>(bundle, options);
    if (options.dev) {
      const t2 = (performance.now() - s2).toFixed(2);
      const t1 = (performance.now() - s1).toFixed(2);
      if (bundle.prebuild) {
        console.log(`🐝 ${t1}ms (${rel})`);
      } else {
        console.log(`📦 ${t2}ms (${rel})`);
        console.log(`🐝 ${t1}ms (${rel})`);
      }
    }
    return {mod, metafile: bundle.metafile};
  }
}
