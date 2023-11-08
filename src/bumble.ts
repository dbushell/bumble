import {path, deepMerge} from './deps.ts';
import {bundle} from './bundle.ts';
import {importBundle} from './module.ts';
import {compilerOptions} from './typescript.ts';
import {encodeHash} from './utils.ts';
import type {BumbleOptions, BumbleModule} from './types.ts';

export default class Bumble<M> {
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

  async bumbleDOM(abspath: string): Promise<string> {
    const options = deepMerge<BumbleOptions>(this.#options, {
      svelte: {
        generate: 'dom'
      }
    });
    if (options.deployId) {
      options.deployId = await this.deployHash;
    }
    const {code, external} = await bundle(this.#dir, abspath, options);
    let newCode = code;
    for (const [from, imports] of external.entries()) {
      const statement = `import { ${imports.join(', ')} } from "${from}";`;
      newCode = `${statement}\n${newCode}`;
    }
    return newCode;
  }

  async bumbleSSR(abspath: string): Promise<BumbleModule<M>> {
    const options = deepMerge<BumbleOptions>(this.#options, {
      svelte: {
        generate: 'ssr'
      }
    });
    if (options.deployId) {
      options.deployId = await this.deployHash;
    }
    const s1 = performance.now();
    const {code, external} = await bundle(this.#dir, abspath, options);
    const s2 = performance.now();
    const mod = await importBundle<M>(options, {code, external});
    if (options.dev) {
      const rel = path.relative(this.#dir, abspath);
      const t2 = (performance.now() - s2).toFixed(2);
      console.log(`📦 ${t2}ms (${rel})`);
      const t1 = (performance.now() - s1).toFixed(2);
      console.log(`🐝 ${t1}ms (${rel})`);
    }
    return mod;
  }

  bumble(abspath: string): Promise<BumbleModule<M>> {
    return this.bumbleSSR(abspath);
  }
}
