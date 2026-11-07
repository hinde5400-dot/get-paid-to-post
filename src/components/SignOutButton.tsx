"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton({
  className = "",
}: {
  className?: string;
}) {
  const router = useRouter();
  async function signOut() {
    const supabase = getBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className={`rounded-full border border-fg/20 px-4 py-2 text-sm font-semibold text-fg/80 transition hover:border-lime hover:text-lime ${className}`}
    >
      Log out
    </button>
  );
}
