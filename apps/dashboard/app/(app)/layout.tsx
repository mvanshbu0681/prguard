import type { Me } from "@contracts";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MeProvider } from "@/components/me-provider";
import { TopBar } from "@/components/top-bar";
import { Unavailable } from "@/components/unavailable";
import { serverApi } from "@/lib/server-api";

// Auth guard for every signed-in page: no session, no dashboard.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await serverApi<Me>("/me");

  if (!me.ok) {
    if (me.status === 401) redirect("/login");
    return <Unavailable />;
  }

  return (
    <MeProvider me={me.data}>
      <TopBar />
      <main className="mx-auto w-full max-w-[1200px] px-6 pb-16 pt-8">{children}</main>
    </MeProvider>
  );
}
