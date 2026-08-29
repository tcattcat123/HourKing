/**
 * HourKing — application logic.
 * Vanilla JS, no frameworks. State in localStorage (demo) + in-memory.
 */
(function () {
  "use strict";

  var HK = window.HourKingData;
  var SEED_BIDS = HK.SEED_BIDS;
  var getCurrentHourKey = HK.getCurrentHourKey;
  var getTimeLeft = HK.getTimeLeft;
  var formatClock = HK.formatClock;
  var formatHourLabel = HK.formatHourLabel;

  var STORAGE_KEY = "hourking_state_v1";
  var MIN_BID = 5;
  var THRONE_MIN_BID = 100; // permanent paid spot entry
  var STEP = 1;
  var MAX_PAST_KINGS = 12;
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  var HOURLY_PRESETS = [5, 10, 25, 50, 100];
  var THRONE_PRESETS = [100, 250, 500, 1000];

  var HANDLE_ICON = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2064%2064%27%3E%3Crect%20width=%2764%27%20height=%2764%27%20rx=%2716%27%20fill=%27%23f1f5f9%27/%3E%3Ctext%20x=%2732%27%20y=%2744%27%20font-size=%2734%27%20text-anchor=%27middle%27%20fill=%27%2364748b%27%20font-family=%27Inter,Arial,sans-serif%27%20font-weight=%27700%27%3E%40%3C/text%3E%3C/svg%3E";
  var FALLBACK_ICON = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27%2394a3b8%27%3E%3Cpath%20d=%27M4.5%2017.3%202.9%206l5.3%204.3L12%204.6l3.8%205.7%205.3-4.3-1.6%2011.3H4.5Zm1.1-2.7h12.8l.9%202.7H4.7l.9-2.7Zm6.4.7%201.3.3-1.3.4z%27/%3E%3C/svg%3E";

  /* ================= STATE ================= */

  var state = loadState();
  var currentHour = getCurrentHourKey();

  function defaultState() {
    return { bidsByHour: {}, throneBids: {}, pastKings: [] };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (!parsed.throneBids) parsed.throneBids = {}; // migration
          return parsed;
        }
      }
    } catch (e) { /* corrupted -> fresh state */ }
    return defaultState();
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full / private mode */ }
  }

  function bidsFor(hour) {
    if (!state.bidsByHour[hour]) state.bidsByHour[hour] = {};
    return state.bidsByHour[hour];
  }

  /* ================= HELPERS ================= */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isHandle(input) {
    return /^@/.test(input.trim());
  }

  /** Turn raw input into a stable key: "@handle" (lowercased) or a hostname. */
  function normalizeBidKey(input) {
    var v = input.trim();
    if (isHandle(v)) return v.toLowerCase();
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try {
      return new URL(v).hostname.replace(/^www\./, "").toLowerCase();
    } catch (e) {
      return v.toLowerCase();
    }
  }

  function hostOf(key) {
    try { return new URL("https://" + key).hostname.replace(/^www\./, ""); }
    catch (e) { return key; }
  }

  function deriveTitle(key, rawInput) {
    if (key.charAt(0) === "@") return rawInput.trim();
    var first = hostOf(key).split(".")[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  function deriveFavicon(key) {
    if (key.charAt(0) === "@") return HANDLE_ICON;
    return "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(key) + "&sz=64";
  }

  function toHref(key) {
    if (key.charAt(0) === "@") return "https://twitter.com/" + key.slice(1);
    if (/^https?:\/\//i.test(key)) return key;
    return "https://" + key;
  }

  /** "$1,234" style helpers */
  function fmtN(n) { return Number(n).toLocaleString("en-US"); }
  function fmt$(n) { return "$" + fmtN(n); }

  /* ================= PREFS (personalization) ================= */

  var PREFS_KEY = "hourking_prefs_v1";

  function loadPrefs() {
    try {
      var r = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (r && typeof r === "object") return { myUrls: r.myUrls || [], lastUrl: r.lastUrl || "" };
    } catch (e) { /* ignore */ }
    return { myUrls: [], lastUrl: "" };
  }

  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  /* ================= CORE MECHANICS ================= */

  /** Sorted board for a given hour (defaults to the current one). */
  function getLeaderboard(hour) {
    hour = hour || currentHour;
    var bids = state.bidsByHour[hour] || {};
    var arr = [];
    for (var key in bids) {
      if (!Object.prototype.hasOwnProperty.call(bids, key)) continue;
      arr.push({ url: key, amount: bids[key].amount, title: bids[key].title, favicon: bids[key].favicon });
    }
    arr.sort(function (a, b) { return b.amount - a.amount; });
    return arr;
  }

  /**
   * Add a bid for the current hour. One entry per URL/@handle; bids stack.
   * @returns {{key: string, wasNew: boolean, amount: number}}
   */
  function addBid(url, amount) {
    var key = normalizeBidKey(url);
    var bids = bidsFor(currentHour);
    var existing = bids[key];
    var wasNew = !existing;
    if (existing) {
      existing.amount += amount;
    } else {
      bids[key] = { amount: amount, title: deriveTitle(key, url), favicon: deriveFavicon(key) };
    }
    saveState();
    return { key: key, wasNew: wasNew, amount: bids[key].amount };
  }

  /** How much to pay to beat the row above in the board. */
  function outbidAmount(i, lb) {
    if (i === 0) return lb[0].amount + 1;      // reinforce the throne
    return lb[i - 1].amount - lb[i].amount + 1; // beat the row above
  }

  /* ================= PERMANENT PAID SPOT (middle block) ================= */

  /** Highest all-time bidder on the permanent spot (or null). */
  function getThroneKing() {
    var bids = state.throneBids || {};
    var best = null;
    for (var key in bids) {
      if (!Object.prototype.hasOwnProperty.call(bids, key)) continue;
      var b = bids[key];
      if (!best || b.amount > best.amount) {
        best = { url: key, amount: b.amount, title: b.title, favicon: b.favicon, desc: b.desc || "" };
      }
    }
    return best;
  }

  /** Accumulate a bid on the permanent spot (never resets). */
  function addThroneBid(url, amount, desc) {
    var key = normalizeBidKey(url);
    var d = (desc || "").trim();
    if (!state.throneBids[key]) {
      state.throneBids[key] = { amount: 0, title: deriveTitle(key, url), favicon: deriveFavicon(key), desc: d };
    } else if (d) {
      state.throneBids[key].desc = d;
    }
    state.throneBids[key].amount += amount;
    saveState();
    return key;
  }

  /** Minimum total needed to hold the spot (current total + $1). */
  function throneOvertakeAmount() {
    var king = getThroneKing();
    return king ? king.amount + 1 : THRONE_MIN_BID;
  }

  /* ================= HOUR ROLLOVER ================= */

  /** Archive the #1 of the hour that just ended. Returns the king or null. */
  function crownPreviousHour() {
    var prevKey = currentHour;
    var bids = state.bidsByHour[prevKey];
    var king = null;
    if (bids) {
      var lb = getLeaderboard(prevKey);
      if (lb.length) {
        king = lb[0];
        state.pastKings = state.pastKings || [];
        state.pastKings.unshift({
          hour: prevKey,
          url: king.url,
          amount: king.amount,
          title: king.title,
          favicon: king.favicon
        });
        if (state.pastKings.length > MAX_PAST_KINGS) state.pastKings.length = MAX_PAST_KINGS;
      }
    }
    return king;
  }

  /** Detect hour boundary; archive + reset. */
  function checkHourRollover() {
    var nowKey = getCurrentHourKey();
    if (nowKey === currentHour) return false;
    var prevKey = currentHour;
    var king = crownPreviousHour(); // archives the old hour
    delete state.bidsByHour[prevKey]; // reset: old hour's bids are gone
    currentHour = nowKey;            // fresh empty board
    if (!state.bidsByHour[nowKey]) state.bidsByHour[nowKey] = {};
    saveState();
    renderAll();
    if (king) showCoronation(king, prevKey);
    return true;
  }

  /** On load, archive any hours that ended while the app was closed. */
  function migrateStaleHours() {
    var nowKey = getCurrentHourKey();
    var keys = Object.keys(state.bidsByHour || {});
    var changed = false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k < nowKey) {
        var lb = getLeaderboard(k);
        if (lb.length) {
          var king = lb[0];
          state.pastKings = state.pastKings || [];
          state.pastKings.unshift({
            hour: k, url: king.url, amount: king.amount, title: king.title, favicon: king.favicon
          });
        }
        delete state.bidsByHour[k];
        changed = true;
      }
    }
    if (changed) {
      if (state.pastKings && state.pastKings.length > MAX_PAST_KINGS) state.pastKings.length = MAX_PAST_KINGS;
      saveState();
    }
  }

  /* ================= FLIP (smooth reordering) ================= */

  var flipPrev = new Map();

  function flipCapture(list) {
    flipPrev = new Map();
    var rows = list.querySelectorAll(".row");
    for (var i = 0; i < rows.length; i++) {
      var url = rows[i].dataset.url;
      if (url) flipPrev.set(url, rows[i].getBoundingClientRect().top);
    }
  }

  function flipAnimate(list) {
    var rows = list.querySelectorAll(".row");
    for (var i = 0; i < rows.length; i++) {
      var url = rows[i].dataset.url;
      var oldTop = flipPrev.get(url);
      if (oldTop === undefined) continue; // brand new row -> CSS "new" animation
      var newTop = rows[i].getBoundingClientRect().top;
      var dy = oldTop - newTop;
      if (dy !== 0) {
        var el = rows[i];
        el.style.transition = "none";
        el.style.transform = "translateY(" + dy + "px)";
        void el.offsetHeight;
        el.style.transition = "transform 420ms " + EASE;
        el.style.transform = "translateY(0)";
        (function (node) {
          setTimeout(function () { node.style.transition = ""; node.style.transform = ""; }, 460);
        })(el);
      }
    }
  }

  /* ================= RENDER ================= */

  var prevBoard = [];
  var prevTopUrl = null;

  function renderHourKey() {
    document.getElementById("hour-key").textContent = formatHourLabel(currentHour);
  }

  function setHeaderKing(king) {
    var name = document.getElementById("ck-name");
    var amount = document.getElementById("ck-amount");
    if (king) {
      name.textContent = king.title;
      amount.textContent = fmt$(king.amount);
    } else {
      name.textContent = "\u2014";
      amount.textContent = "";
    }
  }

  function pulseHeaderCrown() {
    var c = document.querySelector(".ck-crown");
    if (!c) return;
    c.classList.remove("pulse");
    void c.offsetWidth;
    c.classList.add("pulse");
  }

  function attachFaviconFallbacks(root) {
    var imgs = root.querySelectorAll(".favicon, .past-favicon, .bp-favicon");
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener("error", function () {
        this.onerror = null;
        this.src = FALLBACK_ICON;
      });
    }
  }

  function renderBoard() {
    var list = document.getElementById("board-list");
    var empty = document.getElementById("empty-state");
    var lb = getLeaderboard();

    if (!lb.length) {
      list.innerHTML = "";
      list.hidden = true;
      empty.hidden = false;
      setHeaderKing(null);
      prevBoard = [];
      prevTopUrl = null;
      return;
    }

    flipCapture(list);
    list.hidden = false;
    empty.hidden = true;

    var prevUrls = {};
    for (var i = 0; i < prevBoard.length; i++) prevUrls[prevBoard[i].url] = prevBoard[i].amount;

    var html = "";
    var prefs = loadPrefs();
    for (var j = 0; j < lb.length; j++) {
      var e = lb[j];
      var isKing = j === 0;
      var isNew = !(e.url in prevUrls);
      var amountChanged = (e.url in prevUrls) && prevUrls[e.url] !== e.amount;
      var isMine = prefs.myUrls.indexOf(e.url) !== -1;
      var outAmt = outbidAmount(j, lb);
      var rankCls = isKing ? " rank-gold" : (j === 1 ? " rank-silver" : (j === 2 ? " rank-bronze" : ""));
      var rankHtml = isKing
        ? '<div class="rank"><svg class="rank-crown" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-crown"/></svg><span class="rank-num' + rankCls + '">#' + (j + 1) + "</span></div>"
        : '<div class="rank"><span class="rank-num' + rankCls + '">#' + (j + 1) + "</span></div>";

      var btnHtml = isKing
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-crown"/></svg><span class="outbid-text">Reinforce</span><span class="outbid-amt">' + fmt$(outAmt) + "</span>"
        : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span class="outbid-text">Outbid</span><span class="outbid-amt">+$' + fmtN(outAmt) + "</span>";

      var chips = "";
      if (isMine) chips += '<span class="you-chip">You</span>';
      if (isKing) chips += '<span class="king-badge">King of the hour</span>';

      html +=
        '<div class="row' + (isKing ? " is-king" : "") + (isMine ? " is-mine" : "") + (isNew ? " new" : "") + (amountChanged ? " flash" : "") + '" data-url="' + esc(e.url) + '">' +
          rankHtml +
          '<div class="entry">' +
            '<img class="favicon" src="' + esc(e.favicon) + '" alt="" loading="lazy">' +
            '<div class="entry-text">' +
              '<div class="entry-title">' + esc(e.title) + "</div>" +
              '<div class="entry-url mono">' + esc(e.url) + "</div>" +
            "</div>" +
            chips +
          "</div>" +
          '<div class="amount mono">' + fmt$(e.amount) + "</div>" +
          '<button class="btn-outbid" data-action="outbid" data-url="' + esc(e.url) + '" data-amount="' + outAmt + '">' + btnHtml + "</button>" +
        "</div>";
    }
    list.innerHTML = html;
    attachFaviconFallbacks(list);
    flipAnimate(list);

    var topChanged = prevTopUrl !== null && lb.length > 0 && lb[0].url !== prevTopUrl;
    if (topChanged) {
      var kingRow = list.querySelector(".row.is-king");
      if (kingRow) kingRow.classList.add("pulse");
      pulseHeaderCrown();
    }

    setHeaderKing(lb[0]);
    prevBoard = lb.map(function (x) { return { url: x.url, amount: x.amount }; });
    prevTopUrl = lb.length ? lb[0].url : null;
  }

  /* ---- Permanent paid spot (middle block, "перелив" card) ---- */
  function renderPaidSpot() {
    var wrap = document.getElementById("paid-spot");
    if (!wrap) return;
    var king = getThroneKing();
    var prefs = loadPrefs();
    var overtake = throneOvertakeAmount();
    var isMine = king && prefs.myUrls.indexOf(king.url) !== -1;

    if (!king) {
      wrap.innerHTML =
        '<span class="how-paid-badge">PAID</span>' +
        '<span class="how-num mono">02</span>' +
        "<h3>Climb</h3>" +
        "<p>The highest total this hour sits on the throne.</p>" +
        '<div class="how-paid-footer">' +
          '<span class="how-paid-price mono">From $' + THRONE_MIN_BID + "</span>" +
          '<button class="how-paid-cta" data-action="throne-cta" data-url="" data-amount="' + THRONE_MIN_BID + '">Reserve this spot<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l8-8M5.5 4H12v6.5"/></svg></button>' +
        "</div>";
      return;
    }

    var desc = king.desc || "";
    var badge = isMine ? "YOURS" : "TAKEN";
    var ctaLabel = isMine ? "Reinforce" : "Take the Throne";
    var ctaAmount = isMine ? THRONE_MIN_BID : overtake;

    wrap.innerHTML =
      '<div class="spot-ad">' +
        '<div class="spot-ad-head">' +
          '<img class="spot-ad-icon" src="' + esc(king.favicon) + '" alt="">' +
          '<div class="spot-ad-head-text">' +
            '<div class="spot-ad-title">' + esc(king.title) + "</div>" +
            '<div class="spot-ad-url mono">' + esc(king.url) + "</div>" +
          "</div>" +
          '<span class="spot-badge">' + badge + "</span>" +
        "</div>" +
        (desc ? '<p class="spot-ad-desc">' + esc(desc) + "</p>" : "") +
        '<div class="how-paid-footer">' +
          '<span class="how-paid-price mono">' + fmt$(king.amount) + " \u00b7 Overtake at " + fmt$(overtake) + "</span>" +
          '<button class="how-paid-cta" data-action="throne-cta" data-url="' + esc(isMine ? king.url : "") + '" data-amount="' + ctaAmount + '">' + ctaLabel + '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l8-8M5.5 4H12v6.5"/></svg></button>' +
        "</div>" +
      "</div>";
  }

  function renderPast() {
    var list = document.getElementById("past-list");
    var empty = document.getElementById("past-empty");
    var kings = state.pastKings || [];

    if (!kings.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    var html = "";
    for (var i = 0; i < kings.length; i++) {
      var k = kings[i];
      html +=
        '<a class="past-card" href="' + esc(toHref(k.url)) + '" target="_blank" rel="noopener noreferrer">' +
          '<div class="past-head">' +
            '<img class="past-favicon" src="' + esc(k.favicon || "") + '" alt="" loading="lazy">' +
            '<span class="past-title">' + esc(k.title || k.url) + "</span>" +
          "</div>" +
          '<div class="past-amount mono">' + fmt$(k.amount) + "</div>" +
          '<div class="past-hour mono"><svg class="past-crown" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-crown"/></svg>' + esc(formatHourLabel(k.hour)) + "</div>" +
        "</a>";
    }
    list.innerHTML = html;
    attachFaviconFallbacks(list);
  }

  function renderTimerNow() {
    var el = document.getElementById("timer");
    var box = document.getElementById("timer-box");
    var ms = getTimeLeft();
    var txt = formatClock(ms);
    if (el.textContent !== txt) el.textContent = txt;
    box.classList.toggle("danger", ms < 10 * 60 * 1000);

    var total = 60 * 60 * 1000;
    var pct = Math.min(100, Math.max(0, ((total - ms) / total) * 100));
    var bar = document.getElementById("timer-bar");
    if (bar) bar.style.width = pct.toFixed(1) + "%";
  }

  function renderAll() {
    renderHourKey();
    renderPaidSpot();
    renderBoard();
    renderPast();
    renderTimerNow();
  }

  function tick() {
    if (checkHourRollover()) return; // renderAll already ran
    renderTimerNow();
  }

  /* ================= MODAL ================= */

  var modalMode = "claim"; // "claim" | "outbid" | "throne"

  function clearActivePreset() {
    var ps = document.querySelectorAll(".preset");
    for (var i = 0; i < ps.length; i++) ps[i].classList.remove("active");
  }

  function highlightPreset(amount) {
    var ps = document.querySelectorAll(".preset");
    for (var i = 0; i < ps.length; i++) {
      ps[i].classList.toggle("active", Number(ps[i].dataset.amount) === amount);
    }
  }

  function updatePayButton() {
    var a = Number(document.getElementById("bid-amount").value) || 0;
    var action = modalMode === "throne" ? "Reserve the Spot" : (modalMode === "outbid" ? "Outbid" : "Claim");
    document.getElementById("pay-label").textContent = "Pay " + fmt$(a) + " & " + action;
  }

  /** Live preview of the throne banner as the user types. */
  function updateBannerPreview() {
    var raw = document.getElementById("bid-url").value.trim();
    var amount = Math.round(Number(document.getElementById("bid-amount").value));
    var minBid = modalMode === "throne" ? THRONE_MIN_BID : MIN_BID;
    if (isNaN(amount) || amount < minBid) amount = minBid;

    var key = "";
    if (raw) {
      try { key = normalizeBidKey(raw); } catch (e) { key = ""; }
    }
    var title = key ? deriveTitle(key, raw) : "Your product";
    var favicon = key ? deriveFavicon(key) : HANDLE_ICON;

    var u = document.getElementById("bp-url");
    var t = document.getElementById("bp-title");
    var a = document.getElementById("bp-amount");
    var f = document.getElementById("bp-favicon");
    var badge = document.getElementById("bp-badge");
    if (u) u.textContent = key || "yoursite.com";
    if (t) t.textContent = title;
    if (a) a.textContent = fmt$(amount);
    if (f) f.src = favicon;
    var d = document.getElementById("bp-desc");
    if (d) d.textContent = modalMode === "throne" ? document.getElementById("bid-desc").value.trim() : "";
    if (badge) badge.textContent = modalMode === "throne" ? "King" : "King of the hour";
  }

  function openModal(mode, url, amount) {
    modalMode = mode;
    var isThrone = mode === "throne";
    var minBid = isThrone ? THRONE_MIN_BID : MIN_BID;
    var presetsList = isThrone ? THRONE_PRESETS : HOURLY_PRESETS;

    document.getElementById("modal-title").textContent =
      isThrone ? "Reserve the Spot" : (mode === "outbid" ? "Outbid" : "Claim the Throne");

    // rebuild presets
    var presets = document.getElementById("presets");
    presets.innerHTML = presetsList.map(function (n) {
      return '<button class="preset" data-amount="' + n + '">$' + fmtN(n) + "</button>";
    }).join("");

    var u = document.getElementById("bid-url");
    if (mode === "claim" && !url) {
      var prefs = loadPrefs();
      u.value = prefs.lastUrl || "";
    } else {
      u.value = url || "";
    }

    document.getElementById("bid-amount").value = amount || minBid;
    document.getElementById("bid-amount").min = minBid;
    highlightPreset(amount || minBid);

    var descField = document.getElementById("bid-desc");
    var descLabel = document.getElementById("bid-desc-label");
    if (descField) descField.hidden = !isThrone;
    if (descLabel) descLabel.hidden = !isThrone;
    if (isThrone && descField) {
      var tkey = document.getElementById("bid-url").value.trim() ? normalizeBidKey(document.getElementById("bid-url").value) : "";
      descField.value = (tkey && state.throneBids[tkey] && state.throneBids[tkey].desc) || "";
    }

    document.getElementById("bid-error").hidden = true;
    document.getElementById("modal-overlay").hidden = false;
    document.body.style.overflow = "hidden";
    updatePayButton();
    updateBannerPreview();
    u.focus();
  }

  function closeModal() {
    document.getElementById("modal-overlay").hidden = true;
    document.body.style.overflow = "";
  }

  function showError(msg) {
    var el = document.getElementById("bid-error");
    el.textContent = msg;
    el.hidden = false;
  }

  function handlePay() {
    var urlInput = document.getElementById("bid-url").value.trim();
    var amount = Math.round(Number(document.getElementById("bid-amount").value));
    var isThrone = modalMode === "throne";
    var minBid = isThrone ? THRONE_MIN_BID : MIN_BID;

    if (!urlInput) { showError("Enter a URL or @handle."); return; }
    if (isNaN(amount) || !isFinite(amount)) { showError("Enter a valid amount."); return; }
    if (amount < minBid) { showError("Minimum bid is $" + minBid + "."); return; }
    if (amount % STEP !== 0) { showError("Bids go in $" + STEP + " increments."); return; }

    var key = isThrone ? addThroneBid(urlInput, amount, document.getElementById("bid-desc").value) : addBid(urlInput, amount).key;

    var prefs = loadPrefs();
    if (prefs.myUrls.indexOf(key) === -1) prefs.myUrls.push(key);
    prefs.lastUrl = urlInput;
    savePrefs(prefs);

    closeModal();
    var msg = isThrone
      ? "Payment successful (demo) \u00b7 " + fmt$(amount) + " toward the throne"
      : "Payment successful (demo) \u00b7 " + fmt$(amount) + " claimed";
    toast(msg);
    burstConfetti();
    renderAll();
  }

  /* ================= TOAST / CONFETTI / CORONATION ================= */

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast-text");
    var box = document.getElementById("toast");
    t.textContent = msg;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 2400);
  }

  function burstConfetti() {
    var canvas = document.getElementById("confetti");
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var colors = ["#2563eb", "#38bdf8", "#f59e0b", "#16a34a", "#7c3aed", "#0f172a"];
    var pieces = [];
    var N = 120;
    for (var i = 0; i < N; i++) {
      pieces.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 120,
        y: canvas.height / 2 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 15,
        vy: -Math.random() * 14 - 4,
        w: 6 + Math.random() * 6,
        h: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[(Math.random() * colors.length) | 0],
        life: 1
      });
    }
    var raf = null;
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        p.vy += 0.22;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.012;
        if (p.life > 0 && p.y < canvas.height) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }
      if (alive) raf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, canvas.width, canvas.height); raf = null; }
    }
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function showCoronation(king, hour) {
    var c = document.getElementById("coronation");
    document.getElementById("coro-name").textContent = king.title;
    document.getElementById("coro-sub").textContent = formatHourLabel(hour) + " \u00b7 " + fmt$(king.amount);
    c.hidden = false;
    document.body.style.overflow = "hidden";
    burstConfetti();
    setTimeout(function () {
      c.hidden = true;
      document.body.style.overflow = "";
    }, 3000);
  }

  /* ================= WIRING ================= */

  document.getElementById("claim-btn").addEventListener("click", function () { openModal("claim", "", MIN_BID); });
  document.getElementById("empty-claim-btn").addEventListener("click", function () { openModal("claim", "", MIN_BID); });

  // Permanent paid spot (middle block) — take / reinforce the throne
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-action='throne-cta']");
    if (t) {
      openModal("throne", t.dataset.url || "", Number(t.dataset.amount) || THRONE_MIN_BID);
    }
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", function (e) { if (e.target === this) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  document.getElementById("presets").addEventListener("click", function (e) {
    var btn = e.target.closest(".preset");
    if (!btn) return;
    var amt = Number(btn.dataset.amount);
    document.getElementById("bid-amount").value = amt;
    clearActivePreset();
    btn.classList.add("active");
    updatePayButton();
    updateBannerPreview();
  });

  document.getElementById("bid-amount").addEventListener("input", function () {
    clearActivePreset();
    updatePayButton();
    updateBannerPreview();
  });

  document.getElementById("bid-url").addEventListener("input", function () {
    updateBannerPreview();
  });

  document.getElementById("bid-url").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("bid-amount").focus(); }
  });
  document.getElementById("bid-amount").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); handlePay(); }
  });

  document.getElementById("board-list").addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-outbid");
    var row = e.target.closest(".row");
    var target = btn || row;
    if (!target || !target.dataset.url) return;
    var lb = getLeaderboard();
    var idx = -1;
    for (var i = 0; i < lb.length; i++) {
      if (lb[i].url === target.dataset.url) { idx = i; break; }
    }
    if (idx === -1) return;
    openModal("outbid", target.dataset.url, outbidAmount(idx, lb));
  });

  document.getElementById("pay-btn").addEventListener("click", handlePay);

  window.addEventListener("resize", function () {
    var canvas = document.getElementById("confetti");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { tick(); renderAll(); }
  });

  /* ================= INIT ================= */

  function init() {
    var firstRun = !localStorage.getItem(STORAGE_KEY);
    currentHour = getCurrentHourKey();

    if (firstRun) {
      // Seed the very first hour + a believable permanent spot owner.
      var bids = bidsFor(currentHour);
      for (var i = 0; i < SEED_BIDS.length; i++) {
        var s = SEED_BIDS[i];
        var key = normalizeBidKey(s.url);
        bids[key] = { amount: s.amount, title: s.title, favicon: deriveFavicon(key) };
      }
      state.throneBids = {};
      var tk = normalizeBidKey("https://neon.tech");
      state.throneBids[tk] = { amount: 1250, title: "Neon — Serverless Postgres", favicon: deriveFavicon(tk), desc: "Serverless Postgres. Branching, storage and compute on a planet-scale plan." };
      saveState();
    } else {
      migrateStaleHours();
    }

    renderAll();
    tick();
    setInterval(tick, 1000);
  }

  init();
})();
