import type {CompilerOptions} from './deps.ts';

export interface BumbleOptions {
  /** Dynamic imports are faster and safer */
  dynamicImports?: boolean;
  /** TypeScript compiler options (e.g. `paths`) */
  compilerOptions?: CompilerOptions;
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

export interface BumbleModule {
  default: BumbleComponent | CallableFunction;
}
