"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

type AdSlotProps = {
  slot: string | undefined;
  placement: string;
};

const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-8831839251689024";

export function AdSlot({ slot, placement }: AdSlotProps) {
  const enabled = Boolean(client && slot);

  useEffect(() => {
    if (!enabled) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // The ad network can retry on its own without interrupting downloads.
    }
  }, [enabled]);

  if (!enabled) {
    return (
      <aside className="house-ad" aria-label="Monceda Labs announcement">
        <span>MONCEDA LABS</span>
        <strong>Useful software. No pop-ups. No forced redirects.</strong>
        <a href="https://moncedalabs.com">Explore our tools →</a>
      </aside>
    );
  }

  return (
    <aside className="ad-wrap" aria-label="Advertisement">
      <span className="ad-label">ADVERTISEMENT</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        data-placement={placement}
      />
    </aside>
  );
}
