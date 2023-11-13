import {path, deepMerge} from './deps.ts';
import {bundleModule} from './bundle.ts';
import {importBundle} from './module.ts';
import {compilerOptions} from './lib/typescript.ts';
import {encodeHash} from './utils.ts';
import type {BumbleOptions, BumbleManifest, BumbleModule} from './types.ts';

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

  get deployHash(): Promise<string> {
    return Promise.resolve(
      this.#options.deployId ? encodeHash(this.#options.deployId, 'SHA-1') : ''
    );
  }

  async bumbleDOM(abspath: string, options?: BumbleOptions): Promise<string> {
    options = deepMerge<BumbleOptions>(this.#options, options ?? {});
    options = deepMerge<BumbleOptions>(options, {
      svelte: {
        generate: 'dom'
      }
    });
    if (options.deployId) {
      options.deployId = await this.deployHash;
    }
    const {code, manifest} = await bundleModule(this.#dir, abspath, options);
    let newCode = code;
    for (const [from, imports] of manifest.external.entries()) {
      const statement = `import { ${imports.join(', ')} } from "${from}";`;
      newCode = `${statement}\n${newCode}`;
    }
    return newCode;
  }

  async bumbleSSR(
    abspath: string,
    options?: BumbleOptions
  ): Promise<{manifest: BumbleManifest; mod: BumbleModule<M>}> {
    options = deepMerge<BumbleOptions>(this.#options, options ?? {});
    options = deepMerge<BumbleOptions>(options, {
      svelte: {
        generate: 'ssr'
      }
    });
    if (options.deployId) {
      options.deployId = await this.deployHash;
    }
    const s1 = performance.now();
    const {code, manifest} = await bundleModule(this.#dir, abspath, options);
    const s2 = performance.now();
    const mod = await importBundle<M>(options, {code, manifest});
    if (options.dev) {
      const rel = path.relative(this.#dir, abspath);
      const t2 = (performance.now() - s2).toFixed(2);
      console.log(`📦 ${t2}ms (${rel})`);
      const t1 = (performance.now() - s1).toFixed(2);
      console.log(`🐝 ${t1}ms (${rel})`);
    }
    return {manifest, mod};
  }

  bumble(abspath: string) {
    return this.bumbleSSR(abspath);
  }
}
