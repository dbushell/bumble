import {typescript} from './deps.ts';

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

export const resolveModule = (
  name: string,
  paths: Exclude<typescript.CompilerOptions['paths'], undefined>
) => {
  for (let [key, [value]] of Object.entries(paths)) {
    key = key.replace(/\*$/, '');
    value = value.replace(/\*$/, '');
    if (name.startsWith(key)) {
      name = name.replace(new RegExp(`^${key}`), value);
    }
  }
  return name;
};
