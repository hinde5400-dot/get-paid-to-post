import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to your Get Paid To Post account to browse live campaigns, submit clips and withdraw your earnings.",
};

// Server wrapper so the page can carry metadata — the form itself
// is a client component (it reads ?message= and ?next= from the URL).
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md text-center">
          <p className="text-fg/60">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
