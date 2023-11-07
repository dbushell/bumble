// Remove newlines and excess whitespace
export const shrinkLine = (code: string) => {
  code = code.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  return code;
};

// Reduce statements to one line for easier parsing
export const shrinkCode = (code: string) => {
  // Remove commented statements
  code = code.replace(/^\s*\/\/\s*(im|ex)port(.*?)$/gm, '');
  // Shrink import/export "from" statements
  code = code.replace(
    // /^|\s*(im|ex)port(.*?)from(.+?);\s*/gs,
    /\s*(im|ex)port(.+?)from\s*['"](.+?)['"]\s*;\s*/gs,
    (m) => `\n${shrinkLine(m)}\n`
  );
  // Shrink export lists
  code = code.replace(
    /\s*export\s*{[^}]+?}\s*;\s*/gs,
    (m) => `\n${shrinkLine(m)}\n`
  );
  // Shrink default exports
  code = code.replace(
    /\s*export\s+default\s+[^;{]+?;\s*/gs,
    (m) => `\n${shrinkLine(m)}\n`
  );
  // Shrink named exports
  code = code.replace(
    /\s*export\s+(let|const|class|function)\s+(.*?)\s*/gs,
    (m) => `\n${shrinkLine(m)} `
  );
  return code;
};

// Return code in two buckets based on regexp
export const splitLines = (
  code: string,
  regexp: RegExp,
  validate?: (line: string) => boolean
): [string[], string[]] => {
  const pass = [];
  const fail = [];
  for (const line of code.split('\n')) {
    if (regexp.test(line) && (!validate || validate(line))) {
      pass.push(line);
    } else {
      fail.push(line);
    }
  }
  return [pass, fail];
};

// Parse a single export statement
export const parseExport = (code: string): string | string[] => {
  if (/^\s*export\s+/.test(code) === false) {
    return [];
  }
  const defaultPattern = /^\s*export\s+default\s+(.+?)\s*;/.exec(code);
  if (defaultPattern) {
    return defaultPattern[1];
  }
  const namedPattern = /\s*{(.+?)\}\s*/.exec(code);
  if (namedPattern) {
    return namedPattern[1].split(',').map((n) => n.trim());
  }
  throw new Error(`Unsupported export (${code})`);
};

// Parse a single import statement
export const parseImport = (code: string): [string[], string] => {
  if (/^\s*import\s+/.test(code) === false) {
    return [[], ''];
  }
  const names: string[] = [];
  // RegExp to get module name
  const lineEnd = /('|")(.+?)\1\s*;/;
  // Get import names and module
  const importIndex = code.indexOf('import');
  const fromIndex = code.lastIndexOf(' from ');
  let namePart = code.substring(importIndex + 6, fromIndex).trim();
  let from = fromIndex > 0 ? code.substring(fromIndex + 6).trim() : '';
  // No named imports
  if (!from && lineEnd.test(namePart)) {
    from = namePart;
    namePart = '';
  }
  from = lineEnd.exec(from)?.[2].trim()!;
  if (!from) {
    throw new Error(`Invalid import (${code})`);
  }
  if (!namePart) {
    throw new Error(`Unnamed imports not supported (${code})`);
  }
  if (namePart.includes('*') || /\s+as\s+/.test(namePart)) {
    throw new Error(`Aliased imports not supported (${code})`);
  }
  // Default import
  if (/^[\w$]+$/.test(namePart)) {
    names.push(namePart);
  }
  // Named imports
  const named = /\s*{(.+?)\}\s*/.exec(namePart);
  if (named) {
    names.push(...named[1].split(',').map((n) => n.trim()));
  }
  if (names.length === 0) {
    throw new Error(`Unsupported import (${code})`);
  }
  return [names, from];
};

export const validateImport = (line: string) => {
  try {
    parseImport(line);
    return true;
  } catch {
    return false;
  }
};
