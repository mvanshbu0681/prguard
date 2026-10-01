import Link from "next/link";
import { Mark } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark size={24} />
        <p className="text-sm text-body">Page not found.</p>
        <Link href="/reviews" className={buttonClass({ size: "sm" })}>
          Go to reviews
        </Link>
      </div>
    </main>
  );
}
