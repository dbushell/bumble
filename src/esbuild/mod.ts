const esbuild = Deno.env.has('DENO_REGION')
  ? await import('https://deno.land/x/esbuild@v0.19.6/wasm.js')
  : await import('https://deno.land/x/esbuild@v0.19.6/mod.js');

export default esbuild;

export * from './minify.ts';
