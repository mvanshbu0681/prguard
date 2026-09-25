// OWNER: d5 (wave 3). /settings/policy (plan A3, dashboard blueprint §2.12) —
// read-only: there is no settings endpoint. No server-only data to read here
// (the one live value, severity.weights, comes through useFinding on the
// client), so this stays a plain Server Component wrapper.
import type { Metadata } from "next";
import { PolicyRoute } from "@/components/routes/policy";

export const metadata: Metadata = { title: "Policy" };

export default function Page() {
  return <PolicyRoute />;
}
