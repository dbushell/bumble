import type * as esbuildType from 'https://deno.land/x/esbuild@v0.19.6/mod.d.ts';

export type {esbuildType};

let esbuild: typeof esbuildType | undefined;

export const esbuildStart = async () => {
  if (esbuild) {
    return esbuild;
  }
  const wasm = Deno.env.has('DENO_REGION');
  esbuild = wasm
    ? await import('https://deno.land/x/esbuild@v0.19.6/wasm.js')
    : await import('https://deno.land/x/esbuild@v0.19.6/mod.js');
  await esbuild.initialize({
    worker: false
  });
  return esbuild;
};

export const esbuildStop = () => {
  if (esbuild) {
    esbuild.stop();
  }
};

export * from './minify.ts';
