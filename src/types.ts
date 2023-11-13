import {typescript, svelte} from './deps.ts';

export interface BumbleOptions {
  [key: PropertyKey]: unknown;
  /** Debug output */
  dev?: boolean;
  /** Used to cache compiled routes (will be hashed) */
  deployId?: string;
  /** Dynamic imports are faster and safer */
  dynamicImports?: boolean;
  /** Exclusive list of top-level bundle exports */
  filterExports?: string[];
  /** TypeScript compiler options */
  typescript?: typescript.CompilerOptions;
  /** Svelte compiler options */
  svelte?: svelte.CompileOptions;
}

export interface BumbleManifest {
  dir: string;
  entry: string;
  dependencies: Map<string, string[]>;
  external: Map<string, string[]>;
}

export interface BumbleBundle {
  code: string;
  manifest: BumbleManifest;
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

export interface CompileProps {
  entry: string;
  options: BumbleOptions;
  manifest: BumbleManifest;
  imports: Set<string>;
  external: Array<{
    from: string;
    names: Array<{alias: string; local: string}>;
  }>;
}

declare global {
  interface Window {
    '📦': Record<string, unknown>;
  }
}
