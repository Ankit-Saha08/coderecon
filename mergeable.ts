import type { FileEntry } from '@/types';

/** Hunk merging needs decodable text on both sides. */
export function canHunkMerge(e: FileEntry): boolean {
  return !!(
    e.a && e.b &&
    !e.a.isBinary && !e.b.isBinary &&
    !e.a.tooLarge && !e.b.tooLarge &&
    e.a.text != null && e.b.text != null
  );
}

/** Manual editing needs text on at least one side. */
export function canManualEdit(e: FileEntry): boolean {
  const a = e.a && !e.a.isBinary && !e.a.tooLarge && e.a.text != null;
  const b = e.b && !e.b.isBinary && !e.b.tooLarge && e.b.text != null;
  return !!(a || b);
}

export function seedManualContent(e: FileEntry): string {
  if (e.b?.text != null) return e.b.text;
  if (e.a?.text != null) return e.a.text;
  return '';
}