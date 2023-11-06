import {typescript, svelte} from './deps.ts';

export interface BumbleOptions {
  // Used to cache compiled routes
  // kvPath?: string;
  /** Used to cache compiled routes (will be hashed) */
  deployId?: string;
  /** Dynamic imports are faster and safer */
  dynamicImports?: boolean;
  /** TypeScript compiler options */
  typescript?: typescript.CompilerOptions;
  /** Svelte compiler options */
  svelte?: svelte.CompileOptions;
}

export interface BumbleBundle {
  /** Compiled and bundled code */
  code: string;
  /** List of external imports */
  external: Map<string, string[]>;
}

// Partial of `create_ssr_component` return type:
// https://github.com/sveltejs/svelte/blob/master/packages/svelte/src/runtime/internal/ssr.js
export interface BumbleComponent {
  render: (props?: Record<string, unknown>) => {
    html: string;
    css?: {code: string};
    head?: string;
  };
}

export type BumbleModule<M> = M & {
  default: BumbleComponent | CallableFunction;
};

declare global {
  interface Window {
    '📦': Record<string, unknown>;
  }
}
