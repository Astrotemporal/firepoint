import type { Metadata } from "next";
import { FirepointHome } from "@/components/firepoint-home";
import { demoLiveSourcesEnabled } from "@/server/live-query-gate";

export const metadata: Metadata = {
  title: "Firepoint | Get ready",
};

export default function Prepare() {
  return <FirepointHome demoLiveSources={demoLiveSourcesEnabled()} />;
}
