import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Nav from "@/components/Nav";
import RegisterSW from "@/components/RegisterSW";
import { MotionProvider } from "@/components/motion";

export const metadata: Metadata = {
  title: "Trackr",
  description: "Träningslogg för styrka och hypertrofi",
  appleWebApp: { capable: true, title: "Trackr", statusBarStyle: "black" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#090b0e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <MotionProvider>
          <div className="mx-auto max-w-2xl px-4 pb-28 pt-5 md:pt-8">{children}</div>
          <Nav />
        </MotionProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
