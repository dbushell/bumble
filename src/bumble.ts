import {bundle} from './bundle.ts';
import {importBundle} from './module.ts';
import compilerOptions from './tsconfig.ts';
import type {BumbleOptions, BumbleModule} from './types.ts';

export default class Bumble {
  #dynamicImports: boolean;
  #compilerOptions: BumbleOptions['compilerOptions'];

  constructor(options?: BumbleOptions) {
    this.#dynamicImports = options?.dynamicImports ?? false;
    this.#compilerOptions = {
      ...(options?.compilerOptions ?? {}),
      ...compilerOptions
    };
  }

  async bumble(abspath: string): Promise<BumbleModule> {
    const options: BumbleOptions = {
      dynamicImports: this.#dynamicImports,
      compilerOptions: this.#compilerOptions
    };
    const {code, external} = await bundle(abspath, options);
    const mod = await importBundle(options, {code, external});
    return mod;
  }
}
