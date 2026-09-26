import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Firepoint — prepare and find official updates",
    short_name: "Firepoint",
    description: "A personal preparation list and paths to official Glendale emergency information.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f3eb",
    theme_color: "#18312e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
