"use client";

import { motion } from "motion/react";

/** Trakkr mark: two upward chevrons – the "kk" in the name, and progression. */
export function LogoMark({ size = 28, animate = false, className }: { size?: number; animate?: boolean; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 7.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <motion.path
        d="M16 47 32 31l16 16"
        {...common}
        opacity={0.45}
        initial={animate ? { y: 10, opacity: 0 } : false}
        animate={{ y: 0, opacity: 0.45 }}
        transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.1 }}
      />
      <motion.path
        d="M16 34 32 18l16 16"
        {...common}
        initial={animate ? { y: 14, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 20, delay: 0.22 }}
      />
    </svg>
  );
}

/** Mark + wordmark. */
export default function Logo({ size = 40, animate = false, className }: { size?: number; animate?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.14em] font-black leading-none tracking-[-0.055em] ${className ?? ""}`} style={{ fontSize: size }}>
      <LogoMark size={size * 0.95} animate={animate} className="shrink-0 text-accent" />
      <span className="-mt-[0.08em]">trakkr</span>
    </span>
  );
}
