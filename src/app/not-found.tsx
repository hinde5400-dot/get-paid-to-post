import type { Metadata } from "next";
import Link from "next/link";
import { DISCORD_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <p className="font-display text-7xl font-black text-limeink">404</p>
      <h1 className="mt-4 font-display text-3xl font-black uppercase tracking-tight text-fg">
        This page could not be found
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-fg/60">
        The link may be mistyped, or the campaign it pointed to may have
        ended and been removed. Live campaigns are listed below.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Link
          href="/campaigns"
          className="rounded-full bg-lime px-6 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-limedark"
        >
          Browse live campaigns
        </Link>
        <Link
          href="/"
          className="text-sm font-bold text-limeink hover:underline"
        >
          Go home
        </Link>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-bold text-fg/60 hover:text-limeink hover:underline"
        >
          Get help on Discord
        </a>
      </div>
    </div>
  );
}
