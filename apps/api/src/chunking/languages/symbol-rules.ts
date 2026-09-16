import type { TSNode } from '../parsers/tree-sitter-node';

export interface SymbolMatch {
  name: string;
}

/**
 * Given a top-level node, decides whether it names a symbol worth using as a
 * chunk boundary/label, and if so what to call it. Returning null means "not
 * a named symbol" - the node still becomes a chunk (or gets merged with
 * neighbours), it just has no symbol name attached.
 *
 * Deliberately conservative: only function/class/method declarations and the
 * `const foo = () => {...}` pattern are recognised. Anything else (imports,
 * type aliases, plain statements) is treated as unnamed filler between
 * symbols, which is exactly what you want it to be.
 */
export function matchSymbol(node: TSNode, language: string): SymbolMatch | null {
  // Unwrap `export function/class/const ...` one level before matching.
  if (node.type === 'export_statement') {
    const inner = node.namedChildren[0];
    return inner ? matchSymbol(inner, language) : null;
  }

  switch (node.type) {
    case 'function_declaration':
    case 'function_definition':
    case 'class_declaration':
    case 'class_definition':
    case 'method_definition': {
      const nameNode = node.childForFieldName('name');
      return nameNode ? { name: nameNode.text } : null;
    }
    case 'lexical_declaration':
    case 'variable_declaration': {
      // const foo = () => {} / const foo = function () {}
      for (const declarator of node.namedChildren) {
        if (declarator.type !== 'variable_declarator') continue;
        const value = declarator.childForFieldName('value');
        if (!value) continue;
        if (value.type === 'arrow_function' || value.type === 'function_expression') {
          const nameNode = declarator.childForFieldName('name');
          if (nameNode) return { name: nameNode.text };
        }
      }
      return null;
    }
    default:
      return language === 'python' && node.type === 'decorated_definition'
        ? matchSymbol(node.namedChildren[node.namedChildren.length - 1], language)
        : null;
  }
}
