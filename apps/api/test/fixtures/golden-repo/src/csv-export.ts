/**
 * Serialises rows to CSV. The interesting part is escaping: a field is
 * quoted when it contains a comma, a quote or a newline, and any quote inside
 * it is doubled, which is what RFC 4180 readers such as Excel expect.
 */
export function toCsv(rows: Record<string, string>[], columns: string[]): string {
  const lines = [columns.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeField(row[column] ?? '')).join(','));
  }
  return lines.join('\r\n');
}

function escapeField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
