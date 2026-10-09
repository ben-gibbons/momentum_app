// lib/api.ts
// Single accessor for the preload-exposed IPC surface. Components import { api } from here rather
// than touching window.api directly — one place to wrap, mock, or log calls later. The type comes
// from the global Window augmentation in src/preload/index.d.ts (MomentumApi).
export const api = window.api

// Errors thrown in the main process arrive via ipcRenderer.invoke wrapped as
// "Error invoking remote method 'x:y': Error: <message>". Strip the wrapper so the user sees
// only the repository's message.
export function ipcErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
