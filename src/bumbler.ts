import {path, existsSync, ensureDirSync} from './deps.ts';
import {importBundle} from './module.ts';
import {esbuildBundle, esbuildStop} from './esbuild.ts';
import type {
  BumbleOptions,
  BumbleBundleOptions,
  BumbleBundle,
  BumbleDOMBundle,
  BumbleSSRBundle
} from './types.ts';

export class Bumbler<M> {
  #dir: string;
  #options: BumbleOptions;

  constructor(dir: string, options?: BumbleOptions) {
    this.#dir = dir;
    this.#options = {...options};
    if (this.build) {
      if (existsSync(this.buildDir)) {
        Deno.removeSync(this.buildDir, {recursive: true});
      }
      ensureDirSync(this.buildDir);
    }
  }

  get dev() {
    return this.#options.dev ?? false;
  }

  get dynamicImports() {
    return (
      // Deno Deploy does not support dynamic imports as used
      this.#options.dynamicImports ?? !Deno.env.has('DENO_REGION')
    );
  }

  get build() {
    return this.#options.build ?? false;
  }

  get buildDir() {
    return this.#options.buildDir ?? path.join(Deno.cwd(), '.bumble');
  }

  stop(): void {
    esbuildStop();
  }

  async #bumble(
    entry: string,
    hash: string,
    options: BumbleBundleOptions
  ): Promise<BumbleBundle> {
    const bundle = await esbuildBundle(this.#dir, entry, options);
    if (this.build) {
      // Write the esbuild metafile
      await Deno.writeTextFile(
        path.join(this.buildDir, `${hash}.json`),
        JSON.stringify(bundle.metafile, null, 2)
      );
      // Write the esbuild bundled script
      await Deno.writeTextFile(
        path.join(this.buildDir, `${hash}.js`),
        bundle.script.serialize({
          exports: true,
          exportType: 'module'
        })
      );
    }
    return bundle;
  }

  async bumbleDOM(
    entry: string,
    hash: string,
    options: BumbleBundleOptions = {}
  ): Promise<BumbleDOMBundle> {
    options.svelteCompile = {
      ...options.svelteCompile,
      generate: 'dom'
    };
    const s1 = performance.now();
    const bundle = await this.#bumble(entry, hash, options);
    const code = bundle.script.serialize({
      exports: options.exports ?? true,
      exportType: 'module'
    });
    if (this.dev) {
      const rel = path.relative(this.#dir, entry) + '-dom';
      const t1 = (performance.now() - s1).toFixed(2).padStart(7, ' ');
      console.log(`📦 ${t1}ms [dom] ${rel}`);
    }
    return {entry, hash, code, metafile: bundle.metafile};
  }

  async bumbleSSR(
    entry: string,
    hash: string,
    options: BumbleBundleOptions = {}
  ): Promise<BumbleSSRBundle<M>> {
    options.svelteCompile = {
      ...options.svelteCompile,
      generate: 'ssr'
    };
    const s1 = performance.now();
    const bundle = await this.#bumble(entry, hash, options);
    const t1 = (performance.now() - s1).toFixed(2).padStart(7, ' ');
    const s2 = performance.now();
    const mod = await importBundle<M>(
      bundle,
      this.dynamicImports,
      options.exports
    );
    if (this.dev) {
      const rel = path.relative(this.#dir, entry);
      const t2 = (performance.now() - s2).toFixed(2).padStart(7, ' ');
      console.log(`📦 ${t1}ms [ssr] ${rel}`);
      console.log(`🐝 ${t2}ms [ssr] ↑`);
    }
    return {entry, hash, mod, metafile: bundle.metafile};
  }
}
