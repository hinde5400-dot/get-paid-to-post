"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
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
      className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-sun hover:text-sun"
    >
      Log out
    </button>
  );
}
