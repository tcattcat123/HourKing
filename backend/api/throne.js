import { supabase } from "../lib/supabase.js";
import { normalizeBidKey, deriveTitle, deriveFavicon } from "../lib/util.js";

const THRONE_MIN_BID = 100;
const STEP = 1;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    /* ---- GET: permanent throne king + overtake amount ---- */
    if (req.method === "GET") {
      const { data: king, error: kingErr } = await supabase
        .from("throne_bids")
        .select("url_key, amount, title, favicon, description")
        .order("amount", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (kingErr) throw kingErr;

      const { data: full, error: fullErr } = await supabase
        .from("throne_bids")
        .select("url_key, amount")
        .order("amount", { ascending: false });

      if (fullErr) throw fullErr;

      const kingEntry = king
        ? { url: king.url_key, amount: king.amount, title: king.title, favicon: king.favicon, description: king.description || "" }
        : null;
      const overtake = kingEntry ? kingEntry.amount + 1 : THRONE_MIN_BID;

      return res.status(200).json({
        king: kingEntry,
        overtake: overtake,
        throne: (full || []).map((r) => ({ url: r.url_key, amount: r.amount }))
      });
    }

    /* ---- POST: add a bid to the permanent throne ---- */
    if (req.method === "POST") {
      const body = req.body || {};
      const urlInput = (body.url || "").trim();
      const amount = Math.round(Number(body.amount));
      const desc = (body.description || "").toString().trim();

      if (!urlInput) {
        return res.status(400).json({ error: "URL or @handle required." });
      }
      if (!Number.isFinite(amount) || amount < THRONE_MIN_BID) {
        return res.status(400).json({ error: "Minimum bid is $" + THRONE_MIN_BID + "." });
      }
      if (amount % STEP !== 0) {
        return res.status(400).json({ error: "Bids go in $" + STEP + " increments." });
      }

      const key = normalizeBidKey(urlInput);
      const title = deriveTitle(key, urlInput);
      const favicon = deriveFavicon(key);

      const { data: row, error } = await supabase
        .rpc("add_throne_bid", {
          p_url_key: key,
          p_amount: amount,
          p_title: title,
          p_favicon: favicon,
          p_desc: desc
        })
        .single();

      if (error) throw error;

      return res.status(200).json({
        entry: {
          url: key,
          amount: row.amount,
          title: row.title,
          favicon: row.favicon,
          description: row.description || ""
        }
      });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    console.error("throne error:", e);
    return res.status(500).json({ error: e.message });
  }
}