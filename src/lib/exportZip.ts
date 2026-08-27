import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { AssemblyPlan } from './assemble';

export interface ZipBuildOptions {
  rootFolderName: string;
  extras?: Array<{ path: string; content: string }>;
  onProgress?: (percent: number, currentFile?: string) => void;
}

export async function buildZipBlob(plan: AssemblyPlan, opts: ZipBuildOptions): Promise<Blob> {
  const zip = new JSZip();
  const root = opts.rootFolderName.trim().replace(/^\/+|\/+$/g, '');
  const at = (p: string) => (root ? `${root}/${p}` : p);

  for (const f of plan.files) {
    // JSZip accepts a File/Blob directly — no decode, no re-encode, byte-exact.
    if (f.raw) zip.file(at(f.path), f.raw);
    else if (f.bytes) zip.file(at(f.path), f.bytes);
  }

  for (const extra of opts.extras ?? []) {
    zip.file(extra.path, extra.content);
  }

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (m) => opts.onProgress?.(Math.round(m.percent), m.currentFile ?? undefined),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  saveAs(new Blob([text], { type: mime }), filename);
}

export const timestamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/* ---------- Optional: write straight to disk (Chromium only) ------------- */

interface DirHandle {
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(d: Blob | Uint8Array): Promise<void>; close(): Promise<void> }>;
  }>;
  name: string;
}

export const canWriteToDisk = (): boolean =>
  typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

/** Uint8Array → Blob. `.slice()` yields a fresh, non-shared ArrayBuffer,
 *  sidestepping the ArrayBufferLike/ArrayBuffer mismatch in TS 5.7+. */
const bytesToBlob = (u8: Uint8Array): Blob => new Blob([u8.slice().buffer as ArrayBuffer]);

export async function writePlanToDisk(
  plan: AssemblyPlan,
  extras: Array<{ path: string; content: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const pick = (globalThis as unknown as { showDirectoryPicker: (o?: object) => Promise<DirHandle> })
    .showDirectoryPicker;
  const root = await pick({ mode: 'readwrite' });

  const cache = new Map<string, DirHandle>([['', root]]);
  const dirFor = async (segments: string[]): Promise<DirHandle> => {
    let key = '';
    let dir = root;
    for (const seg of segments) {
      key = key ? `${key}/${seg}` : seg;
      const hit = cache.get(key);
      if (hit) { dir = hit; continue; }
      dir = await dir.getDirectoryHandle(seg, { create: true });
      cache.set(key, dir);
    }
    return dir;
  };

  const items = [
    ...plan.files.map((f) => ({ path: f.path, data: f.raw ?? bytesToBlob(f.bytes!) })),
    ...extras.map((e) => ({ path: e.path, data: new Blob([e.content], { type: 'text/plain' }) })),
  ];

  let done = 0;
  for (const item of items) {
    const parts = item.path.split('/');
    const name = parts.pop()!;
    const dir = await dirFor(parts);
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(item.data as Blob);
    await w.close();
    onProgress?.(++done, items.length);
  }

  return root.name;
}