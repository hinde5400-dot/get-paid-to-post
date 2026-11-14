"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface AdminTab {
  id: string;
  label: string;
  /** Pending/actionable count shown as a badge, e.g. Review (5). */
  count: number;
  content: ReactNode;
}

/**
 * The /admin tab shell (admin tabs, Turn's final spec): ONE page
 * with tabs — Review | Campaigns | Fraud | Brand Messages |
 * Withdrawals | Creators | Recheck | My Notes. Clicking a tab does
 * NOT reload the page: only client-side state changes (the ?tab=
 * param is synced via history.replaceState so a refresh or a
 * shared link re-opens the same tab). Inactive tabs stay mounted
 * but hidden, so a half-filled review form survives switching
 * tabs and coming back.
 *
 * Settings (admin USDT wallet + storage) is NOT a 9th tab: the
 * gear button in the tab bar toggles the settings panel in
 * place, without a reload.
 */
export default function AdminTabs({
  tabs,
  settings,
  defaultTab,
}: {
  tabs: AdminTab[];
  settings: ReactNode;
  defaultTab: string;
}) {
  const validIds = new Set(tabs.map((t) => t.id));
  const [activeTab, setActiveTab] = useState(
    validIds.has(defaultTab) ? defaultTab : tabs[0]?.id ?? ""
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Cross-tab jumps (admin tabs): a Proof button on a campaign
  // card, or the wallet warning, can ask the shell to open
  // another tab (or the settings panel) without a reload:
  //   window.dispatchEvent(new CustomEvent("admin:tab", {
  //     detail: { tab: "messages", anchor: "brand-thread-<id>" }
  //   }))
  //   window.dispatchEvent(new CustomEvent("admin:tab", {
  //     detail: { settings: true }
  //   }))
  // The anchor scrolls after the tab switch, once its panel is
  // visible again.
  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<{
        tab?: string;
        anchor?: string;
        settings?: boolean;
      }>).detail;
      if (!detail) return;
      if (detail.settings) setSettingsOpen(true);
      if (detail.tab && validIds.has(detail.tab)) {
        setActiveTab(detail.tab);
        setSettingsOpen(false);
        try {
          const params = new URLSearchParams(window.location.search);
          params.set("tab", detail.tab);
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}?${params.toString()}`
          );
        } catch {
          // Tab still switches — the URL sync is a nicety.
        }
      }
      if (detail.anchor) {
        window.setTimeout(() => {
          document
            .getElementById(detail.anchor as string)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
      }
    };
    window.addEventListener("admin:tab", onJump);
    return () => window.removeEventListener("admin:tab", onJump);
    // validIds is stable for the page's lifetime (same tabs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectTab = (id: string) => {
    setActiveTab(id);
    setSettingsOpen(false);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", id);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`
      );
    } catch {
      // Tab still switches — the URL sync is a nicety.
    }
  };

  return (
    <div>
      {/* Tab bar — sticky so the admin never loses the tabs while
          scrolling a long review list. One horizontal row that
          scrolls on mobile (8 tabs never wrap into a confusing
          stack) — swipe left/right to reach every tab. */}
      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-fg/10 bg-ink/95 px-2 py-2 backdrop-blur">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition sm:px-4 ${
                  active
                    ? "bg-red-500 text-white"
                    : "border border-fg/15 text-fg/70 hover:border-red-400/60 hover:text-fg"
                }`}
              >
                {tab.label}{" "}
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs font-black ${
                    active ? "bg-white/25 text-white" : "bg-fg/10 text-fg/70"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-label="Admin settings"
            title="Admin settings"
            className={`ml-auto shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-bold transition ${
              settingsOpen
                ? "border-red-400 bg-red-500/15 text-red-300"
                : "border-fg/15 text-fg/70 hover:border-red-400/60 hover:text-fg"
            }`}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      {/* Settings panel — toggled by the gear, never a tab. */}
      {settingsOpen && (
        <div id="admin-settings" className="mt-6">
          {settings}
        </div>
      )}

      {/* Tab panels — all mounted, inactive ones hidden, so
          half-filled review inputs survive a tab switch. */}
      <div className="mt-6">
        {tabs.map((tab) => (
          <div key={tab.id} hidden={tab.id !== activeTab}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
