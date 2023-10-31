import {path, svelte, typescript} from './deps.ts';
import {sveltePreprocess} from './preprocess.ts';
import compilerOptions from './tsconfig.ts';
import type {BumbleBundle, BumbleOptions} from './types.ts';

interface Bumbler {
  imports: Set<string>;
  svelteImports: string[];
  unknownImports: string[];
  options?: BumbleOptions;
}

/** Return unique path for imported file */
const getPath = (entry: string) => {
  return path.relative(Deno.cwd(), entry);
};

/** Return the imported file or component name */
const getName = (entry: string) => {
  const ext = path.extname(entry);
  let name = path.basename(entry, ext);
  if (ext === '.svelte') {
    name = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  return name;
};

/** Recursively compile and bundle files */
const compile = async (
  entry: string,
  bumbler: Bumbler,
  depth = 0
): Promise<string> => {
  let code = await Deno.readTextFile(entry);

  // Check if already compiled
  if (bumbler.imports.has(getPath(entry))) {
    throw new Error(`Already compiled (${entry})`);
  }
  bumbler.imports.add(getPath(entry));

  // Handle Svelte components
  if (entry.endsWith('.svelte')) {
    if (code.includes('lang="ts"')) {
      code = await sveltePreprocess(code, bumbler.options);
    }
    const result = svelte.compile(code, {
      generate: 'ssr',
      name: getName(entry),
      immutable: true,
      discloseVersion: false,
      enableSourcemap: false,
      css: 'none'
    });
    code = result.js.code;

    // Handle JS and TypeScript
  } else if (/\.(ts|js)$/.test(entry)) {
    if (entry.endsWith('.ts')) {
      const result = typescript.transpileModule(code, {
        compilerOptions: {
          ...bumbler.options?.compilerOptions,
          ...compilerOptions
        }
      });
      code = result.outputText;
    }

    // TODO: Handle JSON?
  } else {
    throw new Error(`Unknown extension (${entry})`);
  }

  // Check for default export (must be single variable export)
  if (!/^\s*export\s+default\s+(\w+)\s*;/gm.test(code)) {
    throw new Error(`No default export (${entry})`);
  }

  const newLines = [];
  if (depth === 0) {
    newLines.push(`globalThis['🥡'] = new Map();`);
  }

  // Iterate over code lines
  for (const line of code.split('\n')) {
    // Ignore non import statements
    if (line.trim().startsWith('import') === false) {
      newLines.push(line);
      continue;
    }
    let [, name, mod] =
      line.match(/import\s+(.*?)\s+from\s+["|']([^"|']+)["|']/) ?? [];
    if (!name) {
      throw new Error(`Invalid import (${entry})`);
    }

    // Resolve paths using tsconfig.json
    const paths = bumbler.options?.compilerOptions?.paths;
    if (paths) {
      for (let [key, [value]] of Object.entries(paths)) {
        key = key.replace(/\*$/, '');
        value = value.replace(/\*$/, '');
        if (mod.startsWith(key)) {
          mod = mod.replace(new RegExp(`^${key}`), value);
        }
      }
    }

    if (mod.startsWith('svelte')) {
      bumbler.svelteImports.push(line);
      continue;
    }

    // Handle relative imports
    if (/^(\.|\/)/.test(mod) && /\.(svelte|ts|js)$/.test(entry)) {
      const newEntry = path.resolve(path.dirname(entry), mod);
      const absName = getPath(newEntry);
      // Check if import was already compiled
      if (bumbler.imports.has(absName)) {
        newLines.push(`const ${name} = globalThis['🥡'].get('${absName}');`);
        continue;
      }
      // Otherwise, compile and bundle
      let newCode = await compile(newEntry, bumbler, depth + 1);
      newCode = newCode.replace(
        /^\s*export\s+default\s+(.+?)\s*;\s*$/m,
        `globalThis['🥡'].set('${absName}', $1);`
      );
      newLines.push(`/* ${absName} */\n{${newCode}}`);
      newLines.push(`const ${name} = globalThis['🥡'].get('${absName}');`);
      continue;
    }

    // TODO: Handle unknown imports?
    bumbler.unknownImports.push(line);
  }
  return newLines.join('\n');
};

export const bundle = async (
  entry: string,
  options?: BumbleOptions
): Promise<BumbleBundle> => {
  // Start new bundle
  const bumbler: Bumbler = {
    imports: new Set(),
    svelteImports: [],
    unknownImports: [],
    options
  };
  // Compile from main entry
  const code = await compile(entry, bumbler);
  // Merge external Svelte imports
  const external = new Map<string, string[]>();
  for (const line of bumbler.svelteImports) {
    const from = line.match(/from\s+["|']([^"|']+)["|']/);
    if (!from) continue;
    const imports = line.match(/import\s+\{(.+?)\}/);
    if (!imports) continue;
    let arr = external.get(from?.[1]) || [];
    arr = [...arr, ...imports?.[1].split(', ').map((i) => i.trim())];
    external.set(from?.[1], [...new Set(arr)]);
  }
  return {code, external};
};
