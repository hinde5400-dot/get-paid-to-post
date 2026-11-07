"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";

export default function SignOutButton({
  className = "",
}: {
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    const supabase = getBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-fg/20 px-4 py-2 text-sm font-semibold text-fg/80 transition hover:border-lime hover:text-lime disabled:opacity-40 ${className}`}
    >
      {busy ? (
        <>
          <Spinner /> Loading...
        </>
      ) : (
        "Log out"
      )}
    </button>
  );
}
