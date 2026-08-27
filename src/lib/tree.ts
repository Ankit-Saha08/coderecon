import type { FileEntry } from '@/types';
import { isPending } from './stats';

export interface TreeFile {
  kind: 'file'; id: string; name: string; depth: number; path: string; entry: FileEntry;
}
export interface TreeDir {
  kind: 'dir'; id: string; name: string; depth: number; path: string;
  children: TreeNode[]; files: number; pending: number; changed: number;
}
export type TreeNode = TreeDir | TreeFile;

const makeDir = (name: string, path: string, depth: number): TreeDir => ({
  kind: 'dir', id: `d:${path}`, name, path, depth,
  children: [], files: 0, pending: 0, changed: 0,
});

export function buildTree(entries: FileEntry[]): TreeDir {
  const root = makeDir('', '', -1);
  const dirs = new Map<string, TreeDir>([['', root]]);

  for (const e of entries) {
    const parts = e.relPath.split('/');
    let cur = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const path = cur.path ? `${cur.path}/${parts[i]}` : parts[i];
      let next = dirs.get(path);
      if (!next) {
        next = makeDir(parts[i], path, cur.depth + 1);
        dirs.set(path, next);
        cur.children.push(next);
      }
      cur = next;
    }

    cur.children.push({
      kind: 'file', id: `f:${e.relPath}`, name: parts[parts.length - 1],
      depth: cur.depth + 1, path: e.relPath, entry: e,
    });
  }

  finalize(root);
  return root;
}

function finalize(dir: TreeDir): void {
  dir.children.sort((a, b) =>
    a.kind !== b.kind
      ? a.kind === 'dir' ? -1 : 1
      : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );

  for (const c of dir.children) {
    if (c.kind === 'dir') {
      finalize(c);
      dir.files += c.files; dir.pending += c.pending; dir.changed += c.changed;
    } else {
      dir.files += 1;
      if (isPending(c.entry)) dir.pending += 1;
      if (c.entry.status !== 'identical') dir.changed += 1;
    }
  }
}

export function flattenTree(root: TreeDir, collapsed: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (d: TreeDir) => {
    for (const c of d.children) {
      out.push(c);
      if (c.kind === 'dir' && !collapsed.has(c.id)) walk(c);
    }
  };
  walk(root);
  return out;
}

export function allDirIds(root: TreeDir): string[] {
  const out: string[] = [];
  const walk = (d: TreeDir) => {
    for (const c of d.children) if (c.kind === 'dir') { out.push(c.id); walk(c); }
  };
  walk(root);
  return out;
}