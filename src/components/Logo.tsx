import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Premium brand logo — our own mark, not copied: a bold lime "G" in a
 * black rounded square, with the "Get Paid To Post" wordmark beside
 * it in white at font-weight 600 with letter spacing — modern and
 * light, not heavy. The black square keeps its thin border so the
 * mark stays visible on the black header in dark mode.
 */
export function LogoMark({
  className = "h-9 w-9",
  textClassName = "text-lg",
}: {
  className?: string;
  textClassName?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl border border-fg/20 bg-black font-display font-black leading-none text-lime ${className} ${textClassName}`}
      aria-hidden
    >
      G
    </span>
  );
}

export default function Logo({
  href = "/",
  wordmarkClassName = "hidden min-[420px]:block",
}: {
  href?: string;
  wordmarkClassName?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label={BRAND_NAME}>
      <LogoMark />
      <span
        className={`font-display text-lg font-semibold uppercase leading-tight tracking-[0.08em] text-fg ${wordmarkClassName}`}
      >
        {BRAND_NAME}
      </span>
    </Link>
  );
}
