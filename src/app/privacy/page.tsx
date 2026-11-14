import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Get Paid To Post collects when you sign up, connect accounts and submit clips, how it is used, and how to ask for your account to be deleted.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Privacy Policy</h1>
      <p className="text-sm text-fg/50">Last updated: 14 November 2026</p>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">1. What we collect</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          When you sign up, we collect your name, email address and
          password (stored securely by our authentication provider).
          Sign-up is by email and password only. After signup you can
          add your Instagram profile link, and connect TikTok and
          YouTube with login on My accounts. If you
          connect TikTok or YouTube, we store your connected account
          name/channel and the login tokens needed to read your own
          videos&apos; view counts (tokens are stored encrypted). When
          you submit a post, we store the post links, your note on how
          you made it, and your proof screenshot links.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">2. What we do not collect</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          We do not ask for your phone number, home address, or any other
          extra personal details at signup.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">3. How we use your data</h2>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• To run your account, dashboard and wallet.</li>
          <li>• To match your submitted clips to your connected accounts.</li>
          <li>• To pay your approved earnings to the payout details you provide.</li>
          <li>• To keep the platform fair — for example, spotting duplicate submissions and fake engagement.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">4. Payout details</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Payout details (your USDT wallet address) are used only to pay
          you. They are never published on the site and never shared with
          brands.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">5. Your rights</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          You can update your profile links at any time from My Accounts, and
          you can contact support on Discord and the owner will delete
          your account manually. Contact support through
          the Discord support page.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">6. Contact</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Questions about this policy? Reach us through the Contact Support
          page on {BRAND_NAME}.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">7. Data sharing and disclosure</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          We do not sell your data, and we do not share, transfer or
          disclose Google user data to any third party for advertising,
          marketing or any other purpose, except to the service providers
          that run this platform and only as needed to operate it:
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• Supabase — our database and authentication provider, which stores your account data and login tokens.</li>
          <li>• Vercel — our hosting provider, which serves the website.</li>
          <li>• Apify — used only to read your public Instagram profile during bio-code verification.</li>
          <li>• Google — when you sign in with Google or connect YouTube, Google receives only the information needed for that sign-in and for reading your own videos&apos; view counts.</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Brands see only your public profile link and the post links you
          submit. Your login tokens, email address and Google user data are
          never shared with brands, advertisers, data brokers or any other
          third party. We do not share Google user data with any AI or
          machine-learning provider, and we do not use Google user data to
          develop, improve or train generalized AI or machine-learning
          models.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">8. How we protect your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          We protect your data, including sensitive data such as login
          tokens and payout details, with the following measures:
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-fg/70">
          <li>• All traffic to and from the site is encrypted with HTTPS (TLS).</li>
          <li>• Data is stored encrypted at rest by our database provider (Supabase), and login tokens are stored encrypted.</li>
          <li>• Passwords are never stored in plain text; they are handled by our authentication provider.</li>
          <li>• Access to your data is limited to you and the site owner (the admin), who reviews submissions and payouts. No other person has access.</li>
          <li>• We keep your data only while your account exists. When your account is deleted, your personal data, tokens and payout details are deleted with it.</li>
          <li>• We do not collect or store government IDs, payment card numbers or bank details.</li>
        </ul>
      </section>
    </div>
  );
}
