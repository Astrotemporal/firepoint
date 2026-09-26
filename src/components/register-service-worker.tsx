"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/service-worker";

/** Installs the offline fallback on pages that are otherwise server-rendered. */
export function RegisterServiceWorker() {
  useEffect(registerServiceWorker, []);
  return null;
}
