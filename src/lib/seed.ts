import type { Campaign } from "./types";
import {
  BASE_PAY,
  MAX_POSTS_PER_CAMPAIGN,
  VIEW_BONUS_PER_1K,
  VIEWS_TRACKED_DAYS,
} from "./constants";

/**
 * Sample campaigns shown when Supabase has no live campaigns yet.
 * These are examples only — a campaign only goes live on the site after a
 * brand has funded its budget. Never display a budget you cannot pay out.
 */
function c(
  id: string,
  brand_name: string,
  title: string,
  rate_per_1m: number,
  budget_total: number,
  budget_left: number,
  spots_left: number,
  spots_total: number,
  category: string,
  platform: Campaign["platform"],
  description: string,
  earn_up_to: number
): Campaign {
  return {
    id,
    brand_name,
    title,
    rate_per_1m,
    budget_total,
    budget_left,
    spots_left,
    spots_total,
    category,
    platform,
    description,
    base_pay: BASE_PAY,
    view_bonus_per_1k: VIEW_BONUS_PER_1K,
    views_tracked_days: VIEWS_TRACKED_DAYS,
    max_posts: MAX_POSTS_PER_CAMPAIGN,
    earn_up_to,
    is_funded: true,
    status: "live",
    created_at: "2026-11-07T00:00:00.000Z",
  };
}

export const SEED_CAMPAIGNS: Campaign[] = [
  c("nova-energy", "Nova Energy", "Show Your Energy — Nova Energy Drink", 1450, 8000, 6200, 34, 50, "Drinks", "tiktok", "Film yourself cracking open a Nova, your first sip reaction, and what fuels your day. High-energy, fun, real.", 300),
  c("lumen-skincare", "Lumen Skincare", "Glow Up With Lumen — Morning Routine", 1800, 6000, 4100, 22, 40, "Beauty", "instagram", "Show your honest morning skincare routine with Lumen Glow Serum. Natural light, no filters, real skin.", 300),
  c("pulse-fitness", "Pulse Fitness", "30-Second Pulse Challenge", 1200, 5000, 3800, 41, 60, "Fitness", "tiktok", "Take the 30-second Pulse challenge: 10 squats, 10 push-ups, 10 jumps. Tag a friend to try it next.", 250),
  c("echo-audio", "Echo Audio", "Echo Buds — Hear Everything", 2100, 10000, 7400, 18, 30, "Tech", "youtube", "Unbox Echo Buds, test the bass on your favourite track, and show the noise-cancelling difference.", 300),
  c("wander-travel", "Wander Travel", "One Day in Your City", 950, 4500, 2900, 47, 70, "Travel", "instagram", "Show the best one-day trip in your city using Wander to plan it. Hidden spots score extra.", 200),
  c("bloom-tea", "Bloom Tea", "Bloom Tea Calm Moments", 1100, 3500, 2100, 28, 45, "Food & Drink", "tiktok", "Brew a cup of Bloom Tea and show your calm moment — reading, sunset, rain, or a slow morning.", 200),
  c("ridge-sneakers", "Ridge Sneakers", "Ridge On The Streets", 1650, 7500, 5100, 26, 40, "Fashion", "instagram", "Style your Ridge sneakers your way — street, gym, or night out. Show the fit, the walk, the vibe.", 300),
  c("mango-music", "Mango Music", "Dance to Mango — New Single", 1350, 6000, 4400, 52, 80, "Music", "tiktok", "Create a dance or lip-sync to Mango's new single. Use the official sound and bring your own style.", 250),
  c("pixel-games", "Pixel Games", "Pixel Quest — First 60 Seconds", 1900, 9000, 6800, 15, 25, "Gaming", "youtube", "Record your first 60 seconds in Pixel Quest. Show your reaction to the opening level.", 300),
  c("cloud-coffee", "Cloud Coffee", "Cloud Coffee Morning Ritual", 1050, 4000, 2600, 33, 50, "Food & Drink", "instagram", "Make your morning Cloud Coffee, show the pour, the steam, and your first sip of the day.", 200),
  c("orbit-finance", "Orbit Finance", "Save Your First $100 With Orbit", 1500, 5500, 3900, 24, 35, "Apps", "tiktok", "Explain in 30 seconds how you would save your first $100 using Orbit. Simple, honest, no hype.", 250),
  c("vibe-fashion", "Vibe Fashion", "Vibe Fit Check — Autumn Drop", 1750, 6500, 4700, 19, 30, "Fashion", "youtube", "Show your favourite look from the Vibe autumn drop and rate the fit, fabric and price honestly.", 300),
  c("freshbox-snacks", "FreshBox", "FreshBox Snack Taste Test", 900, 3000, 1900, 44, 60, "Food & Drink", "tiktok", "Taste-test the FreshBox snack box on camera. Rank every snack and pick one winner.", 180),
  c("snaplearn", "SnapLearn", "Learn One Thing in 60 Seconds", 1250, 5000, 3600, 37, 55, "Education", "youtube", "Teach one useful thing in 60 seconds with SnapLearn. Pick a skill, a fact, or a life hack.", 250),
];

export const FEATURED_CAMPAIGN: Campaign = SEED_CAMPAIGNS[0];
