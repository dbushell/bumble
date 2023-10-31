import {typescript} from './deps.ts';

// TypeScript compiler options
export default {
  module: typescript.ModuleKind.ESNext,
  target: typescript.ScriptTarget.ESNext,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  skipLibCheck: true,
  sourceMap: false
};
