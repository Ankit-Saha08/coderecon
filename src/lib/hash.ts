const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * crypto.subtle needs a secure context. localhost and https qualify;
 * opening index.html via file:// does not. Fall back to a fast
 * non-cryptographic hash so the tool still works offline from disk.
 */
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const copy = bytes.slice();                       // detached-buffer safe
      return hex(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
    } catch {
      /* fall through */
    }
  }
  return fnv1a128(bytes);
}

function fnv1a128(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (b + i), 2246822519) >>> 0;
    h3 = Math.imul(h3 ^ (b ^ (i << 3)), 3266489917) >>> 0;
    h4 = Math.imul(h4 ^ (b + (i >>> 2)), 668265263) >>> 0;
  }
  const p = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `fnv-${p(h1)}${p(h2)}${p(h3)}${p(h4)}-${bytes.length}`;
}