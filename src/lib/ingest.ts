import type { SourceFile } from '@/types';
import { normalizeSlashes } from './paths';

/** From <input type="file" webkitdirectory> */
export function filesFromInput(list: FileList | null): SourceFile[] {
  if (!list) return [];
  return Array.from(list).map((file) => ({
    file,
    sourcePath: normalizeSlashes(
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    ),
  }));
}

/**
 * From a drop event. Uses the legacy-but-universal Entries API.
 * GOTCHA: readEntries() returns at most 100 entries per call in Chromium —
 * you must keep calling it until it yields an empty array, or you silently
 * lose files in any folder with >100 children.
 */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<SourceFile[]> {
  const roots: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => FileSystemEntry | null;
    }).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  if (!roots.length) {
    return Array.from(dt.files).map((file) => ({
      file,
      sourcePath: normalizeSlashes(file.name),
    }));
  }

  const out: SourceFile[] = [];
  await Promise.all(roots.map((e) => walkEntry(e, '', out)));
  return out;
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: SourceFile[]): Promise<void> {
  const here = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
    );
    if (file) out.push({ file, sourcePath: normalizeSlashes(here) });
    return;
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) =>
        reader.readEntries(resolve, () => resolve([])),
      );
      if (!batch.length) break;
      children.push(...batch);
    }
    for (const child of children) await walkEntry(child, here, out);
  }
}