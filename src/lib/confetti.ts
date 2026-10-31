"use client";

import confetti from "canvas-confetti";

const COLORS = ["#ffe14d", "#ff6aa8", "#7ff0c4", "#3d5afe", "#1b2559", "#ffffff"];

export function celebrate(big = false) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const base = { colors: COLORS, shapes: ["square" as const], scalar: big ? 1.4 : 1.1, ticks: 260, gravity: 0.9 };
  confetti({ ...base, particleCount: big ? 220 : 120, spread: 100, origin: { y: 0.65 } });
  setTimeout(() => {
    confetti({ ...base, particleCount: big ? 120 : 60, angle: 60, spread: 70, origin: { x: 0, y: 0.7 } });
    confetti({ ...base, particleCount: big ? 120 : 60, angle: 120, spread: 70, origin: { x: 1, y: 0.7 } });
  }, 180);
}

export function buzz(ms: number | number[] = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
