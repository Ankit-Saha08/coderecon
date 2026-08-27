/**
 * Binary heuristic on the first 8 KB: any NUL byte is conclusive;
 * otherwise a high ratio of control characters. UTF-8 continuation
 * bytes (>= 0x80) are NOT counted, so non-English text stays "text".
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  if (n === 0) return false;
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32) || b === 127) control++;
  }
  return control / n > 0.3;
}

const BOMS: Array<[number[], string]> = [
  [[0xef, 0xbb, 0xbf], 'utf-8'],
  [[0xff, 0xfe], 'utf-16le'],
  [[0xfe, 0xff], 'utf-16be'],
];

export function detectBom(bytes: Uint8Array): { encoding: string; offset: number } | null {
  for (const [sig, encoding] of BOMS) {
    if (bytes.length >= sig.length && sig.every((s, i) => bytes[i] === s)) {
      return { encoding, offset: sig.length };
    }
  }
  return null;
}

/** Strict UTF-8 decode; returns null if the bytes aren't valid text. */
export function decodeText(bytes: Uint8Array): { text: string; hadBom: boolean } | null {
  const bom = detectBom(bytes);
  const encoding = bom?.encoding ?? 'utf-8';
  const body = bom ? bytes.subarray(bom.offset) : bytes;
  try {
    return { text: new TextDecoder(encoding, { fatal: true }).decode(body), hadBom: !!bom };
  } catch {
    return null;
  }
}

export type LineEnding = 'LF' | 'CRLF' | 'MIXED' | 'NONE';

export function detectLineEnding(text: string): LineEnding {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf && lf) return 'MIXED';
  if (crlf) return 'CRLF';
  if (lf) return 'LF';
  return 'NONE';
}

export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Comparison key that ignores every whitespace-only difference:
 * line endings, trailing spaces, indentation, blank lines,
 * and a missing final newline.
 */
export function whitespaceKey(text: string): string {
  return normalizeEol(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export function splitLines(text: string): string[] {
  return normalizeEol(text).split('\n');
}

/** True if every line of `inner` appears in `outer` in order (pure addition). */
export function isSubsequenceOfLines(inner: string, outer: string): boolean {
  const a = splitLines(inner).map((l) => l.trim()).filter(Boolean);
  const b = splitLines(outer).map((l) => l.trim()).filter(Boolean);
  if (a.length === 0) return true;
  if (a.length > b.length) return false;
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
  return i === a.length;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}