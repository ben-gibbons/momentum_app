// lib/api.ts
// Single accessor for the preload-exposed IPC surface. Components import { api } from here rather
// than touching window.api directly — one place to wrap, mock, or log calls later. The type comes
// from the global Window augmentation in src/preload/index.d.ts (MomentumApi).
export const api = window.api
