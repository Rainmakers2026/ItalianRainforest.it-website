'use client';

import { useSyncExternalStore } from 'react';

/**
 * The visitor's one-time sign-up (pay-per-data): stored in this browser only, so
 * downloads and embed codes don't ask twice, in this and later sessions. The server receives it once at
 * sign-up and alongside each later download / embed copy (recorded as events).
 * `registrationId` = request id of the sign-up row in Supabase (absent for older profiles).
 */
export type LeadProfile = { firstName: string; lastName: string; email: string; referent?: string; company: string; registrationId?: string; at: string };

const KEY = 'irf-lead-v1';
const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cacheValue: LeadProfile | null = null;
// Fallback when storage is blocked (private mode): the profile lasts for the page view.
let memory: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Stable reference while the stored value doesn't change (required by useSyncExternalStore). */
export function getLeadProfile(): LeadProfile | null {
  const raw = readRaw() ?? memory;
  if (raw === cacheRaw) return cacheValue;
  cacheRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as Partial<LeadProfile>) : null;
    cacheValue = v && v.firstName && v.lastName && v.email ? (v as LeadProfile) : null;
  } catch {
    cacheValue = null;
  }
  return cacheValue;
}

export function saveLeadProfile(p: Omit<LeadProfile, 'at'>) {
  const raw = JSON.stringify({ ...p, at: new Date().toISOString() });
  memory = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* storage unavailable: memory fallback */
  }
  listeners.forEach((l) => l());
}

export function clearLeadProfile() {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useLeadProfile(): LeadProfile | null {
  return useSyncExternalStore(subscribe, getLeadProfile, () => null);
}
