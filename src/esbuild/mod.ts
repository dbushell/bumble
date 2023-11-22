const wasm = Deno.env.has('DENO_REGION');
const esbuild = wasm
  ? await import('https://deno.land/x/esbuild@v0.19.6/wasm.js')
  : await import('https://deno.land/x/esbuild@v0.19.6/mod.js');

await esbuild.initialize({
  worker: false
});

export default esbuild;

export const esbuildStop = () => esbuild.stop();

export * from './minify.ts';
