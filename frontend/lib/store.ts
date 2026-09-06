import { create } from "zustand";
import type { BBox } from "./types";

/**
 * The focus store is what ties the two panes together. When a reviewer touches
 * a field on the right, the field publishes its bounding box here; the document
 * viewer subscribes and pans to it. Keeping this in a store rather than passing
 * callbacks down means a field nested three levels inside a tab can drive the
 * canvas without either component knowing the other exists.
 */

export interface FocusTarget {
  /** Stable key, e.g. "parcels.0.plot_area_sqm" — also the SVG element id. */
  key: string;
  bbox: BBox;
  confidence?: number;
  label?: string;
}

interface ReviewState {
  focused: FocusTarget | null;
  hovered: string | null;
  reviewerId: string;
  role: "PATWARI" | "TEHSILDAR";
  showOverlay: boolean;

  focusField: (target: FocusTarget | null) => void;
  hoverField: (key: string | null) => void;
  setReviewer: (id: string, role: "PATWARI" | "TEHSILDAR") => void;
  toggleOverlay: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  focused: null,
  hovered: null,
  // In a deployment this comes from the DILRMP SSO session; the demo runs
  // against a fixed identity so the audit ledger still has a real actor.
  reviewerId: "patwari.demo",
  role: "PATWARI",
  showOverlay: true,

  focusField: (target) => set({ focused: target }),
  hoverField: (key) => set({ hovered: key }),
  setReviewer: (reviewerId, role) => set({ reviewerId, role }),
  toggleOverlay: () => set((state) => ({ showOverlay: !state.showOverlay })),
}));
