import {path} from './deps.ts';
import {parseExports, parseImports, filterExports} from './acorn.ts';
import type {
  BumbleBundleOptions,
  ParseExportMap,
  ParseImportMap
} from './types.ts';

const supportedExtensions = ['.svelte', '.ts', '.js', '.json'];

interface CodeOptions {
  imports?: boolean;
  exports?: boolean;
  filterExports?: BumbleBundleOptions['filterExports'];
}

export default class Script {
  #code: string;
  #entry: string;
  #dir: string;
  #prefix: string[] = [];
  #suffix: string[] = [];
  #imports: ParseImportMap;
  #exports: ParseExportMap;

  constructor(code: string, entry: string, dir: string) {
    this.#code = code;
    this.#entry = entry;
    this.#dir = dir;
    ({code: this.#code, map: this.#imports} = parseImports(this.#code));
    ({code: this.#code, map: this.#exports} = parseExports(this.#code));
  }

  get imports() {
    return this.#imports;
  }

  get exports() {
    return this.#exports;
  }

  get localImports() {
    const map: ParseImportMap = new Map();
    for (let [from, names] of this.#imports) {
      if (from.startsWith('@')) {
        from = path.resolve(this.#dir, from.slice(1));
      }
      if (/^(file|https):/.test(from)) {
        map.set(from, names);
        continue;
      }
      if ((/^(\.|\/)/.test(from) && Script.supportedType(from)) === false) {
        continue;
      }
      map.set(path.resolve(path.dirname(this.#entry), from), names);
    }
    return map;
  }

  get externalImports() {
    const map: ParseImportMap = new Map();
    for (const [from, names] of this.#imports) {
      if (/^(file|https):/.test(from)) {
        continue;
      }
      if (/^(\.|\/|@)/.test(from)) {
        continue;
      }
      map.set(from, names);
    }
    return map;
  }

  append(code: string) {
    this.#suffix.push(code);
  }

  prepend(code: string) {
    this.#prefix.push(code);
  }

  getExport(allowed?: CodeOptions['filterExports']) {
    const parts = [];
    for (const [alias, name] of this.#exports) {
      if (allowed?.includes(alias) === false) continue;
      parts.push(alias === name ? name : `${name} as ${alias}`);
    }
    return `export { ${parts.join(', ')} };`;
  }

  getCode(options: CodeOptions = {}) {
    let code = this.#prefix.toReversed().join('\n');
    code += `\n${this.#code}\n`;
    code += this.#suffix.join('\n');
    if (options.filterExports) {
      code = filterExports(code, this.#exports, options.filterExports);
    }
    if (options.exports) {
      code += `\n${this.getExport(options.filterExports)}\n`;
    }
    return code;
  }

  static supportedType(entry: string) {
    const ext = path.extname(entry);
    return supportedExtensions.includes(ext);
  }
}
