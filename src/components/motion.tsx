"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, animate, motion, useDragControls, useInView } from "motion/react";

export const spring = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;
export const softSpring = { type: "spring", stiffness: 260, damping: 30 } as const;
export const easeOut = [0.16, 1, 0.3, 1] as const;

/** Respect the OS "reduce motion" setting for every motion component. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Number that counts up to its value when it scrolls into view (and tweens on change). */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.9,
  format,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const from = useRef(0);
  const fmt = (n: number) => (format ? format(n) : n.toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const ctl = animate(from.current, value, {
      duration,
      ease: easeOut,
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    from.current = value;
    return () => ctl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value]);
  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {fmt(0)}
    </span>
  );
}

/** Animated open/close of arbitrary content (height + fade). */
export function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="c"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: easeOut }}
          className={`overflow-hidden ${className ?? ""}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Bottom sheet on phones, centered dialog on desktop. Mount/unmount it with `open`;
 * it animates in and out on its own.
 */
export function Sheet({
  open,
  onClose,
  children,
  className,
  z = 50,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  z?: number;
}) {
  const [desktop, setDesktop] = useState(false);
  const drag = useDragControls();
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setDesktop(mq.matches);
    const f = () => setDesktop(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-end justify-center md:items-center"
          style={{ zIndex: z }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 1 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`card relative w-full rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-2xl ${className ?? "max-w-md"}`}
            initial={desktop ? { opacity: 0, scale: 0.94, y: 8 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.96, y: 4 } : { y: "100%" }}
            transition={desktop ? { duration: 0.22, ease: easeOut } : spring}
            drag={desktop ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => {
              if (i.offset.y > 110 || i.velocity.y > 600) onClose();
            }}
          >
            {!desktop && (
              <div className="-mx-5 -mt-5 mb-1 flex cursor-grab touch-none justify-center pb-3 pt-2.5" onPointerDown={(e) => drag.start(e)}>
                <div className="h-1 w-10 rounded-full bg-line" />
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Short vibration on supported phones (Android; iOS Safari ignores it). */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

/** Three bouncing dots. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`} aria-label="Skriver">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** Centered shimmering placeholder used while a page loads. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-label="Laddar">
      <div className="skeleton h-8 w-1/2" />
      <div className="skeleton h-4 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-24 w-full" style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}
