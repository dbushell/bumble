import {svelte} from './deps.ts';
import Script from './script.ts';
import type {esbuildType} from './esbuild.ts';

export type Deferred<T> = ReturnType<typeof Promise.withResolvers<T>>;

export type SveltePreprocess =
  | svelte.PreprocessorGroup
  | svelte.PreprocessorGroup[];

export type EsbuildResolve =
  | null
  | void
  | undefined
  | esbuildType.OnResolveResult
  | Promise<EsbuildResolve>;

export type EsbuildMetafile = Exclude<
  esbuildType.BuildResult['metafile'],
  undefined
>;

export type BumbleOptions = {
  /** Debug output */
  dev?: boolean;
  /** Generate pre-built bundles */
  build?: boolean;
  /** Path of pre-built bundles */
  buildDir?: string;
  /** Dynamic imports are faster and safer */
  dynamicImports?: boolean;
};

export type BumbleBundleOptions = {
  /** Exclusive list of top-level bundle exports */
  filterExports?: string[];
  /** Svelte compiler options: https://svelte.dev/docs/svelte-compiler#types-compileoptions */
  svelteCompile?: svelte.CompileOptions;
  sveltePreprocess?:
    | SveltePreprocess
    | ((entry: string, options: BumbleBundleOptions) => SveltePreprocess);
  /** esbuild plugin resolve: https://esbuild.github.io/plugins/#on-resolve */
  esbuildResolve?: (args: esbuildType.OnResolveArgs) => EsbuildResolve;
  esbuildOptions?: esbuildType.BuildOptions;
};

export interface BumbleBundle {
  script: Script;
  metafile: esbuildType.Metafile;
}

// Partial of `create_ssr_component` return type:
// https://github.com/sveltejs/svelte/blob/master/packages/svelte/src/runtime/internal/ssr.js
export interface BumbleComponent {
  render: (
    props?: Record<string, unknown>,
    options?: {context?: Map<string, unknown>}
  ) => {
    html: string;
    css?: {code: string};
    head?: string;
  };
}

export type BumbleModule<M> = M & {
  default: BumbleComponent | CallableFunction;
};

export type ParseExportMap = Map<string, string>;

export type ParseImportMap = Map<string, Array<{alias: string; local: string}>>;
