"use client";

/**
 * Offline-first write queue ("outbox").
 *
 * Every write from the workout logger goes through `enqueue`. Ops are persisted in localStorage,
 * applied in order, and retried when the connection comes back. Inserts carry client-generated
 * ids, so later updates/deletes can reference rows that the server hasn't seen yet.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase/client";

type Row = Record<string, unknown>;
export type Op =
  | { id: string; table: string; kind: "insert"; values: Row[] }
  | { id: string; table: string; kind: "update"; match: Row; values: Row }
  | { id: string; table: string; kind: "delete"; match: Row }
  | { id: string; table: string; kind: "upsert"; values: Row[]; onConflict: string };

export type NewOp =
  | { table: string; kind: "insert"; values: Row[] }
  | { table: string; kind: "update"; match: Row; values: Row }
  | { table: string; kind: "delete"; match: Row }
  | { table: string; kind: "upsert"; values: Row[]; onConflict: string };

const KEY = "trackr-outbox-v1";
const FAILED_KEY = "trackr-outbox-failed-v1";

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- persistence ----------
function read(key = KEY): Op[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as Op[];
  } catch {
    return [];
  }
}
function write(ops: Op[], key = KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(ops));
  } catch {}
}

// ---------- status store ----------
type Status = { pending: number; syncing: boolean; online: boolean; failed: number };
let status: Status = { pending: 0, syncing: false, online: true, failed: 0 };
const listeners = new Set<() => void>();
function setStatus(p: Partial<Status>) {
  if (typeof window !== "undefined") (window as unknown as { __outbox?: Status }).__outbox = { ...status, ...p };
  status = { ...status, ...p };
  listeners.forEach((l) => l());
}
function refreshCounts() {
  setStatus({ pending: read().length, failed: read(FAILED_KEY).length });
}

let started = false;
function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;
  setStatus({ online: navigator.onLine });
  refreshCounts();
  window.addEventListener("online", () => {
    setStatus({ online: true });
    flush();
  });
  window.addEventListener("offline", () => setStatus({ online: false }));
  window.addEventListener("storage", (e) => e.key === KEY && refreshCounts());
  setInterval(() => read().length && flush(), 15000);
  if (read().length) flush();
}

const SERVER_STATUS: Status = { pending: 0, syncing: false, online: true, failed: 0 };

export function useOutbox(): Status {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      ensureStarted(); // after hydration, never during render
      return () => listeners.delete(l);
    },
    () => (started ? status : SERVER_STATUS),
    () => SERVER_STATUS,
  );
}

export function hasPending() {
  return read().length > 0;
}

// ---------- enqueue ----------
const sameRow = (a: Row, b: Row) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

export function enqueue(op: NewOp) {
  ensureStarted();
  const ops = read();
  // Coalesce an update into the newest pending write for the same row, as long as nothing is in flight for it.
  if (op.kind === "update") {
    const u = op;
    for (let i = ops.length - 1; i >= (flushing ? 1 : 0); i--) {
      const o = ops[i];
      if (o.table !== u.table) continue;
      if (o.kind === "update" && sameRow(o.match, u.match)) {
        o.values = { ...o.values, ...u.values };
        write(ops);
        schedule();
        return;
      }
      if (o.kind === "insert" && o.values.length === 1 && u.match.id != null && o.values[0].id === u.match.id) {
        o.values[0] = { ...o.values[0], ...u.values };
        write(ops);
        schedule();
        return;
      }
      if ((o.kind === "delete" || o.kind === "update" || o.kind === "insert") && JSON.stringify(o).includes(String(u.match.id))) break;
    }
  }
  // Deleting a row that was never sent: drop both.
  if (op.kind === "delete") {
    const d = op;
    const idx = ops.findIndex((o, i) => (i > 0 || !flushing) && o.table === d.table && o.kind === "insert" && o.values.length === 1 && o.values[0].id === d.match.id);
    if (idx >= 0 && d.match.id != null) {
      const rest = ops.filter((o, i) => i === idx ? false : !(o.table === d.table && o.kind === "update" && o.match.id === d.match.id));
      write(rest);
      refreshCounts();
      return;
    }
  }
  ops.push({ ...op, id: uuid() } as Op);
  write(ops);
  refreshCounts();
  schedule();
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => flush(), 250);
}

// ---------- flush ----------
let flushing = false;
let flushPromise: Promise<boolean> | null = null;

function isNetwork(err: { message?: string } | null, statusCode: number) {
  return statusCode === 0 || /fetch|network|load failed/i.test(err?.message ?? "");
}

async function run(op: Op) {
  const sb = supabase();
  if (op.kind === "insert") return sb.from(op.table).insert(op.values);
  if (op.kind === "upsert") return sb.from(op.table).upsert(op.values, { onConflict: op.onConflict });
  let q = op.kind === "update" ? sb.from(op.table).update(op.values) : sb.from(op.table).delete();
  for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v as string);
  return q;
}

/** Push queued ops to Supabase in order. Resolves true when the queue is empty. */
export function flush(): Promise<boolean> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    // yield first: otherwise an early return would run `finally` before flushPromise is assigned and wedge it
    await Promise.resolve();
    flushing = true;
    setStatus({ syncing: true });
    try {
      let refreshed = false;
      for (;;) {
        const ops = read();
        const op = ops[0];
        if (!op) return true;
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        let res: { error: { message?: string; code?: string } | null; status: number };
        try {
          res = (await run(op)) as typeof res;
        } catch (e) {
          res = { error: { message: (e as Error).message }, status: 0 };
        }
        if (res.error) {
          if (isNetwork(res.error, res.status)) {
            console.warn("[outbox] network error, will retry", res.status, res.error?.message);
            setStatus({ online: false });
            return false;
          }
          // expired session → refresh once and retry
          if ((res.status === 401 || res.status === 403 || res.error.code === "PGRST301") && !refreshed) {
            refreshed = true;
            await supabase().auth.refreshSession();
            continue;
          }
          // an insert that already landed (retry after a lost response) is fine
          if (!(op.kind === "insert" && res.error.code === "23505")) {
            console.error("[outbox] dropped op", op, res.error);
            write([...read(FAILED_KEY), op].slice(-50), FAILED_KEY);
          }
        }
        refreshed = false;
        const now = read();
        write(now[0]?.id === op.id ? now.slice(1) : now.filter((o) => o.id !== op.id));
        setStatus({ online: true });
        refreshCounts();
      }
    } finally {
      flushing = false;
      flushPromise = null;
      setStatus({ syncing: false });
      refreshCounts();
    }
  })();
  return flushPromise;
}

// ---------- local snapshots (workout logger, templates, exercises) ----------
export function saveLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(`trackr:${key}`, JSON.stringify(value));
  } catch {}
}
export function loadLocal<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(`trackr:${key}`);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export function dropLocal(key: string) {
  try {
    localStorage.removeItem(`trackr:${key}`);
  } catch {}
}

/** Race a promise against a timeout; resolves to `fallback` on timeout or error. */
export async function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    Promise.resolve(p).then(undefined, () => {}); // don't wait for a request that can't succeed
    return fallback;
  }
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(p), new Promise<T>((res) => (t = setTimeout(() => res(fallback), ms)))]);
  } catch {
    return fallback;
  } finally {
    if (t) clearTimeout(t);
  }
}
