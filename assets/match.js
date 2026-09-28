// Match: a timed game. Tap a tile on the left, then its match on the right. A right pair glows
// and fades away; a wrong one shakes, adds PENALTY to the time, and marks both pairs' flashcards
// "Review" (and due now), so the flashcards and this game share one record of what's weak.
//
// Pairs come from the page's hidden .mt-data list. Pairs sharing any data-group never share a
// round, so no tile ever has two right answers.
//
// Turbo: listeners are added once on the document; the round in progress is a JS property on
// the page (page._game). A page restored by Back/Forward is a clone without it, so it simply
// deals a new round.

(function () {
  if (window.__mtInit) return;
  window.__mtInit = true;

  const ROUND = 6;
  const PENALTY = 2000;
  const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";

  const KIND_NOTE = {
    mix: "A mix of terms, examples and facts.",
    term: "Terms with their definitions.",
    example: "Ideas matched to where they show up in the reading: the move AP questions ask for.",
    fact: "The reading's numbers: worth knowing if the quiz is written from the book.",
  };
  const KIND_NAME = { mix: "Mix", term: "Terms", example: "Examples", fact: "Facts" };

  function calm() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (err) { return {}; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
  }
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  function clock(ms) {
    const t = Math.max(0, Math.floor(ms / 100));
    const m = Math.floor(t / 600), s = Math.floor(t / 10) % 60;
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (t % 10);
  }

  function data(page) { return Array.prototype.slice.call(page.querySelectorAll(".mt-data li")); }
  function opts(page) {
    const k = page.querySelector("[data-kind-pick][aria-pressed='true']");
    return { part: page.querySelector(".mt-part").value, kind: k ? k.dataset.kindPick : "mix" };
  }
  function roundKey(o) { return (o.part || "all") + "|" + o.kind; }

  // Choose up to ROUND pairs: any `must` pairs first (a retry), then the rest at random, with
  // pairs whose flashcard is marked Review twice as likely to be picked.
  function pickRound(page, o, must) {
    const marks = load(page.dataset.store);
    const all = data(page);
    const chosen = [], groups = {};
    // data-group can list several groups; a pair joins only if none of them is taken yet.
    function take(li) {
      const gs = li.dataset.group.split(/\s+/);
      if (chosen.length >= ROUND || chosen.indexOf(li) >= 0 || gs.some(function (g) { return groups[g]; })) return;
      chosen.push(li);
      gs.forEach(function (g) { groups[g] = true; });
    }
    (must || []).forEach(take);
    all.filter(function (li) {
      return (!o.part || li.dataset.part === o.part) && (o.kind === "mix" || li.dataset.kind === o.kind);
    }).map(function (li) {
      return { li: li, key: Math.random() * (marks[li.dataset.card] === "review" ? 0.5 : 1) };
    }).sort(function (a, b) { return a.key - b.key; }).forEach(function (x) { take(x.li); });
    return chosen.map(function (li) { return all.indexOf(li); });
  }

  function tile(page, i, side) {
    const li = data(page)[i];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mt-tile " + (side === "l" ? "mt-l" : "mt-r");
    b.dataset.pair = i;
    b.dataset.side = side;
    b.setAttribute("aria-pressed", "false");
    b.textContent = li.querySelector(side === "l" ? ".l" : ".r").textContent;
    return b;
  }

  function newRound(page, must) {
    const o = opts(page);
    const pairs = pickRound(page, o, must);
    const g = { pairs: pairs, key: roundKey(o), start: 0, misses: 0, missed: [], matched: 0, sel: null, done: false };
    page._game = g;

    const left = page.querySelector(".mt-left"), right = page.querySelector(".mt-right");
    left.replaceChildren.apply(left, shuffle(pairs.slice()).map(function (i) { return tile(page, i, "l"); }));
    right.replaceChildren.apply(right, shuffle(pairs.slice()).map(function (i) { return tile(page, i, "r"); }));
    page.querySelector(".mt-board").hidden = !pairs.length;
    page.querySelector(".mt-results").hidden = true;
    page.querySelector(".mt-time").textContent = clock(0);
    page.querySelector(".mt-misses").textContent = "0 misses";
    const note = page.querySelector(".mt-kind-note");
    note.textContent = KIND_NOTE[o.kind];
    const best = load(page.dataset.best)[g.key];
    page.querySelector(".mt-best").textContent = best ? "Best " + clock(best) : "";

    if (!pairs.length) { finish(page, true); return; }
    // Deal the tiles in, one after another.
    if (!calm() && left.animate) {
      page.querySelectorAll(".mt-tile").forEach(function (t, n) {
        t.animate([{ opacity: 0, transform: "translateY(12px) scale(.96)" }, { opacity: 1, transform: "none" }],
          { duration: 320, delay: n * 30, easing: EASE_OUT, fill: "backwards" });
      });
    }
  }

  function tick(page) {
    const g = page._game;
    if (!g || g.done || !document.contains(page)) return;
    page.querySelector(".mt-time").textContent = clock(performance.now() - g.start + g.misses * PENALTY);
    requestAnimationFrame(function () { tick(page); });
  }

  function select(g, t) {
    if (g.sel) g.sel.setAttribute("aria-pressed", "false");
    g.sel = t;
    if (t) t.setAttribute("aria-pressed", "true");
  }

  // A wrong match marks both pairs' flashcards Review and due now.
  function markReview(page, i) {
    const card = data(page)[i].dataset.card;
    const marks = load(page.dataset.store), srs = load(page.dataset.srs);
    marks[card] = "review";
    srs[card] = { b: 0, d: 0 };
    save(page.dataset.store, marks);
    save(page.dataset.srs, srs);
  }

  function choose(page, t) {
    const g = page._game;
    if (!g || g.done || t.classList.contains("is-right")) return;
    if (!g.start) { g.start = performance.now(); tick(page); }
    if (!g.sel || g.sel === t || g.sel.dataset.side === t.dataset.side) {
      select(g, g.sel === t ? null : t);
      return;
    }
    const a = g.sel, b = t;
    select(g, null);
    if (a.dataset.pair === b.dataset.pair) {
      [a, b].forEach(function (x) {
        x.classList.add("is-right");
        x.disabled = true;
        setTimeout(function () { x.classList.add("is-matched"); }, calm() ? 0 : 380);
      });
      g.matched++;
      if (g.matched === g.pairs.length) setTimeout(function () { finish(page); }, calm() ? 0 : 650);
      return;
    }
    g.misses++;
    [a, b].forEach(function (x) {
      x.classList.remove("is-wrong");
      void x.offsetWidth;                       // restart the shake if it's still running
      x.classList.add("is-wrong");
      setTimeout(function () { x.classList.remove("is-wrong"); }, 500);
      const i = Number(x.dataset.pair);
      if (g.missed.indexOf(i) < 0) { g.missed.push(i); markReview(page, i); }
    });
    page.querySelector(".mt-misses").textContent = g.misses + (g.misses === 1 ? " miss" : " misses");
    const pen = page.querySelector(".mt-penalty");
    pen.textContent = "+" + PENALTY / 1000 + "s";
    pen.classList.remove("show");
    void pen.offsetWidth;
    pen.classList.add("show");
  }

  function finish(page, empty) {
    const g = page._game;
    g.done = true;
    const res = page.querySelector(".mt-results");
    const board = page.querySelector(".mt-board");
    const list = data(page);
    board.hidden = true;
    res.hidden = false;
    const newBest = res.querySelector(".mt-r-best");
    const missedBox = res.querySelector(".mt-missed");
    newBest.hidden = true;
    res.querySelector("[data-mt='retry']").hidden = !g.missed.length;

    if (empty) {
      res.querySelector(".mt-r-time").textContent = "No pairs here";
      res.querySelector(".mt-r-text").textContent = "Pick another part of the reading or another kind of pair.";
      missedBox.hidden = true;
      return;
    }
    const total = performance.now() - g.start + g.misses * PENALTY;
    page.querySelector(".mt-time").textContent = clock(total);
    res.querySelector(".mt-r-time").textContent = clock(total);
    res.querySelector(".mt-r-text").textContent = g.pairs.length + " pairs · " +
      (g.misses ? g.misses + (g.misses === 1 ? " miss" : " misses") + " (+" + g.misses * PENALTY / 1000 + "s)" : "no misses");

    // Best times count only full rounds, per part of the reading and kind of pair.
    if (g.pairs.length === ROUND) {
      const bests = load(page.dataset.best);
      if (!bests[g.key] || total < bests[g.key]) {
        const had = !!bests[g.key];
        bests[g.key] = Math.round(total);
        save(page.dataset.best, bests);
        newBest.hidden = !had;
        page.querySelector(".mt-best").textContent = "Best " + clock(total);
      }
    }

    missedBox.hidden = !g.missed.length;
    missedBox.querySelector("ul").replaceChildren.apply(missedBox.querySelector("ul"), g.missed.map(function (i) {
      const li = document.createElement("li");
      const pair = document.createElement("span");
      pair.className = "mt-pair";
      pair.innerHTML = "<strong></strong><span></span>";
      pair.firstChild.textContent = list[i].querySelector(".l").textContent;
      pair.lastChild.textContent = list[i].querySelector(".r").textContent;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fc-explain";
      b.dataset.mtExplain = i;
      b.textContent = "Explain it";
      li.append(pair, b);
      return li;
    }));

    if (!calm() && res.animate) {
      res.animate([{ opacity: 0, transform: "translateY(10px) scale(.96)" }, { opacity: 1, transform: "none" }],
        { duration: 420, easing: "cubic-bezier(.2,.9,.3,1.15)" });
    }
  }

  document.addEventListener("click", function (e) {
    const page = e.target.closest && e.target.closest(".mt-page");
    if (!page) return;
    const t = e.target.closest(".mt-tile");
    if (t) { choose(page, t); return; }
    const k = e.target.closest("[data-kind-pick]");
    if (k) {
      page.querySelectorAll("[data-kind-pick]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === k)); });
      newRound(page);
      return;
    }
    const ex = e.target.closest("[data-mt-explain]");
    if (ex && window.siteExplain) {
      const li = data(page)[Number(ex.dataset.mtExplain)];
      window.siteExplain("mt-" + li.dataset.card, li.dataset.notes.split(/\s+/).filter(Boolean), page.dataset.notesFrom, ex, page);
      return;
    }
    const act = e.target.closest("[data-mt]");
    if (!act) return;
    if (act.dataset.mt === "again") newRound(page);
    else if (act.dataset.mt === "retry") {
      const list = data(page);
      newRound(page, (page._game ? page._game.missed : []).map(function (i) { return list[i]; }));
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches(".mt-part")) newRound(e.target.closest(".mt-page"));
  });

  // Options page: "Best time 0:21.4 (Mix, whole reading)".
  function bestLine() {
    document.querySelectorAll("[data-best-of]").forEach(function (el) {
      const bests = load(el.dataset.bestOf);
      let key = null;
      Object.keys(bests).forEach(function (k) { if (key === null || bests[k] < bests[key]) key = k; });
      el.hidden = key === null;
      if (key === null) return;
      const part = key.split("|")[0], kind = key.split("|")[1];
      el.textContent = "Best time " + clock(bests[key]) + " (" + (KIND_NAME[kind] || kind) + ", " +
        (part === "all" ? "whole reading" : part === "part-2-1" ? "intro and 2.1" : "2.2") + ")";
    });
  }

  function setup() {
    document.querySelectorAll(".mt-page").forEach(function (page) {
      if (!page._game) newRound(page);
    });
    bestLine();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
  document.addEventListener("turbo:load", setup);
})();
