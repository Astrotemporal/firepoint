import type { Metadata, Viewport } from "next";
import { Preloader } from "@/components/preloader";
import { THEME_SCRIPT } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firepoint | A place to start",
  description: "Official emergency sources and a wildfire preparation guide for Glendale, California.",
  applicationName: "Firepoint",
  appleWebApp: { capable: true, title: "Firepoint", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#18312e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The theme script sets data-theme on <html> before hydration, hence suppressHydrationWarning.
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body><Preloader />{children}</body>
    </html>
  );
}
