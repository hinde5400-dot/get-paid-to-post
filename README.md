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
| Brand minimum to launch | $500 — and the budget must be funded before the campaign goes live |
| Base pay | $10 per approved post |
| View bonus | $0.75 per 1,000 views, views tracked 14 days |
| Earnings | views / 1,000,000 × rate per 1M views, capped at the per-video max and the remaining budget |
| Approval hold | Approved earnings sit in a 72-hour hold, then become available |
| Minimum withdrawal | $10 |
| Withdrawal fee | 7% — you receive amount × 0.93 |
| Payout methods | USDT (Ethereum), Pakistani bank (bank name + IBAN), Wise (USD / GBP / EUR) |
| Submit limits | Max 7 posts per campaign; one clip per platform every 2 hours |

## Run locally

```bash
npm install
cp .env.local.example .env.local   # then fill in your own Supabase values
npm run dev                        # http://localhost:3000
```

Without Supabase keys the site still runs and shows sample campaigns, but
signup, login, submissions and withdrawals need Supabase configured.

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
7. Click Withdraw with balance under $10, then at $10+ → under $10 is
   blocked; at $10+ the modal shows the 7% fee and final amount for USDT,
   Pakistani bank and Wise.
8. Submit a brand campaign on `/brands` with a $400 budget, then $500 →
   $400 is rejected; $500 saves as an unfunded draft, not live.
9. Log out and try to open `/dashboard` directly → redirected to `/login`.

Never test payouts with real creator money. Run the first withdrawal
end-to-end with a tiny amount to your own USDT wallet and your own
Pakistani bank account first.

## Pages

| Route | Purpose |
|---|---|
| `/` | Hero, stats, Featured Campaign, campaign list, How It Works, Why, Top Earners, FAQ |
| `/campaigns` | Search + platform/category filters, sort by Highest Pay |
| `/campaign/[id]` | Budget bar, Earn up to, Base pay, view bonus, 14-day tracking, max 7 posts, Brief, submit bundle form |
| `/login`, `/signup` | Supabase Auth, email + password only, then social connect step |
| `/connect` | Connect TikTok / Instagram / YouTube profile links |
| `/dashboard`, `/my-posts` | Earnings, wallet, submissions with All / Approved / Under Review / Rejected / Revoked filters, Submission ID + Copy ID |
| `/submit/[id]` | Submit-a-post bundle page |
| `/earnings` | Available balance, 72-hour hold, withdrawn total, history, payout info |
| `/brands` | "I am a Brand" / "I am a Creator" split, 7-step How Funding Works, brand form ($500 min) |
| `/how-it-works`, `/terms`, `/privacy` | Explainer and legal pages |
| `/more`, `/support`, `/inbox`, `/news` | More page + mobile bottom nav; Discord support (placeholder, no fake invite); honest empty states |
| `/admin` | Owner-only Admin Review: approve / reject / revoke, block creators |

## Admin Review (owner-only)

The first account created becomes the owner (`users.is_admin`). Submissions
stay **Pending at $0** until the owner enters verified views and approves
(credits the 72-hour hold) or rejects. **Block** blocks a creator for
fake/bot views — blocked accounts cannot log in, re-register with the same
email, submit, or withdraw.

## APIs — publish first, then APIs

Real TikTok / Instagram / YouTube view APIs are **not** connected yet.
They are a later integration and need the owner's own free developer
accounts and approvals:

- **YouTube Data API v3** — instant, ~5–10 min, free quota.
- **TikTok** — Login Kit + Display API need a registered app and app
  review (2–3 business days; Content Posting API 1–4 weeks). Review
  needs a real live website plus Privacy Policy and Terms.
- **Instagram** — Basic Display ended 4 Dec 2024; only Business/Creator
  accounts via the Graph API. Serving other creators needs Advanced
  Access, Meta App Review and Business Verification.

Until approval, views are counted through the owner's Admin Review.
AdSense placeholder slots on Home and Campaigns earn $0 until real
AdSense approval, which needs a custom domain — a later decision, not
launch-day earnings.

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
      how-it-works/  terms/  privacy/  more/  support/
      inbox/  news/  admin/  auth/callback/
      api/submissions/  api/admin/review/  api/admin/block/
      api/withdrawals/  api/campaigns/
    components/     # Navbar, Footer, BottomNav, CampaignCard, AdSlot,
                    # Faq, WithdrawModal, SubmitBundleForm, MyPostsList,
                    # AdminReviewList, BrandForm, StatusBadge
    lib/            # supabase clients, types, constants, validate,
                    # money maths, seed campaigns, data layer, sounds
  src/middleware.ts # Supabase session refresh
  supabase/
    schema.sql              # consolidated SQL for the SQL Editor
    migrations/0001_initial.sql
    migrations/0002_admin_block.sql
```
