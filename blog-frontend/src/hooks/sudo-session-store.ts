import { STEP_UP_COMPLETED_EVENT, SUDO_SESSION_STALE_EVENT } from "../mfa";

const STORAGE_KEY = "gouno:sudo_activated_at";
export const SUDO_SESSION_CLEARED_EVENT = "gouno:sudo-session-cleared";
export const SUDO_MAX_AGE_MS = 10 * 60 * 1000;

interface SudoSnapshot {
  readonly remainingMs: number;
  readonly stale: boolean;
}

// Presentation hints only. The server remains authoritative for permissions
// and recent MFA; local storage and browser events cannot grant either.
const inactiveSnapshot: SudoSnapshot = { remainingMs: 0, stale: false };
let snapshot = inactiveSnapshot;
let staleSince: number | null = null;
let blockedSince: number | null = null;
const listeners = new Set<() => void>();
let stopListening: (() => void) | undefined;

function publish(remainingMs: number, stale: boolean) {
  if (snapshot.remainingMs === remainingMs && snapshot.stale === stale) return;
  snapshot = { remainingMs, stale };
  for (const listener of listeners) listener();
}

function activationTimestamp(raw: string | null, now: number): number | null {
  if (!raw || raw.length > 16 || !/^[1-9]\d*$/.test(raw)) return null;
  const timestamp = Number(raw);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp > now ||
    now - timestamp >= SUDO_MAX_AGE_MS
  ) {
    return null;
  }
  return timestamp;
}

function refresh(clearIfEmpty = false) {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    publish(0, staleSince !== null);
    return;
  }
  if (raw === null) {
    blockedSince = null;
    if (clearIfEmpty) staleSince = null;
  }
  const now = Date.now();
  const timestamp = activationTimestamp(raw, now);
  if (timestamp === null) {
    publish(0, staleSince !== null);
    return;
  }
  // A failed removal/write must not resurrect the same old hint on a timer.
  if (blockedSince !== null && timestamp <= blockedSince) {
    publish(0, staleSince !== null);
    return;
  }
  blockedSince = null;
  // Re-reading the same hint is not a fresh completion after server rejection.
  if (staleSince !== null && timestamp > staleSince) staleSince = null;
  publish(SUDO_MAX_AGE_MS - (now - timestamp), staleSince !== null);
}

export function refreshSudoSnapshot() {
  refresh();
}

export function recordSudoSuccess() {
  const now = Date.now();
  staleSince = null;
  blockedSince = now;
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
    blockedSince = null;
  } catch {
    publish(0, false);
    return;
  }
  refresh();
}

function clearSnapshot() {
  staleSince = null;
  blockedSince = Date.now();
  try {
    localStorage.removeItem(STORAGE_KEY);
    blockedSince = null;
  } catch {
    // Retain the in-memory fence until a new successful completion.
  }
  publish(0, false);
}

export function clearSudo() {
  clearSnapshot();
  window.dispatchEvent(new Event(SUDO_SESSION_CLEARED_EVENT));
}

function markStale() {
  staleSince = Date.now();
  refresh();
}

function handleStorage(event: StorageEvent) {
  try {
    if (event.storageArea !== localStorage) return;
  } catch {
    return;
  }
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  // Read current storage, not a possibly delayed or synthetic event payload.
  // A clear notification only resets stale state if the record is really gone.
  refresh(event.key === null);
}

export function subscribeSudo(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const timer = window.setInterval(refreshSudoSnapshot, 3000);
    window.addEventListener(STEP_UP_COMPLETED_EVENT, recordSudoSuccess);
    window.addEventListener(SUDO_SESSION_STALE_EVENT, markStale);
    window.addEventListener(SUDO_SESSION_CLEARED_EVENT, clearSnapshot);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshSudoSnapshot);
    stopListening = () => {
      window.clearInterval(timer);
      window.removeEventListener(STEP_UP_COMPLETED_EVENT, recordSudoSuccess);
      window.removeEventListener(SUDO_SESSION_STALE_EVENT, markStale);
      window.removeEventListener(SUDO_SESSION_CLEARED_EVENT, clearSnapshot);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshSudoSnapshot);
    };
  }
  refresh();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopListening?.();
      stopListening = undefined;
    }
  };
}

// Cached immutable snapshots: no storage reads, time reads, or mutation during
// React render. The subscription refreshes the browser snapshot on attachment.
export function getSudoSnapshot(): SudoSnapshot {
  return snapshot;
}

export function getServerSudoSnapshot(): SudoSnapshot {
  return inactiveSnapshot;
}
