export type Side = 'A' | 'B';

/** A file as handed to us by the browser, before root-stripping. */
export interface SourceFile {
  file: File;
  sourcePath: string;     // 'src/utils/date.ts' — includes the picked root folder
}

/** A single file as ingested from one side. */
export interface FileBlob {
  relPath: string;        // normalized, root-stripped: 'utils/date.ts'
  name: string;
  size: number;
  hash: string;           // SHA-256 hex
  isBinary: boolean;
  tooLarge: boolean;      // over maxDiffFileSizeKB → hash-compared only
  text: string | null;    // null when binary or too large
  lineEnding: 'LF' | 'CRLF' | 'MIXED' | 'NONE';
  raw: File;              // kept for byte-perfect binary passthrough on export
}

export type Status =
  | 'identical'
  | 'modified'
  | 'whitespaceOnly'
  | 'onlyInA'
  | 'onlyInB'
  | 'binaryDiff'
  | 'typeConflict'
  | 'possibleRename';

export type Decision =
  | { kind: 'takeA' }
  | { kind: 'takeB' }
  | { kind: 'keepBoth'; renameSide: Side; suffix: string }
  | { kind: 'hunks'; picks: Record<number, 'A' | 'B' | 'both' | 'none'> } // Phase 3
  | { kind: 'manual'; content: string }                                   // Phase 3
  | { kind: 'exclude' };

export interface FileEntry {
  id: string;             // === comparison key
  relPath: string;
  a?: FileBlob;
  b?: FileBlob;
  status: Status;
  decision: Decision;
  autoResolved: boolean;  // engine is confident; no human click required
  reviewed: boolean;      // human confirmed or changed it
  note?: string;          // reasoning → exported to the merge report
}

export interface ScanOptions {
  excludeGlobs: string[];
  ignoreWhitespace: boolean;
  normalizeLineEndings: boolean;
  caseInsensitivePaths: boolean;
  maxDiffFileSizeKB: number;
}

export interface SideSummary {
  root: string;
  fileCount: number;
  excludedCount: number;
  skippedCount: number;
  totalBytes: number;
}

export interface Stats {
  total: number; identical: number; modified: number; whitespaceOnly: number;
  onlyInA: number; onlyInB: number; binaryDiff: number; typeConflict: number;
  needsReview: number; reviewed: number; changed: number;
}

export type Screen = 'upload' | 'overview' | 'reconcile' | 'export';

export type FilterKey =
  | 'needsReview' | 'all' | 'changed' | 'identical'
  | 'modified' | 'whitespaceOnly' | 'onlyInA' | 'onlyInB'
  | 'binaryDiff' | 'typeConflict';

export type DiffMode = 'split' | 'inline';

export const DEFAULT_OPTIONS: ScanOptions = {
  excludeGlobs: [
    'node_modules/**', 'dist/**', 'build/**', '.git/**', '.venv/**',
    '__pycache__/**', '*.log', '.DS_Store', 'Thumbs.db', '*.min.js', '*.map',
    'coverage/**', '.next/**', '.cache/**',
  ],
  ignoreWhitespace: false,
  normalizeLineEndings: true,
  caseInsensitivePaths: false,
  maxDiffFileSizeKB: 2048,
};

export interface ExportOptions {
  rootFolderName: string;      // wraps output, e.g. 'src'
  includeReportInZip: boolean;
  includeSessionInZip: boolean;
}

export interface SessionDecision {
  id: string;
  status: Status;
  decision: Decision;
  reviewed: boolean;
  note?: string;
}

export interface SessionFile {
  app: 'coderecon';
  version: 1;
  createdAt: string;
  rootA: string;
  rootB: string;
  options: ScanOptions;
  counts: { total: number; reviewed: number };
  decisions: SessionDecision[];
}