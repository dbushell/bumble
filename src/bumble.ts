import {bundle} from './bundle.ts';
import {importBundle} from './module.ts';
import {compilerOptions} from './typescript.ts';
import {encodeHash} from './utils.ts';
import type {BumbleOptions, BumbleModule} from './types.ts';

export default class Bumble<M> {
  #dir: string;
  // #kvPath: string | undefined;
  #deployId: string | undefined;
  #dynamicImports: boolean;
  #typescript: BumbleOptions['typescript'];
  #cacheReady = false;

  constructor(dir: string, options?: BumbleOptions) {
    this.#dir = dir;
    // this.#kvPath = options?.kvPath ?? undefined;
    this.#deployId = options?.deployId ?? undefined;
    this.#dynamicImports = options?.dynamicImports ?? false;
    this.#typescript = {
      ...(options?.typescript ?? {}),
      ...compilerOptions
    };
  }

  get deployHash(): Promise<string> {
    return Promise.resolve(
      this.#deployId ? encodeHash(this.#deployId, 'SHA-1') : ''
    );
  }

  async bumbleDOM(abspath: string): Promise<string> {
    const options: BumbleOptions = {
      typescript: this.#typescript,
      svelte: {
        generate: 'dom'
      }
    };
    if (this.#deployId) {
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
    const options: BumbleOptions = {
      dynamicImports: this.#dynamicImports,
      typescript: this.#typescript
    };
    if (this.#deployId) {
      options.deployId = await this.deployHash;
      //   options.kvPath = this.#kvPath;
      //   await this.#readyCache();
    }
    const {code, external} = await bundle(this.#dir, abspath, options);
    const mod = await importBundle<M>(options, {code, external});
    return mod;
  }

  bumble(abspath: string): Promise<BumbleModule<M>> {
    return this.bumbleSSR(abspath);
  }

  /*
  #readyCache = async () => {
    if (this.#cacheReady) return;
    const hash = await this.deployHash;
    if (!hash) return;
    const db = await Deno.openKv(this.#kvPath);
    const entries = db.list({prefix: ['cache']});
    for await (const entry of entries) {
      if (!entry.key.includes(hash)) {
        await db.delete(entry.key);
      }
    }
    db.close();
    this.#cacheReady = true;
  };
  */
}
