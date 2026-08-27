function readDateParts(value: string): readonly [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) return null;
  return [year, monthIndex, day];
}

export function formatLocalDateInput(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateStart(value: string): number | null {
  const parts = readDateParts(value);
  if (parts === null) return null;
  return new Date(parts[0], parts[1], parts[2]).getTime();
}

export function parseLocalDateEnd(value: string): number | null {
  const parts = readDateParts(value);
  if (parts === null) return null;
  return new Date(parts[0], parts[1], parts[2] + 1).getTime() - 1;
}
