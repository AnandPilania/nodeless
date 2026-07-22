import crypto from "node:crypto";

interface StoredPreview {
  html: string;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, StoredPreview>();

function sweep(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(id);
    }
  }
}

export function storePreviewDocument(html: string): string {
  sweep();
  const id = crypto.randomUUID();
  store.set(id, { html, createdAt: Date.now() });
  return id;
}

export function getPreviewDocument(id: string): string | null {
  const entry = store.get(id);
  if (!entry) return null;
  return entry.html;
}
