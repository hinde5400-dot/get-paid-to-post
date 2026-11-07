import SignupForm from "@/components/SignupForm";

type Role = "creator" | "brand";

/**
 * Signup page — server wrapper so the role is read from the URL
 * server-side and /signup?role=brand renders the brand form
 * immediately (no hydration flash of the role picker). The form
 * itself is a client component.
 */
export default function SignupPage({
  searchParams,
}: {
  searchParams: { role?: string };
}) {
  const role: Role | null =
    searchParams.role === "brand"
      ? "brand"
      : searchParams.role === "creator"
        ? "creator"
        : null;
  return <SignupForm role={role} />;
}
