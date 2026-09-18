import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import RegisterSW from "@/components/RegisterSW";

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
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body className="min-h-dvh antialiased">
        <div className="mx-auto max-w-2xl px-4 pb-28 pt-5 md:pt-8">{children}</div>
        <Nav />
        <RegisterSW />
      </body>
    </html>
  );
}
