import type { Metadata } from "next";
import { FirepointHome } from "@/components/firepoint-home";

export const metadata: Metadata = {
  title: "Firepoint | Get ready",
};

export default function Prepare() {
  return <FirepointHome />;
}
