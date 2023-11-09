import {acorn} from '../deps.ts';
import type {ParseExportMap, ParseImportMap} from '../types.ts';

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
    // Remove the entire export statement
    let removeNode = false;
    // Handle default exports
    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration.type !== 'Identifier') {
        throw new Error('Unsupported ExportDefaultDeclaration');
      }
      map.set('default', (node.declaration as acorn.Identifier).name);
      removeNode = true;
    }
    // Handle named exports
    else if (node.type === 'ExportNamedDeclaration') {
      // Handle declarations
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          const {name} = node.declaration.declarations[0]
            .id as acorn.Identifier;
          map.set(name, name);
        } else if (node.declaration.type === 'FunctionDeclaration') {
          const {name} = node.declaration.id as acorn.Identifier;
          map.set(name, name);
        } else if (node.declaration.type === 'ClassDeclaration') {
          const {name} = node.declaration.id as acorn.Identifier;
          map.set(name, name);
        }
        // Remove just the "export" keyword
        const length = node.declaration.start - node.start;
        code =
          code.substring(0, node.start + offset) +
          code.substring(node.declaration.start + offset);
        offset -= length;
      }
      // Handle specifiers
      else if (node.specifiers) {
        removeNode = true;
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
    }
    // Handle all exports
    else if (node.type === 'ExportAllDeclaration') {
      throw new Error('Export all not supported');
    }
    // Remove full export statement
    if (removeNode) {
      code =
        code.substring(0, node.start + offset) +
        code.substring(node.end + offset);
      offset -= node.end - node.start;
    }
  }
  return {code, map};
};

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
    }
  }
  return {code, map};
};
