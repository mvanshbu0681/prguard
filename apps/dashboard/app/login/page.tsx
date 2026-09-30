import type { Me } from "@contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GitHubIcon, Mark } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [me, { error }] = await Promise.all([serverApi<Me>("/me"), searchParams]);
  if (me.ok) redirect("/reviews");

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-[340px] rounded-xl border border-line bg-surface-1 px-8 pb-8 pt-9 text-center shadow-hi">
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 shadow-hi">
          <Mark size={22} />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-[-0.015em] text-primary">PR Guard</h1>
        <p className="mt-1 text-sm text-dim">AI review on every pull request.</p>

        {/* A plain navigation: the backend answers with a redirect to GitHub. */}
        <a href="/api/auth/login" className={buttonClass({ variant: "primary", size: "lg", className: "mt-7 w-full" })}>
          <GitHubIcon />
          Continue with GitHub
        </a>

        {error !== undefined && <p className="mt-4 text-sm text-err-text">Sign-in failed. Try again.</p>}
      </div>
    </main>
  );
}
