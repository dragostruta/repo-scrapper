export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Cursor-based pagination. The cursor is the opaque, base64-encoded id of the
 * last item on the page, so results stay stable when rows are inserted while
 * a client is paging - which is the failure offset/limit paging has.
 */
export function buildPage<T extends { id: string }>(rows: T[], pageSize: number): Page<T> {
  const items = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? Buffer.from(last.id).toString('base64url') : null,
  };
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf-8');
}
