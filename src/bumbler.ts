import {fs, path, deepMerge} from './deps.ts';
import {bundleModule} from './bundle.ts';
import {importBundle} from './module.ts';
import {compilerOptions} from './lib/typescript.ts';
import {esbuildStop} from './esbuild/mod.ts';
import {encodeHash, serialize, deserialize} from './utils.ts';
import type {
  BumbleOptions,
  BumbleBundle,
  BumbleManifest,
  BumbleModule
} from './types.ts';

export class Bumbler<M> {
  #dir: string;
  #options: BumbleOptions;

  constructor(dir: string, options?: BumbleOptions) {
    this.#dir = dir;
    this.#options = deepMerge<BumbleOptions>(
      {
        dev: false,
        dynamicImports: false,
        typescript: compilerOptions
      },
      options ?? {}
    );
  }

  get dev(): boolean {
    return this.#options.dev ?? false;
  }

  get deployHash(): string {
    return this.#options.deployHash ?? 'bumble';
  }

  set sveltePreprocess(preprocess: BumbleOptions['sveltePreprocess']) {
    this.#options.sveltePreprocess = preprocess;
  }

  async start() {
    if (!this.#options.build) {
      return;
    }
    const cache = path.join(Deno.cwd(), '.dinossr');
    await fs.ensureDir(cache);
    for await (const dir of Deno.readDir(cache)) {
      if (dir.isDirectory && dir.name !== this.deployHash) {
        await Deno.remove(path.join(cache, dir.name), {recursive: true});
      }
    }
  }

  stop(): void {
    esbuildStop();
  }

  async #bumble(entry: string, options: BumbleOptions): Promise<BumbleBundle> {
    let bundle: BumbleBundle;
    const suffix = options.svelte?.generate ?? '';
    const cachePath = path.join(
      Deno.cwd(),
      '.dinossr',
      this.deployHash,
      `${await encodeHash(entry, 'SHA-1')}-${suffix}.json`
    );
    if (await fs.exists(cachePath)) {
      bundle = deserialize(await Deno.readTextFile(cachePath));
    } else {
      bundle = await bundleModule(this.#dir, entry, options);
      if (options.build) {
        await fs.ensureFile(cachePath);
        await Deno.writeTextFile(cachePath, serialize(bundle));
      }
    }
    return bundle;
  }

  async bumbleDOM(entry: string, options?: BumbleOptions): Promise<string> {
    options = deepMerge<BumbleOptions>(this.#options, options ?? {});
    options = deepMerge<BumbleOptions>(options, {
      svelte: {
        generate: 'dom'
      }
    });
    const s1 = performance.now();
    const bundle = await this.#bumble(entry, options);
    let code = bundle.script.getCode({
      exports: true,
      filterExports: options?.filterExports
    });
    for (const [from, imports] of bundle.manifest.external.entries()) {
      const statement = `import { ${imports.join(', ')} } from "${from}";`;
      code = `${statement}\n${code}`;
    }
    if (options.dev) {
      const rel = path.relative(this.#dir, entry);
      const t1 = (performance.now() - s1).toFixed(2);
      console.log(`🐝 ${t1}ms (${rel})`);
    }
    return code;
  }

  async bumbleSSR(
    entry: string,
    options?: BumbleOptions
  ): Promise<{manifest: BumbleManifest; mod: BumbleModule<M>}> {
    options = deepMerge<BumbleOptions>(this.#options, options ?? {});
    options = deepMerge<BumbleOptions>(options, {
      svelte: {
        generate: 'ssr'
      }
    });
    const s1 = performance.now();
    const bundle = await this.#bumble(entry, options);
    const s2 = performance.now();
    const mod = await importBundle<M>(bundle, options);
    if (options.dev) {
      const rel = path.relative(this.#dir, entry);
      const t2 = (performance.now() - s2).toFixed(2);
      console.log(`📦 ${t2}ms (${rel})`);
      const t1 = (performance.now() - s1).toFixed(2);
      console.log(`🐝 ${t1}ms (${rel})`);
    }
    return {mod, manifest: bundle.manifest};
  }
}
