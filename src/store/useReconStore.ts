import { create } from 'zustand';
import type {
  Decision, DiffMode, FileEntry, FilterKey, HunkPick,
  ScanOptions, Screen, SessionFile, SourceFile,
} from '@/types';
import { DEFAULT_OPTIONS } from '@/types';
import { ingestSide, reconcile, type IngestResult } from '@/lib/reconcile';

interface ReconState {
  /* ---- data ---- */
  screen: Screen;
  options: ScanOptions;
  rootA: string; rootB: string;
  filesA: SourceFile[]; filesB: SourceFile[];
  metaA: IngestResult | null; metaB: IngestResult | null;
  entries: FileEntry[];

  /* ---- view ---- */
  selectedId: string | null;
  filter: FilterKey;
  search: string;
  diffMode: DiffMode;
  showMergePreview: boolean;

  /* ---- scan ---- */
  isScanning: boolean;
  stage: string;
  scanError: string | null;
  progress: { done: number; total: number };

  /* ---- actions ---- */
  setScreen: (s: Screen) => void;
  setOptions: (p: Partial<ScanOptions>) => void;
  setSide: (side: 'A' | 'B', files: SourceFile[], root: string) => void;
  runScan: () => Promise<void>;

  setDecision: (id: string, d: Decision) => void;
  setNote: (id: string, note: string) => void;
  markReviewed: (id: string, v?: boolean) => void;
  bulkDecide: (ids: string[], d: Decision) => void;

  /* ---- Phase 3: merge ---- */
  setPick: (id: string, hunkIndex: number, pick: HunkPick) => void;
  setAllPicks: (id: string, pick: HunkPick, hunkIndexes: number[]) => void;
  setManualContent: (id: string, content: string) => void;
  toggleMergePreview: () => void;

  applySession: (s: SessionFile) => { applied: number; missing: number; extra: number };

  select: (id: string | null) => void;
  setFilter: (f: FilterKey) => void;
  setSearch: (s: string) => void;
  setDiffMode: (m: DiffMode) => void;
  reset: () => void;
}

export const useReconStore = create<ReconState>((set, get) => ({
  screen: 'upload',
  options: DEFAULT_OPTIONS,
  rootA: '', rootB: '',
  filesA: [], filesB: [],
  metaA: null, metaB: null,
  entries: [],

  selectedId: null,
  filter: 'needsReview',
  search: '',
  diffMode: 'split',
  showMergePreview: true,

  isScanning: false,
  stage: '',
  scanError: null,
  progress: { done: 0, total: 0 },

  setScreen: (screen) => set({ screen }),
  setOptions: (p) => set((s) => ({ options: { ...s.options, ...p } })),
  setSide: (side, files, root) =>
    set(side === 'A' ? { filesA: files, rootA: root } : { filesB: files, rootB: root }),

  runScan: async () => {
    const { filesA, filesB, options } = get();
    if (!filesA.length || !filesB.length) return;

    // Throttled: updating on all 3,000 files would thrash React.
    const tick = (label: string) => (done: number, total: number) => {
      if (done === total || done % 25 === 0) set({ stage: label, progress: { done, total } });
    };

    set({
      isScanning: true, scanError: null, stage: 'Reading folder A…',
      progress: { done: 0, total: filesA.length },
    });

    try {
      const ra = await ingestSide(filesA, options, tick('Reading folder A…'));
      set({ stage: 'Reading folder B…', progress: { done: 0, total: filesB.length } });
      const rb = await ingestSide(filesB, options, tick('Reading folder B…'));
      set({ stage: 'Reconciling…' });
      const entries = reconcile(ra, rb);
      set({
        metaA: ra, metaB: rb, entries,
        rootA: ra.root, rootB: rb.root,
        screen: 'overview', isScanning: false, stage: '', selectedId: null,
      });
    } catch (e) {
      set({ isScanning: false, stage: '', scanError: (e as Error).message });
    }
  },

  setDecision: (id, decision) =>
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === id ? { ...e, decision, reviewed: true } : e,
      ),
    })),

  setNote: (id, note) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, note } : e)) })),

  markReviewed: (id, v = true) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, reviewed: v } : e)) })),

  bulkDecide: (ids, decision) => {
    const targets = new Set(ids);
    set((s) => ({
      entries: s.entries.map((e) =>
        targets.has(e.id) ? { ...e, decision, reviewed: true } : e,
      ),
    }));
  },

  /* ------------------------------------------------------ Phase 3: merge */

  setPick: (id, hunkIndex, pick) =>
    set((s) => ({
      entries: s.entries.map((e) => {
        if (e.id !== id || e.decision.kind !== 'hunks') return e;
        return {
          ...e,
          decision: { kind: 'hunks', picks: { ...e.decision.picks, [hunkIndex]: pick } },
          reviewed: true,
        };
      }),
    })),

  setAllPicks: (id, pick, hunkIndexes) =>
    set((s) => ({
      entries: s.entries.map((e) => {
        if (e.id !== id || e.decision.kind !== 'hunks') return e;
        const picks: Record<number, HunkPick> = {};
        for (const i of hunkIndexes) picks[i] = pick;
        return { ...e, decision: { kind: 'hunks', picks }, reviewed: true };
      }),
    })),

  setManualContent: (id, content) =>
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === id && e.decision.kind === 'manual'
          ? { ...e, decision: { kind: 'manual', content }, reviewed: true }
          : e,
      ),
    })),

  toggleMergePreview: () => set((s) => ({ showMergePreview: !s.showMergePreview })),

  /* ------------------------------------------------------------- session */

  applySession: (session) => {
    const byId = new Map(session.decisions.map((d) => [d.id, d]));
    const entries = get().entries;

    const applied = entries.filter((e) => byId.has(e.id)).length;
    const missing = entries.length - applied;
    const ids = new Set(entries.map((e) => e.id));
    const extra = session.decisions.filter((d) => !ids.has(d.id)).length;

    set({
      entries: entries.map((e) => {
        const saved = byId.get(e.id);
        if (!saved) return e;
        return {
          ...e,
          decision: saved.decision,
          reviewed: saved.reviewed,
          note: saved.note ?? e.note,
        };
      }),
    });

    return { applied, missing, extra };
  },

  select: (selectedId) => set({ selectedId }),
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  setDiffMode: (diffMode) => set({ diffMode }),

  reset: () =>
    set({
      screen: 'upload', filesA: [], filesB: [], rootA: '', rootB: '',
      metaA: null, metaB: null, entries: [], selectedId: null,
      search: '', filter: 'needsReview', scanError: null,
    }),
}));