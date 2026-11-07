import { redirect } from "next/navigation";
import { getCurrentUser, getProfile, isOwner } from "@/lib/auth";
import { getAllSubmissions } from "@/lib/data";
import { getServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import AdminReviewList, { type AdminSubmission } from "@/components/AdminReviewList";

export default async function AdminPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white">Admin Review</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Supabase is not configured yet. Add your keys to .env.local first.
        </p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!isOwner(profile)) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-card p-8 text-center">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white">Access denied</h1>
        <p className="mt-3 text-sm text-white/60">
          Admin Review is owner-only. The first account created on the site
          is the owner.
        </p>
      </div>
    );
  }

  const submissions = await getAllSubmissions();

  // Creator emails for the review list (owner can read all users).
  const supabase = getServerClient();
  const emailById = new Map<string, string>();
  if (supabase) {
    const { data } = await supabase.from("users").select("id, email");
    for (const row of (data ?? []) as { id: string; email: string }[]) {
      emailById.set(row.id, row.email);
    }
  }

  const items: AdminSubmission[] = submissions.map((s) => ({
    ...s,
    creator_email: emailById.get(s.user_id) ?? s.user_id.slice(0, 8),
  }));

  const pending = items.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">Admin Review</h1>
        <p className="mt-2 text-sm text-white/60">
          Owner-only. Submissions stay Pending at $0 until you enter verified
          views and approve them. Approved earnings go into the creator&apos;s
          72-hour hold.
        </p>
        <p className="mt-2 inline-block rounded-full bg-sun/15 px-3 py-1 text-xs font-bold text-sun">
          {pending} pending · {items.length} total submissions
        </p>
      </div>
      <AdminReviewList submissions={items} />
    </div>
  );
}
