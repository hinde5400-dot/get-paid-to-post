"use client";

import { useEffect, useState } from "react";
import type { Platform } from "@/lib/types";

/**
 * Video preview that plays INSIDE the admin panel (admin tabs).
 * YouTube = iframe embed. TikTok / Instagram = the official
 * embed blockquote + script (the same embed the platform itself
 * serves). If an embed cannot load, the blockquote still shows
 * its link to the post and the "Open video" link below is always
 * there — never a broken box, never a dead preview.
 *
 * Third-party scripts load only here, on the owner-only admin
 * page — never on creator pages.
 */
export default function VideoPreview({
  url,
  platform,
}: {
  url: string;
  platform: Platform;
}) {
  const [iframeFailed, setIframeFailed] = useState(false);

  const youtubeId = platform === "youtube" ? parseYoutubeId(url) : null;

  // TikTok / Instagram: load the platform's embed script once,
  // then ask it to render this blockquote. Re-runs when the URL
  // changes (a new card mounts with a new URL).
  useEffect(() => {
    if (platform === "youtube") return;
    if (platform === "tiktok") {
      const win = window as unknown as {
        tiktokEmbed?: { load?: () => void };
      };
      const process = () => {
        try {
          win.tiktokEmbed?.load?.();
        } catch {
          // Embed stays a link — never a broken box.
        }
      };
      const existing = document.querySelector(
        'script[src="https://www.tiktok.com/embed.js"]'
      );
      if (existing) {
        process();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://www.tiktok.com/embed.js";
      script.async = true;
      script.onload = process;
      document.body.appendChild(script);
      return;
    }
    if (platform === "instagram") {
      const win = window as unknown as {
        instgrm?: { Embeds?: { process?: () => void } };
      };
      const process = () => {
        try {
          win.instgrm?.Embeds?.process?.();
        } catch {
          // Embed stays a link — never a broken box.
        }
      };
      const existing = document.querySelector(
        'script[src="https://www.instagram.com/embed.js"]'
      );
      if (existing) {
        process();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://www.instagram.com/embed.js";
      script.async = true;
      script.onload = process;
      document.body.appendChild(script);
      return;
    }
  }, [platform, url]);

  // Instagram's embed script replaces the blockquote with an
  // iframe; calling process() again after it ran is harmless.
  return (
    <div className="overflow-hidden rounded-xl border border-fg/10 bg-black/40">
      {platform === "youtube" && youtubeId && !iframeFailed ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
          title="Video preview"
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onError={() => setIframeFailed(true)}
        />
      ) : platform === "tiktok" ? (
        <div className="max-h-[480px] overflow-y-auto bg-white p-2">
          <blockquote
            className="tiktok-embed"
            cite={url}
            data-video-id={parseTiktokId(url) ?? undefined}
            style={{ maxWidth: "605px", minWidth: "325px" }}
          >
            <section>
              <a target="_blank" rel="noreferrer" href={url}>
                Watch this video on TikTok
              </a>
            </section>
          </blockquote>
        </div>
      ) : platform === "instagram" ? (
        <div className="max-h-[480px] overflow-y-auto bg-white p-2">
          <blockquote
            className="instagram-media"
            data-instgrm-permalink={url}
            data-instgrm-version="14"
            style={{ maxWidth: "540px", minWidth: "326px" }}
          >
            <a target="_blank" rel="noreferrer" href={url}>
              View this post on Instagram
            </a>
          </blockquote>
        </div>
      ) : (
        <div className="p-4 text-sm text-fg/70">
          <p>
            This video can&apos;t be previewed here — open it on the
            platform to watch it.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-fg/10 bg-card px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-fg/50">
          {platform === "youtube"
            ? "YouTube"
            : platform === "tiktok"
              ? "TikTok"
              : "Instagram"}{" "}
          preview
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-bold text-limeink underline underline-offset-2 hover:text-limeink/80"
        >
          Open video ↗
        </a>
      </div>
    </div>
  );
}

/** Video id from watch?v=, youtu.be/, /shorts/ or /embed/ URLs. */
function parseYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "").split("/")[0];
      return id || null;
    }
    const v = u.searchParams.get("v");
    if (v) return v;
    const shorts = u.pathname.match(/^\/(shorts|embed)\/([\w-]{6,})/);
    if (shorts) return shorts[2];
    return null;
  } catch {
    return null;
  }
}

/** Numeric video id from a tiktok.com/.../video/<id> URL. */
function parseTiktokId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}
