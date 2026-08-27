/** Windows/Unix separators → '/', collapse doubles, drop './' prefix. */
export function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

export function segments(p: string): string[] {
  return normalizeSlashes(p).split('/').filter(Boolean);
}

export function baseName(p: string): string {
  const s = segments(p);
  return s.length ? s[s.length - 1] : '';
}

export function dirName(p: string): string {
  const s = segments(p);
  return s.slice(0, -1).join('/');
}

/**
 * The browser prefixes every path with the folder the user picked
 * ('src/App.tsx'). Return that shared first segment, or '' if the paths
 * don't all share one.
 *
 * Deliberately only ONE segment: stripping the longest common prefix
 * looks clever but breaks pairing when the two sides have different
 * depth (e.g. A = src/**, B = src-v2/components/** only).
 */
export function detectRootName(paths: string[]): string {
  if (!paths.length) return '';
  const first = segments(paths[0]);
  if (first.length < 2) return '';           // flat file list, no root to strip
  const root = first[0];
  return paths.every((p) => segments(p)[0] === root) ? root : '';
}

export function stripLeadingSegments(p: string, n: number): string {
  return segments(p).slice(n).join('/');
}

/** Minimal glob → RegExp. Supports **, *, ? and literal text. */
function globToRegExpSource(glob: string): string {
  let re = '';
  let i = 0;
  const g = normalizeSlashes(glob);
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 3; continue; }
        re += '.*'; i += 2; continue;
      }
      re += '[^/]*'; i += 1; continue;
    }
    if (c === '?') { re += '[^/]'; i += 1; continue; }
    if ('\\^$.|+()[]{}'.includes(c)) { re += '\\' + c; i += 1; continue; }
    re += c; i += 1;
  }
  return re;
}

/**
 * Build an exclusion predicate. Each pattern is tested both anchored at the
 * root AND at any depth, matching .gitignore intuition:
 *   'dist/**'   also excludes 'packages/app/dist/main.js'
 *   '*.log'     excludes 'a.log' and 'deep/nested/a.log'
 */
export function makeMatcher(globs: string[]): (relPath: string) => boolean {
  const compiled = globs
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => {
      const src = globToRegExpSource(g);
      return [new RegExp(`^${src}$`), new RegExp(`^(?:[^/]+/)*${src}$`)];
    });

  return (relPath: string) => {
    const p = normalizeSlashes(relPath);
    return compiled.some(([anchored, anywhere]) => anchored.test(p) || anywhere.test(p));
  };
}