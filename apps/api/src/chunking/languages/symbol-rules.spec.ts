import type { TSNode } from '../parsers/tree-sitter-node';
import { matchSymbol } from './symbol-rules';

/** Minimal tree-sitter node: `fields` backs childForFieldName(). */
function node(
  type: string,
  opts: { text?: string; children?: TSNode[]; fields?: Record<string, TSNode> } = {},
): TSNode {
  return {
    type,
    text: opts.text ?? '',
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    namedChildren: opts.children ?? [],
    childForFieldName: (name) => opts.fields?.[name] ?? null,
  };
}

const identifier = (name: string) => node('identifier', { text: name });

describe('matchSymbol', () => {
  it.each([
    'function_declaration',
    'class_declaration',
    'method_definition',
    'function_definition',
    'class_definition',
  ])('names a %s by its name field', (type) => {
    expect(
      matchSymbol(node(type, { fields: { name: identifier('doThing') } }), 'typescript'),
    ).toEqual({
      name: 'doThing',
    });
  });

  it('returns null for a declaration without a name', () => {
    expect(matchSymbol(node('function_declaration'), 'typescript')).toBeNull();
  });

  it('unwraps an export statement', () => {
    const fn = node('function_declaration', { fields: { name: identifier('exported') } });
    expect(matchSymbol(node('export_statement', { children: [fn] }), 'typescript')).toEqual({
      name: 'exported',
    });
  });

  it('returns null for an empty export statement', () => {
    expect(matchSymbol(node('export_statement'), 'typescript')).toBeNull();
  });

  it('names `const foo = () => {}` and `const foo = function () {}`', () => {
    for (const valueType of ['arrow_function', 'function_expression']) {
      const declarator = node('variable_declarator', {
        fields: { name: identifier('handler'), value: node(valueType) },
      });
      const declaration = node('lexical_declaration', { children: [declarator] });
      expect(matchSymbol(declaration, 'javascript')).toEqual({ name: 'handler' });
    }
  });

  it('ignores variables that are not functions', () => {
    const declarator = node('variable_declarator', {
      fields: { name: identifier('config'), value: node('object') },
    });
    expect(
      matchSymbol(node('lexical_declaration', { children: [declarator] }), 'typescript'),
    ).toBeNull();
  });

  it('finds the first function-valued declarator among several', () => {
    const plain = node('variable_declarator', {
      fields: { name: identifier('a'), value: node('number') },
    });
    const fn = node('variable_declarator', {
      fields: { name: identifier('b'), value: node('arrow_function') },
    });
    expect(
      matchSymbol(node('variable_declaration', { children: [plain, fn] }), 'javascript'),
    ).toEqual({
      name: 'b',
    });
  });

  it('names a decorated Python definition after the definition, not the decorator', () => {
    const decorator = node('decorator', { text: '@app.route' });
    const def = node('function_definition', { fields: { name: identifier('index') } });
    expect(
      matchSymbol(node('decorated_definition', { children: [decorator, def] }), 'python'),
    ).toEqual({
      name: 'index',
    });
  });

  it('only treats decorated_definition specially for Python', () => {
    const def = node('function_definition', { fields: { name: identifier('index') } });
    expect(matchSymbol(node('decorated_definition', { children: [def] }), 'typescript')).toBeNull();
  });

  it('returns null for imports and other statements', () => {
    expect(matchSymbol(node('import_statement'), 'typescript')).toBeNull();
  });
});
