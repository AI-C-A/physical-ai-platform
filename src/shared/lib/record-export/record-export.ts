type ExportScalar = string | number | boolean | null;
export type ExportCell = ExportScalar | readonly ExportScalar[];
export type ExportRecord = Readonly<Record<string, ExportCell>>;

function escapeCsv(value: ExportCell): string {
  const text = value === null
    ? ''
    : Array.isArray(value)
      ? JSON.stringify(value)
      : typeof value === 'string' && /^[=+\-@\t\r\n＝＋－＠]/u.test(value)
        ? `'${value}`
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeCsv(records: readonly ExportRecord[]): string {
  const first = records[0];
  if (first === undefined) return '';
  const columns = Object.keys(first);
  const lines = [columns.map(escapeCsv).join(',')];
  records.forEach((record) => {
    lines.push(columns.map((column) => escapeCsv(record[column] ?? null)).join(','));
  });
  return `\uFEFF${lines.join('\r\n')}`;
}

export function serializeJson(records: readonly ExportRecord[]): string {
  return JSON.stringify(records, null, 2);
}

export function downloadTextFile(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
