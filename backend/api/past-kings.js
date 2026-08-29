import { supabase } from "../lib/supabase.js";

const MAX_PAST_KINGS = 12;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("past_kings")
        .select("hour_key, url_key, amount, title, favicon")
        .order("hour_key", { ascending: false })
        .limit(MAX_PAST_KINGS);

      if (error) throw error;

      return res.status(200).json({
        pastKings: (data || []).map((r) => ({
          hour: r.hour_key,
          url: r.url_key,
          amount: r.amount,
          title: r.title,
          favicon: r.favicon
        }))
      });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    console.error("past-kings error:", e);
    return res.status(500).json({ error: e.message });
  }
}