import { BRAND_NAME } from "@/lib/constants";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-fg">Privacy Policy</h1>
      <p className="text-sm text-fg/50">Last updated: 7 November 2026</p>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">1. What we collect</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          When you sign up, we collect your email address and password
          (stored securely by our authentication provider). After signup you
          can add your TikTok, Instagram and YouTube profile links. When you
          submit a post, we store the post links, your note on how you made
          it, and your proof screenshot links.
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
          <li>• To match your submitted clips to your profile.</li>
          <li>• To pay your approved earnings to the payout details you provide.</li>
          <li>• To keep the platform fair — for example, spotting duplicate submissions and fake engagement.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">4. Payout details</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          Payout details (USDT address, bank name + IBAN, or Wise details)
          are used only to pay you. They are never published on the site and
          never shared with brands.
        </p>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-card p-6">
        <h2 className="text-lg font-extrabold text-fg">5. Your rights</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/70">
          You can update your profile links at any time from My Accounts, and
          you can ask support to delete your account. Contact support through
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
    </div>
  );
}
