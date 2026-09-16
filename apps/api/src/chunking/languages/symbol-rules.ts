import type { TSNode } from '../parsers/tree-sitter-node';

export interface SymbolMatch {
  name: string;
}

const NAMED_DECLARATIONS = new Set([
  'function_declaration',
  'function_definition',
  'class_declaration',
  'class_definition',
  'method_definition',
]);

const VARIABLE_DECLARATIONS = new Set(['lexical_declaration', 'variable_declaration']);

const FUNCTION_VALUES = new Set(['arrow_function', 'function_expression']);

/**
 * Decides whether a top-level node names a symbol worth using as a chunk
 * label, and what to call it. Null means "no name" - the node still becomes
 * (part of) a chunk, it just isn't labelled.
 *
 * Deliberately conservative: function/class/method declarations and the
 * `const foo = () => {...}` pattern only. Imports, type aliases and plain
 * statements are unnamed filler between symbols, which is what they should be.
 */
export function matchSymbol(node: TSNode, language: string): SymbolMatch | null {
  if (node.type === 'export_statement') return matchExported(node, language);
  if (NAMED_DECLARATIONS.has(node.type)) return matchNamedDeclaration(node);
  if (VARIABLE_DECLARATIONS.has(node.type)) return matchFunctionVariable(node);
  if (language === 'python' && node.type === 'decorated_definition') {
    return matchDecorated(node, language);
  }
  return null;
}

/** `export function/class/const ...` - match what is being exported. */
function matchExported(node: TSNode, language: string): SymbolMatch | null {
  const inner = node.namedChildren[0];
  return inner ? matchSymbol(inner, language) : null;
}

function matchNamedDeclaration(node: TSNode): SymbolMatch | null {
  const nameNode = node.childForFieldName('name');
  return nameNode ? { name: nameNode.text } : null;
}

/** `const foo = () => {}` / `const foo = function () {}` - the first function-valued declarator. */
function matchFunctionVariable(node: TSNode): SymbolMatch | null {
  for (const declarator of node.namedChildren) {
    if (declarator.type !== 'variable_declarator') continue;
    const value = declarator.childForFieldName('value');
    const nameNode = declarator.childForFieldName('name');
    if (value && nameNode && FUNCTION_VALUES.has(value.type)) return { name: nameNode.text };
  }
  return null;
}

/** Python `@decorator` + def/class: the definition is the last named child. */
function matchDecorated(node: TSNode, language: string): SymbolMatch | null {
  const definition = node.namedChildren.at(-1);
  return definition ? matchSymbol(definition, language) : null;
}
