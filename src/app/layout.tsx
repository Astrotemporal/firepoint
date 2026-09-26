import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firepoint | A place to start",
  description: "Keep a local preparation list and find official emergency information for Glendale, California.",
  applicationName: "Firepoint",
  appleWebApp: { capable: true, title: "Firepoint", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#18312e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
