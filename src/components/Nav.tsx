"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BarChart3, CalendarDays, Dumbbell, Home, Menu, Sparkles } from "lucide-react";
import { spring } from "./motion";

const items = [
  { href: "/home", label: "Hem", icon: Home },
  { href: "/history", label: "Historik", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/exercises", label: "Övningar", icon: Dumbbell },
  { href: "/stats", label: "Statistik", icon: BarChart3 },
  { href: "/more", label: "Mer", icon: Menu },
];

export default function Nav() {
  const path = usePathname();
  if (path === "/" || path.startsWith("/login") || path.startsWith("/workout/") || (/^\/coach\/[^/]+$/.test(path) && !["/coach/new", "/coach/philosophy", "/coach/import"].includes(path))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <ul className="mx-auto grid max-w-md grid-cols-6 rounded-[1.4rem] border border-line/80 bg-surface/80 p-1 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <li key={href} className="relative">
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-[1.1rem] bg-accent/12 ring-1 ring-accent/25"
                  transition={spring}
                />
              )}
              <Link
                href={href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${active ? "text-accent" : "text-ink-3 hover:text-ink-2"}`}
              >
                <motion.span animate={active ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }} transition={spring} className="flex">
                  <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
                </motion.span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
