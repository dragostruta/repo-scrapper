/**
 * The slice of web-tree-sitter's Node/Tree API this module actually uses.
 * Kept narrow and local rather than importing the library's own types,
 * because those types have moved between the library's major versions and
 * this project only touches a handful of fields.
 */
export interface TSPoint {
  row: number;
  column: number;
}

export interface TSNode {
  type: string;
  startPosition: TSPoint;
  endPosition: TSPoint;
  text: string;
  namedChildren: TSNode[];
  childForFieldName(name: string): TSNode | null;
}

export interface TSTree {
  rootNode: TSNode;
}

export interface TSParser {
  parse(input: string): TSTree | null;
}
