import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/constants";
import SideMenu from "./SideMenu";
import SignOutButton from "./SignOutButton";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/brands", label: "For Brands" },
  { href: "/how-it-works", label: "How It Works" },
];

export default async function Navbar() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        {/* Hamburger at the top-left opens the slide-in sidebar drawer. */}
        <SideMenu userEmail={user?.email ?? null} />
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sun font-display text-lg font-black text-black">
            G
          </span>
          <span className="truncate font-display text-lg font-black uppercase leading-tight tracking-tight text-white">
            {BRAND_NAME}
            <span className="block text-[11px] font-semibold normal-case tracking-wide text-white/50">
              Post Clips. Get Paid Per View.
            </span>
          </span>
        </Link>
        <nav className="ml-4 hidden items-center gap-6 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-semibold text-white/80 transition hover:text-sun"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden rounded-full bg-sun px-4 py-2 text-sm font-black text-black transition hover:bg-sundark sm:block"
              >
                Dashboard
              </Link>
              <div className="hidden sm:block">
                <SignOutButton />
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white transition hover:border-sun hover:text-sun"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-sun px-4 py-2 text-sm font-black text-black transition hover:bg-sundark"
              >
                Sign up free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
