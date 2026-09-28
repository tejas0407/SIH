"use client";

import { useEffect, useState } from "react";

/**
 * NIC / MeitY-pattern footer. Carries the SIH attribution and states, once
 * and quietly, that this is not an official portal,
 * and that GIGW / NIC are design patterns followed rather than a certification.
 */
export default function GovFooter({ compact = false }: { compact?: boolean }) {
  const updated = useUpdatedDate();

  if (compact) {
    return (
      <p className="border-t border-rule px-4 py-1.5 text-center text-2xs text-ink-faint">
        SIH 2026 · SIH26018 · Department of Land Resources, Ministry of Rural Development
      </p>
    );
  }

  return (
    <footer className="shrink-0 border-t border-rule bg-panel px-4 py-2 text-center">
      <p className="text-2xs text-ink-muted">
        Designed &amp; Developed for Smart India Hackathon 2026 (Problem Statement: SIH26018) |
        Department of Land Resources (DoLR), Ministry of Rural Development
      </p>
      <p className="mt-0.5 text-2xs text-ink-faint">
        Build 2.4.1 · follows GIGW&nbsp;3.0 / NIC design patterns · not an official Government of
        India portal · Last updated: {updated}
      </p>
    </footer>
  );
}

function useUpdatedDate() {
  const [d, setD] = useState("Sep 2026");
  useEffect(() => {
    setD(
      new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }),
    );
  }, []);
  return d;
}
