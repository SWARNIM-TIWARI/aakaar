// ──────────────────────────────────────────────────────────────────────────────
// AAKAAR — LocalStorage Repository
// Clean adapter interface — swap for DB without touching UI code.
// Always wraps localStorage in try/catch (private windows, quota, etc.)
// ──────────────────────────────────────────────────────────────────────────────

import type { Job, Repository } from "@/lib/types";

const STORAGE_KEY = "aakaar_jobs_v1";

// ── Serialization ─────────────────────────────────────────────────────────────

function readStore(): Record<string, Job> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Job>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Job>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or private window — fail silently; UI will warn
    console.warn("[AAKAAR] localStorage write failed (quota or private window)");
  }
}

// ── Repository implementation ─────────────────────────────────────────────────

function createLocalStorageRepository(): Repository {
  return {
    getJob(id: string): Job | null {
      const store = readStore();
      return store[id] ?? null;
    },

    listJobs() {
      const store = readStore();
      return Object.values(store).map(
        ({ id, title, status, createdAt, updatedAt, isDemo, demoLabel }) => ({
          id,
          title,
          status,
          createdAt,
          updatedAt,
          isDemo,
          demoLabel,
        })
      );
    },

    saveJob(job: Job): void {
      const store = readStore();
      store[job.id] = { ...job, updatedAt: new Date().toISOString() };
      writeStore(store);
    },

    deleteJob(id: string): void {
      const store = readStore();
      delete store[id];
      writeStore(store);
    },

    clearAll(): void {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _repo: Repository | null = null;

/**
 * Get (or create) the repository singleton.
 * Returns null when called server-side (no localStorage).
 */
export function getRepository(): Repository | null {
  if (typeof window === "undefined") return null;
  if (!_repo) _repo = createLocalStorageRepository();
  return _repo;
}

/** For testing: create a fresh in-memory repository */
export function createInMemoryRepository(): Repository {
  const store = new Map<string, Job>();

  return {
    getJob(id) {
      return store.get(id) ?? null;
    },
    listJobs() {
      return Array.from(store.values()).map(
        ({ id, title, status, createdAt, updatedAt, isDemo, demoLabel }) => ({
          id,
          title,
          status,
          createdAt,
          updatedAt,
          isDemo,
          demoLabel,
        })
      );
    },
    saveJob(job) {
      store.set(job.id, { ...job, updatedAt: new Date().toISOString() });
    },
    deleteJob(id) {
      store.delete(id);
    },
    clearAll() {
      store.clear();
    },
  };
}
