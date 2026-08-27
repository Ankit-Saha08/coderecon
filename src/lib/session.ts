import type { FileEntry, ScanOptions, SessionFile } from '@/types';

export function buildSession(
  entries: FileEntry[],
  rootA: string,
  rootB: string,
  options: ScanOptions,
): SessionFile {
  return {
    app: 'coderecon',
    version: 1,
    createdAt: new Date().toISOString(),
    rootA, rootB, options,
    counts: { total: entries.length, reviewed: entries.filter((e) => e.reviewed).length },
    decisions: entries.map((e) => ({
      id: e.id, status: e.status, decision: e.decision, reviewed: e.reviewed, note: e.note,
    })),
  };
}

export function parseSession(json: string): SessionFile {
  const data = JSON.parse(json) as SessionFile;
  if (data?.app !== 'coderecon' || data.version !== 1 || !Array.isArray(data.decisions)) {
    throw new Error('Not a valid CodeRecon session file.');
  }
  return data;
}