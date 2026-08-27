# CodeRecon — Codebase Reconciliation Studio

Compare two `src` folders side by side, decide file by file what to keep,
and assemble a merged tree — without Git.

**Live:** https://<your-username>.github.io/coderecon/

## Privacy
100% client-side. Folders are read in-browser via the File System APIs.
No file, path, or byte is ever uploaded. There is no backend.

## Features
- Folder picker + drag-and-drop ingestion, glob exclusions
- SHA-256 identity check, binary + encoding + line-ending detection
- Status classification with smart defaults (only genuine conflicts need review)
- Word-level split/inline diff viewer
- Per-file decisions: Keep A / Keep B / Keep both / Exclude
- Byte-exact ZIP export, Markdown + CSV merge report, resumable session files

## Local development
```bash
npm install
npm run dev
