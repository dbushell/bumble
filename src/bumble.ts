import {bundle} from './bundle.ts';
import {importBundle} from './module.ts';
import compilerOptions from './tsconfig.ts';
import {encodeHash} from './utils.ts';
import type {BumbleOptions, BumbleModule} from './types.ts';

export default class Bumble<M> {
  #kvPath: string | undefined;
  #deployId: string | undefined;
  #dynamicImports: boolean;
  #typescript: BumbleOptions['typescript'];
  #cacheReady = false;

  constructor(options?: BumbleOptions) {
    this.#kvPath = options?.kvPath ?? undefined;
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

  async bumble(abspath: string): Promise<BumbleModule<M>> {
    const options: BumbleOptions = {
      dynamicImports: this.#dynamicImports,
      typescript: this.#typescript
    };
    if (this.#deployId) {
      options.kvPath = this.#kvPath;
      options.deployId = await this.deployHash;
      if (!this.#cacheReady) {
        await this.#readyCache();
      }
    }
    const {code, external} = await bundle(abspath, options);
    const mod = await importBundle<M>(options, {code, external});
    return mod;
  }

  #readyCache = async () => {
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
}
