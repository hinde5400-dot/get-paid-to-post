# Get Paid To Post

**Post Clips. Get Paid Per View.**

Creators post short clips on TikTok, Instagram and YouTube and get paid per
view. No follower minimum. Brands fund a budget upfront and pay only for
verified views.

- **Brand:** Get Paid To Post
- **GitHub repo:** `get-paid-to-post`
- **Vercel project:** `get-paid-to-post`
- **Free domain:** https://get-paid-to-post.vercel.app
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase
  (Auth + Database) — all free tiers, no paid domain, hosting, or API.

> GitHub repo: **`get-paid-to-post`** at
> `github.com/hinde5400-dot/get-paid-to-post`.

## Money rules

| Rule | Value |
|---|---|
| Brand minimum to launch | None — any budget above $0; the budget must be funded (USDT) before the campaign goes live |
| Platform fee | 15% flat, charged ON TOP of the budget ($500 budget → $575 total to send); the fee is not refundable |
| Base pay | None — views only. No pay per post and no pay for proof |
| Earnings | views / 1,000 × the campaign's single rate per 1,000 views, capped at the per-post max ($10–$200, $100 default) and the remaining budget; min 1,000 views to earn; views tracked 14 days after submit |
| Approval hold | Approved earnings sit in a 72-hour hold, then become available |
| Minimum withdrawal | $15 |
| Withdrawal fee | 5% — you receive the amount minus the fee, rounded to the nearest cent |
| Payout methods | USDT (TRC20) only — manual payout by the owner, usually within 24 hours, never pending more than 3 days |
| Submit limits | Max 15 APPROVED clips per platform per campaign per creator (rejected clips don't count, no resubmit); one clip per platform every 2 hours; submit within 30 minutes of posting |

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in your own Supabase values
npm run dev                        # http://localhost:3000
```

Without Supabase keys the site still runs and shows honest empty states
(no live campaigns, no fake numbers), but signup, login, submissions and
withdrawals need Supabase configured.

## Set up Supabase (free)

1. Create a free project at [supabase.com](https://supabase.com/dashboard/sign-up)
   (name it `get-paid-to-post`).
2. Open **SQL Editor → New query**, paste
   `supabase/schema.sql` (or run the two files in
   `supabase/migrations/` in order) and click **Run**. You should see
   success with no errors. Confirm the tables under **Table Editor**:
   `users`, `campaigns`, `submissions`, `wallets`, `withdrawals`.
3. Check **Authentication → Providers → Email** is enabled. For the
   fastest launch test you may temporarily turn off email confirmation —
   turn it back on before public launch.
4. In **Project Settings → API**, copy the Project URL and the **anon
   public key**. Never copy the `service_role` key into this project.
5. Put them in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```
6. In Supabase **Authentication → URL Configuration**, set Site URL to
   your live Vercel URL and add the same URL under Redirect URLs.

## Deploy free on Vercel

1. Push the code to GitHub (private repo named `get-paid-to-post`). Confirm `.env.local` is NOT in the repo.
2. Go to [vercel.com](https://vercel.com/signup) → **Add New → Project**
   and import the repo. Framework auto-detects as Next.js — leave build
   settings on default.
3. Set the project name to `get-paid-to-post`. This gives you the free
   domain `get-paid-to-post.vercel.app`.
4. Before deploying, expand **Environment Variables** and add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with
   the exact values from above, for Production (and Preview if you test
   branches).
5. Click **Deploy**. Every future change: push to GitHub and Vercel
   redeploys automatically.

## Test the full flow (on the live URL, phone + laptop)

1. `/signup` with email + password → you land on the social-connect step;
   a row appears in Supabase `users` + `wallets`.
2. Connect a TikTok profile link, save → saved on your `users` row.
3. `/campaigns`, filter by TikTok, open a campaign → rules, rate table
   and budget match the campaign row.
4. Join and submit a real post link from tiktok.com → saved as Pending.
   A facebook.com or random link is rejected.
5. `/dashboard` → the submission appears in My Posts with platform and
   status. The same TikTok link submitted again by another creator is
   flagged as a duplicate and revoked.
6. Approve the test submission in `/admin` (owner only) with verified
   views → amount shows in Pending first, then in Available after the
   72-hour hold.
7. Click Withdraw with balance under $15, then at $15+ → under $15 is
   blocked; at $15+ the modal shows the 5% fee and final amount for USDT
   (TRC20) only.
8. Submit a brand campaign on `/brands` with a $40 budget → any amount
   above $0 saves as an unfunded (pending) draft, not live, until the
   brand pays and the owner approves it.
9. Log out and try to open `/dashboard` directly → redirected to `/login`.

Never test payouts with real creator money. Run the first withdrawal
end-to-end with a tiny amount to your own USDT (TRC20) wallet first.

## Pages

| Route | Purpose |
|---|---|
| `/` | Hero, stats, Featured Campaign, campaign list, How It Works, Why, Top Earners, FAQ |
| `/campaigns` | Search + platform/category filters, sort by Highest Pay |
| `/campaign/[id]` | Budget % used (never $), Earn up to $X per post, views-only pay, 14-day tracking, max 15 approved clips per platform, Brief, submit bundle form |
| `/login`, `/signup` | Supabase Auth, email + password only, then social connect step |
| `/connect` | Connect TikTok / Instagram / YouTube (OAuth + profile links) |
| `/dashboard`, `/my-posts` | Earnings, wallet, submissions with All / Approved / Under Review / Rejected filters, Submission ID + Copy ID |
| `/submit/[id]` | Submit-a-post bundle page |
| `/earnings` | Available balance, 72-hour hold, withdrawn total, history, payout info |
| `/brands` | "I am a Brand" / "I am a Creator" split, 7-step How Funding Works, brand form (any budget above $0) |
| `/how-it-works`, `/terms`, `/privacy`, `/refund`, `/rules` | Explainer and legal pages |
| `/more`, `/support` | More page + mobile bottom nav; Discord support; honest empty states |
| `/admin` | Owner-only Admin Review: approve / reject, block/unblock creators, payouts, refund queue |

## Admin Review (owner-only)

The first account created becomes the owner (`users.is_admin`). Submissions
stay **Pending at $0** until the owner enters verified views and approves
(credits the 72-hour hold) or rejects. **Block** blocks a creator for
fake/bot views — blocked accounts cannot log in, re-register with the same
email, submit, or withdraw.

## APIs — current state (Nov 2026)

- **YouTube** — OAuth Connect is live (creator links their own
  channel) and the 3-hour view refresh reads views via the YouTube
  Data API v3. The Google app is published but unverified (100-user
  cap + warning screens until verification completes).
- **TikTok** — Login Kit app submitted for review (in review since
  9 Nov 2026); the site runs on Sandbox credentials until approval,
  so only the sandbox test user can connect. View refresh via
  video/query once connected.
- **Instagram** — no Meta app / API access yet (developer phone
  verification keeps failing); Instagram checks stay manual — the
  owner checks the live Reel link + proof screenshot by hand, and
  post time is always "unverified" for Instagram submits.

Until TikTok approval, views are counted through the owner's Admin
Review for TikTok/Instagram. Google AdSense is a later step, not
launch-day earnings (approval on a free vercel.app subdomain is very
unlikely; a custom domain costs ~$10–12/year).

## Project structure

```text
get-paid-to-post/
  package.json  next.config.js  tsconfig.json  tailwind.config.ts
  postcss.config.js  .env.local.example  README.md
  public/favicon.svg
  src/
    app/            # App Router pages + API routes
      layout.tsx  globals.css  page.tsx
      campaigns/  campaign/[id]/  login/  signup/  connect/
      dashboard/  my-posts/  submit/[id]/  earnings/  brands/
      how-it-works/  terms/  privacy/  refund/  rules/  more/
      support/  onboarding/  pricing/  admin/  auth/callback/
      api/submissions/  api/admin/review/  api/admin/block/
      api/admin/unblock/  api/admin/refunds/
      api/withdrawals/  api/campaigns/  api/cron/
    components/     # Navbar, Footer, BottomNav, CampaignCard,
                    # Faq, WithdrawModal, SubmitBundleForm, MyPostsList,
                    # AdminReviewList, BrandForm, StatusBadge
    lib/            # supabase clients, types, constants, validate,
                    # money maths, data layer, sounds, views/
  src/middleware.ts # Supabase session refresh
  supabase/
    schema.sql              # consolidated SQL for the SQL Editor
    migrations/0001_initial.sql
    migrations/0002_admin_block.sql
```
