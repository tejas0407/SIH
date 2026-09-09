import { create } from "zustand";
import type { BBox } from "./types";

/**
 * The focus store ties the two panes of the reviewer workspace together. When a
 * field on the right is focused it publishes its bounding box here; the document
 * viewer subscribes and pans to it. Keeping this in a store rather than threading
 * callbacks means a field nested three levels inside a tab can drive the canvas
 * without either component knowing the other exists.
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
  showOverlay: boolean;
  /** Set by "Highlight discrepant rows" in the discrepancy drawer. */
  highlightIssues: boolean;

  focusField: (target: FocusTarget | null) => void;
  hoverField: (key: string | null) => void;
  toggleOverlay: () => void;
  setHighlightIssues: (value: boolean) => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  focused: null,
  hovered: null,
  showOverlay: true,
  highlightIssues: false,

  focusField: (target) => set({ focused: target }),
  hoverField: (key) => set({ hovered: key }),
  toggleOverlay: () => set((state) => ({ showOverlay: !state.showOverlay })),
  setHighlightIssues: (highlightIssues) => set({ highlightIssues }),
}));
