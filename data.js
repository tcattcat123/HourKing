/**
 * SharkBid — data layer.
 * Mock data + hour logic (pure functions, no DOM).
 */
(function () {
  "use strict";

  // Mock seed bids for the very first run (makes the demo board alive).
  var SEED_BIDS = [
    { url: "https://neon.tech",       title: "Neon — Serverless Postgres", amount: 47 },
    { url: "@buildergroop",           title: "Builder Groop",              amount: 32 },
    { url: "https://loom.com",        title: "Loom — Async Video",         amount: 26 },
    { url: "@shipfa.st",              title: "ShipFast",                   amount: 18 },
    { url: "https://cron.quest",      title: "Cron Quest",                 amount: 9  },
    { url: "@0xreynolds",             title: "0xReynolds",                 amount: 5  }
  ];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /** "2026-08-29T10" — current UTC hour key. */
  function getCurrentHourKey(d) {
    d = d || new Date();
    return (
      d.getUTCFullYear() + "-" +
      pad2(d.getUTCMonth() + 1) + "-" +
      pad2(d.getUTCDate()) + "T" +
      pad2(d.getUTCHours())
    );
  }

  /** Milliseconds until the end of the current hour. */
  function getTimeLeft(d) {
    d = d || new Date();
    var end = new Date(d);
    end.setUTCMinutes(0, 0, 0);
    end.setUTCHours(end.getUTCHours() + 1);
    return end.getTime() - d.getTime();
  }

  /** ms -> "HH:MM:SS". */
  function formatClock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad2(h) + ":" + pad2(m) + ":" + pad2(s);
  }

  /** "2026-08-29T10" -> "10:00 UTC". */
  function formatHourLabel(hourKey) {
    var parts = hourKey.split("T");
    return parts[1] + ":00 UTC";
  }

  window.SharkBidData = {
    SEED_BIDS: SEED_BIDS,
    getCurrentHourKey: getCurrentHourKey,
    getTimeLeft: getTimeLeft,
    formatClock: formatClock,
    formatHourLabel: formatHourLabel
  };
})();
