"use client";

import { usePathname } from "next/navigation";

/** The app gets a centered phone-width column; the landing page ("/") is full-bleed. */
export default function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/") return <>{children}</>;
  return <div className="mx-auto max-w-2xl px-4 pb-28 pt-5 md:pt-8">{children}</div>;
}
