import {typescript} from '../deps.ts';

export const compilerOptions: typescript.CompilerOptions = {
  module: typescript.ModuleKind.ESNext,
  target: typescript.ScriptTarget.ESNext,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  skipLibCheck: true,
  sourceMap: false
};

export const transpileTs = (
  code: string,
  options?: typescript.CompilerOptions
) => {
  const result = typescript.transpileModule(code, {
    compilerOptions: {
      ...options,
      ...compilerOptions
    }
  });
  return result.outputText;
};
