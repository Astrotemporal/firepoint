"use client";

import { usePathname } from "next/navigation";

/** Echoes the address the visitor asked for. Renders nothing on the server, so the 404 shell can be static. */
export function MissingPath() {
  const pathname = usePathname();
  if (!pathname || pathname === "/") return null;
  const shown = pathname.length > 48 ? `${pathname.slice(0, 45)}…` : pathname;
  return (
    <p className="nf-path">
      No page at <code className="nf-path-code">{shown}</code>
    </p>
  );
}
