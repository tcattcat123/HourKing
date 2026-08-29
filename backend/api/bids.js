import { supabase } from "../lib/supabase.js";
import { getCurrentHourKey, getTimeLeftMs } from "../lib/hour.js";
import { normalizeBidKey, deriveTitle, deriveFavicon } from "../lib/util.js";

const MIN_BID = 5;
const STEP = 1;

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // rollover stale hours before any read/write
    await supabase.rpc("rollover_hour", { p_now_hour: getCurrentHourKey() });

    const hourKey = getCurrentHourKey();

    /* ---- GET: current hourly leaderboard ---- */
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("hourly_bids")
        .select("url_key, amount, title, favicon")
        .eq("hour_key", hourKey)
        .order("amount", { ascending: false });

      if (error) throw error;

      return res.status(200).json({
        hour: hourKey,
        timeLeftMs: getTimeLeftMs(),
        board: (data || []).map((r) => ({
          url: r.url_key,
          amount: r.amount,
          title: r.title,
          favicon: r.favicon
        }))
      });
    }

    /* ---- POST: add a bid to the current hour ---- */
    if (req.method === "POST") {
      const body = req.body || {};
      const urlInput = (body.url || "").trim();
      const amount = Math.round(Number(body.amount));

      if (!urlInput) {
        return res.status(400).json({ error: "URL or @handle required." });
      }
      if (!Number.isFinite(amount) || amount < MIN_BID) {
        return res.status(400).json({ error: "Minimum bid is $" + MIN_BID + "." });
      }
      if (amount % STEP !== 0) {
        return res.status(400).json({ error: "Bids go in $" + STEP + " increments." });
      }

      const key = normalizeBidKey(urlInput);
      const title = deriveTitle(key, urlInput);
      const favicon = deriveFavicon(key);

      const { data: row, error } = await supabase
        .rpc("add_hourly_bid", {
          p_hour_key: hourKey,
          p_url_key: key,
          p_amount: amount,
          p_title: title,
          p_favicon: favicon
        })
        .single();

      if (error) throw error;

      // return updated board
      const { data: board } = await supabase
        .from("hourly_bids")
        .select("url_key, amount, title, favicon")
        .eq("hour_key", hourKey)
        .order("amount", { ascending: false });

      return res.status(200).json({
        hour: hourKey,
        timeLeftMs: getTimeLeftMs(),
        entry: { url: key, amount: row.amount, title: row.title, favicon: row.favicon },
        board: (board || []).map((r) => ({
          url: r.url_key,
          amount: r.amount,
          title: r.title,
          favicon: r.favicon
        }))
      });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    console.error("bids error:", e);
    return res.status(500).json({ error: e.message });
  }
}