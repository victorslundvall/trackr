"use client";

import { AnimatePresence, motion } from "motion/react";
import { CloudOff, RefreshCw } from "lucide-react";
import { useOutbox } from "@/lib/offline";

/** Small pill at the top of the screen while offline or while local changes wait to sync. */
export default function SyncStatus() {
  const { pending, online, syncing } = useOutbox();
  const show = !online || pending > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
          className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[70] flex justify-center"
          role="status"
        >
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-xl ${
              online ? "border-sky/40 bg-surface/90 text-sky" : "border-warm/40 bg-surface/90 text-warm"
            }`}
          >
            {online ? <RefreshCw size={13} className={syncing ? "animate-spin" : ""} /> : <CloudOff size={13} />}
            {online
              ? `Synkar ${pending} ändring${pending === 1 ? "" : "ar"}…`
              : pending
                ? `Offline · ${pending} ändring${pending === 1 ? "" : "ar"} sparade lokalt`
                : "Offline – det du loggar sparas lokalt"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
