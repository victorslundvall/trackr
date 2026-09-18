import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Nav from "@/components/Nav";
import AppFrame from "@/components/AppFrame";
import RegisterSW from "@/components/RegisterSW";
import { MotionProvider } from "@/components/motion";
import SyncStatus from "@/components/SyncStatus";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.trakkr.se"),
  title: { default: "Trakkr – träningslogg med AI-coach", template: "%s · Trakkr" },
  description: "Trakkr är en träningslogg med en evidensbaserad AI-coach, smart progression och statistik som visar exakt var din volym hamnar.",
  openGraph: {
    title: "Trakkr – träningslogg med AI-coach",
    description: "Evidensbaserad AI-coach, smart progression och statistik för styrketräning och bodybuilding.",
    url: "https://www.trakkr.se",
    siteName: "Trakkr",
    locale: "sv_SE",
    type: "website",
  },
  appleWebApp: { capable: true, title: "Trakkr", statusBarStyle: "black" },
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
          <AppFrame>{children}</AppFrame>
          <Nav />
          <SyncStatus />
        </MotionProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
