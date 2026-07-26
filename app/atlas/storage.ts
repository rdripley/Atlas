import type { AtlasState } from "./types";
import { createSeedState } from "./seed";

const STORAGE_KEY = "atlas-prototype-v1";

export function loadState(): AtlasState {
  if (typeof window === "undefined") return createSeedState();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as AtlasState) : createSeedState();
  } catch {
    return createSeedState();
  }
}

export function saveState(state: AtlasState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function resetState() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return createSeedState();
}

