import {path} from './deps.ts';
import {parseExports, parseImports, stripExports} from './acorn/mod.ts';
import type {ParseExportMap, ParseImportMap} from './types.ts';

const supportedExtensions = ['.svelte', '.ts', '.js', '.json'];

interface CodeOptions {
  exports?: boolean | string[];
  exportType: 'module' | 'function';
}

export default class Script {
  #code: string;
  #imports: ParseImportMap;
  #exports: ParseExportMap;

  constructor(code: string) {
    this.#code = code;
    ({code: this.#code, map: this.#imports} = parseImports(this.#code));
    ({code: this.#code, map: this.#exports} = parseExports(this.#code));
  }

  get imports() {
    return this.#imports;
  }

  get exports() {
    return this.#exports;
  }

  /** Combine all (or specific) exports into one `export` statement */
  serializeModule(exports?: CodeOptions['exports']) {
    if (exports === false) return 'export {};';
    const parts = [];
    for (const [alias, name] of this.#exports) {
      if (
        exports === true ||
        (Array.isArray(exports) && exports.includes(alias))
      ) {
        parts.push(alias === name ? name : `${name} as ${alias}`);
      }
    }
    return `export { ${parts.join(', ')} };`;
  }

  /** Combine all (or specific) exports into one `return` statement */
  serializeFunction(exports?: CodeOptions['exports']) {
    if (exports === false) return 'return {};';
    const parts = [];
    for (const [alias, name] of this.#exports) {
      if (
        exports === true ||
        (Array.isArray(exports) && exports.includes(alias))
      ) {
        parts.push(alias === name ? name : `${alias} : ${name}`);
      }
    }
    return `return { ${parts.join(', ')} };`;
  }

  /** Serialize script with optional exports */
  serialize(options: CodeOptions = {exportType: 'module'}) {
    let code = this.#code;
    if (Array.isArray(options.exports)) {
      code = stripExports(code, this.#exports, options.exports);
    }
    if (options.exports) {
      if (options.exportType === 'module') {
        code += `\n${this.serializeModule(options.exports)}\n`;
      }
      if (options.exportType === 'function') {
        code += `\n${this.serializeFunction(options.exports)}\n`;
      }
    }
    return code;
  }

  static supportedType(entry: string) {
    const ext = path.extname(entry);
    return supportedExtensions.includes(ext);
  }
}
