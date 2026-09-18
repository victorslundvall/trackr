"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Dumbbell, Home, Menu, Sparkles } from "lucide-react";

const items = [
  { href: "/", label: "Hem", icon: Home },
  { href: "/history", label: "Historik", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: Sparkles },
  { href: "/exercises", label: "Övningar", icon: Dumbbell },
  { href: "/stats", label: "Statistik", icon: BarChart3 },
  { href: "/more", label: "Mer", icon: Menu },
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/workout/") || (/^\/coach\/[^/]+$/.test(path) && path !== "/coach/new")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-6">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium ${active ? "text-accent" : "text-ink-3 hover:text-ink-2"}`}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
