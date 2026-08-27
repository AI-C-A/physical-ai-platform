const ESCAPED_SEGMENT_PREFIX = '~id~';
const HEX_PAIR_PATTERN = /^[0-9a-f]*$/u;

function encodeUtf8AsHex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function decodeUtf8Hex(value: string): string | null {
  if (value.length % 2 !== 0 || !HEX_PAIR_PATTERN.test(value)) return null;

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodePathSegment(segment: string): string {
  const needsEscape =
    segment.length === 0 ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('%') ||
    segment.startsWith(ESCAPED_SEGMENT_PREFIX);

  return needsEscape
    ? `${ESCAPED_SEGMENT_PREFIX}${encodeUtf8AsHex(segment)}`
    : encodeURIComponent(segment);
}

export function decodePathSegment(segment: string): string {
  if (!segment.startsWith(ESCAPED_SEGMENT_PREFIX)) return segment;

  const decoded = decodeUtf8Hex(segment.slice(ESCAPED_SEGMENT_PREFIX.length));
  return decoded ?? segment;
}

export function appendPathSegment(basePath: string, segment: string): string {
  return `${basePath.replace(/\/+$/u, '')}/${encodePathSegment(segment)}`;
}
