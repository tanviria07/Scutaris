"use client";

import { Stars } from "@react-three/drei";
import type { QualityTier } from "@/lib/types/ui";

const COUNT_BY_QUALITY: Record<QualityTier, number> = {
  high: 6000,
  medium: 3000,
  low: 1200,
};

/**
 * Background star field. Procedural, so there is no sky-box asset to license.
 * `saturation: 0` keeps the stars white rather than rainbow-tinted.
 */
export function Starfield({
  quality,
  animate,
}: {
  quality: QualityTier;
  animate: boolean;
}) {
  return (
    <Stars
      radius={300}
      depth={80}
      count={COUNT_BY_QUALITY[quality]}
      factor={5}
      saturation={0}
      fade
      speed={animate ? 0.35 : 0}
    />
  );
}
