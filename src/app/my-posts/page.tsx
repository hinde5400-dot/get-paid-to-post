import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserSubmissions } from "@/lib/data";
import MyPostsList from "@/components/MyPostsList";

export default async function MyPostsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const submissions = await getUserSubmissions(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">My Posts</h1>
        <p className="mt-2 text-sm text-white/60">
          Every clip you submitted, with views, likes and earnings. Metrics
          update once a day.
        </p>
      </div>
      <MyPostsList submissions={submissions} />
    </div>
  );
}
