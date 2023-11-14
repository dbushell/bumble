import {acorn} from '../deps.ts';
import type {ParseExportMap, ParseImportMap} from '../types.ts';

export const parseImports = (
  code: string
): {code: string; map: ParseImportMap} => {
  const ast = acorn.parse(code, {sourceType: 'module', ecmaVersion: 'latest'});
  const map: ParseImportMap = new Map();
  // Negative offset to track removed code
  let offset = 0;
  // Loop through all import statements
  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') {
      continue;
    }
    // Remove import statement
    code =
      code.substring(0, node.start + offset) +
      code.substring(node.end + offset);
    offset -= node.end - node.start;
    // Setup import map
    const from = map.get(node.source.value as string) ?? [];
    map.set(node.source.value as string, from);
    // Loop through named imports
    for (const specifier of node.specifiers) {
      // Handle default imports
      if (specifier.type === 'ImportDefaultSpecifier') {
        from.push({
          alias: 'default',
          local: specifier.local.name
        });
        continue;
      }
      // Handle namespace imports
      if (specifier.type === 'ImportNamespaceSpecifier') {
        from.push({
          alias: '*',
          local: specifier.local.name
        });
        continue;
      }
      // Handle named imports (type: ImportSpecifier)
      if (specifier.imported.type === 'Identifier') {
        from.push({
          alias: (specifier.imported as acorn.Identifier).name,
          local: specifier.local.name
        });
        continue;
      } else {
        console.warn('Unsupported ImportSpecifier Literal');
      }
      throw new Error('Unsupported Import');
    }
  }
  return {code, map};
};

export const parseExports = (
  code: string
): {code: string; map: ParseExportMap} => {
  const ast = acorn.parse(code, {sourceType: 'module', ecmaVersion: 'latest'});
  const map: ParseExportMap = new Map();
  // Negative offset to track removed code
  let offset = 0;
  // Loop through all export statements
  for (const node of ast.body) {
    if (!node.type.startsWith('Export')) {
      continue;
    }
    const removeNode = () => {
      code =
        code.substring(0, node.start + offset) +
        code.substring(node.end + offset);
      offset -= node.end - node.start;
    };
    // Handle default exports
    if (node.type === 'ExportDefaultDeclaration') {
      removeNode();
      if (node.declaration.type !== 'Identifier') {
        throw new Error('Unsupported ExportDefaultDeclaration');
      }
      map.set('default', (node.declaration as acorn.Identifier).name);
      continue;
    }
    // Handle named exports
    if (node.type === 'ExportNamedDeclaration') {
      // Handle declarations
      if (node.declaration) {
        let identifier: acorn.Identifier | undefined;
        if (node.declaration.type === 'VariableDeclaration') {
          identifier = node.declaration.declarations[0].id as acorn.Identifier;
        } else if (node.declaration.type === 'FunctionDeclaration') {
          identifier = node.declaration.id as acorn.Identifier;
        } else if (node.declaration.type === 'ClassDeclaration') {
          identifier = node.declaration.id as acorn.Identifier;
        }
        if (!identifier) {
          throw new Error('Unsupported ExportNamedDeclaration');
        }
        map.set(identifier.name, identifier.name);
        // Remove just the "export" keyword
        const length = node.declaration.start - node.start;
        code =
          code.substring(0, node.start + offset) +
          code.substring(node.declaration.start + offset);
        offset -= length;
      }
      // Handle specifiers
      else if (node.specifiers) {
        removeNode();
        for (const specifier of node.specifiers) {
          if (specifier.exported.type !== 'Identifier') {
            console.warn('Unsupported ExportNamedDeclaration');
          }
          if (specifier.local.type !== 'Identifier') {
            console.warn('Unsupported ExportNamedDeclaration');
          }
          map.set(
            (specifier.exported as acorn.Identifier).name,
            (specifier.local as acorn.Identifier).name
          );
        }
      }
      continue;
    }
    // Handle all exports
    if (node.type === 'ExportAllDeclaration') {
      throw new Error('Unsupported ExportAllDeclaration');
    }
    throw new Error('Unsupported Export');
  }
  return {code, map};
};

export const filterExports = (
  code: string,
  exports: ParseExportMap,
  allowed: string[]
): string => {
  const parsed = parseExports(code);
  code = parsed.code;
  const ast = acorn.parse(code, {sourceType: 'module', ecmaVersion: 'latest'});
  // Negative offset to track removed code
  let offset = 0;
  // Invert export map to lookup local names
  const localMap = new Map<string, string>();
  exports.forEach((v, k) => localMap.set(v, k));
  for (const node of ast.body) {
    const locals: string[] = [];
    if (node.type === 'VariableDeclaration') {
      // TODO: handle multiple declarations?
      node.declarations.forEach((d) => {
        locals.push((d.id as acorn.Identifier).name);
      });
    } else if (node.type === 'FunctionDeclaration') {
      locals.push(node.id.name);
    } else if (node.type === 'ClassDeclaration') {
      locals.push(node.id.name);
    }
    for (const name of locals) {
      if (!localMap.has(name)) {
        continue;
      }
      if (allowed.includes(localMap.get(name)!)) {
        continue;
      }
      code =
        code.substring(0, node.start + offset) +
        code.substring(node.end + offset);
      offset -= node.end - node.start;
      break;
    }
  }
  return code;
};
