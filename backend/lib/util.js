/** URL/@handle normalization + display metadata (mirrors frontend logic). */

const HANDLE_ICON =
  "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2064%2064%27%3E%3Crect%20width=%2764%27%20height=%2764%27%20rx=%2716%27%20fill=%27%23f1f5f9%27/%3E%3Ctext%20x=%2732%27%20y=%2744%27%20font-size=%2734%27%20text-anchor=%27middle%27%20fill=%27%2364748b%27%20font-family=%27Inter,Arial,sans-serif%27%20font-weight=%27700%27%3E%40%3C/text%3E%3C/svg%3E";

export function isHandle(input) {
  return /^@/.test(input.trim());
}

/** Raw input -> stable key: "@handle" (lowercased) or a hostname. */
export function normalizeBidKey(input) {
  let v = String(input || "").trim();
  if (isHandle(v)) return v.toLowerCase();
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try {
    return new URL(v).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return v.toLowerCase();
  }
}

export function deriveTitle(key, rawInput) {
  if (key.charAt(0) === "@") return String(rawInput || "").trim();
  const first = key.split(".")[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function deriveFavicon(key) {
  if (key.charAt(0) === "@") return HANDLE_ICON;
  return "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(key) + "&sz=64";
}
