"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { activeWorkout, type WorkoutSnapshot } from "@/lib/data";
import { loadLocal } from "@/lib/offline";
import { mmss } from "@/lib/format";
import { spring } from "./motion";

type Active = { id: string; name: string; started_at: string };

/** "Now playing"-style bar above the tab bar while a workout is running. Tap to jump back in. */
export default function ActiveWorkoutBar() {
  const path = usePathname();
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // re-check on every navigation (a workout may have been started or finished)
  useEffect(() => {
    setActive(loadLocal<Active>("active"));
    activeWorkout()
      .then(setActive)
      .catch(() => {});
  }, [path]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  const inChat = /^\/coach\/[^/]+$/.test(path) && !["/coach/new", "/coach/philosophy", "/coach/import"].includes(path);
  const hidden = !active || inChat || path === "/" || path.startsWith("/login") || path.startsWith("/workout/") || path === "/home";

  // let the page reserve room for the bar
  useEffect(() => {
    document.documentElement.toggleAttribute("data-active-bar", !hidden);
    return () => document.documentElement.removeAttribute("data-active-bar");
  }, [hidden]);

  const snap = active ? loadLocal<WorkoutSnapshot>(`workout:${active.id}`) : null;
  const sets = snap?.blocks.flatMap((b) => b.sets.filter((s) => s.set_type !== "warmup")) ?? [];
  const done = sets.filter((s) => s.completed_at).length;

  return (
    <AnimatePresence>
      {!hidden && active && (
        <motion.div
          key="bar"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={spring}
          className="fixed inset-x-0 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+4.6rem)] z-30 px-3"
        >
          <Link
            href={`/workout/${active.id}`}
            className="relative mx-auto flex max-w-md items-center gap-3 overflow-hidden rounded-2xl border border-accent/40 bg-surface/90 p-2 pr-3 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8),0_0_24px_-12px_var(--color-accent)] backdrop-blur-xl active:scale-[0.98]"
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink">
              <span className="absolute inset-0 animate-ping rounded-xl bg-accent/40 [animation-duration:2.2s]" />
              <svg viewBox="0 0 24 24" width={16} height={16} className="relative" fill="currentColor">
                <path d="M7 5v14l12-7z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{active.name}</div>
              <div className="text-xs text-ink-3">
                <span className="font-mono text-accent">{mmss((now - new Date(active.started_at).getTime()) / 1000)}</span>
                {sets.length > 0 && ` · ${done}/${sets.length} set`}
              </div>
            </div>
            <span className="text-xs font-semibold text-accent">Till passet</span>
            <ChevronRight size={16} className="text-accent" />
            {sets.length > 0 && (
              <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-accent/80" style={{ transform: `scaleX(${done / sets.length})` }} />
            )}
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
