/** UTC hour helpers — shared with the frontend data.js semantics. */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** "2026-08-29T10" — current UTC hour key. */
export function getCurrentHourKey(d = new Date()) {
  return (
    d.getUTCFullYear() + "-" +
    pad2(d.getUTCMonth() + 1) + "-" +
    pad2(d.getUTCDate()) + "T" +
    pad2(d.getUTCHours())
  );
}

/** Milliseconds until the end of the current hour. */
export function getTimeLeftMs(d = new Date()) {
  const end = new Date(d);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(end.getUTCHours() + 1);
  return end.getTime() - d.getTime();
}
