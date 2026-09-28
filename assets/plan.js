// "What to study next" on a reading's options page. It reads what the other tools saved in this
// browser (flashcard marks and schedule, quiz misses and last score, Match bests) and turns it
// into up to three next steps, a few numbers, and a strength bar for every section.
//
// The panel's data-plan holds the reading's sections (with their flashcard ids) and which
// flashcard each quiz question belongs to, so a missed quiz question counts against its section.

(function () {
  if (window.__planInit) return;
  window.__planInit = true;

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (err) { return {}; }
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function troubled(secs) {
    return secs.filter(function (r) { return r.review + r.miss > 0; })
      .sort(function (a, b) { return a.score - b.score; });
  }

  function render(box) {
    const d = JSON.parse(box.dataset.plan);
    const base = box.dataset.base;
    const marks = load(box.dataset.store), srs = load(box.dataset.srs);
    const missed = load(box.dataset.miss), last = load(box.dataset.last);
    const now = Date.now();

    const secOf = {};
    d.sections.forEach(function (sec) { sec.cards.forEach(function (c) { secOf[c] = sec.id; }); });
    const missBySec = {};
    let missedQ = 0;
    Object.keys(missed).forEach(function (q) {
      const card = d.quiz[q];
      if (!card) return;
      missedQ++;
      missBySec[secOf[card]] = (missBySec[secOf[card]] || 0) + 1;
    });

    let got = 0, review = 0, total = 0, dueSeen = 0;
    const secs = d.sections.map(function (sec) {
      const r = { id: sec.id, title: sec.title, total: sec.cards.length, got: 0, review: 0, miss: missBySec[sec.id] || 0 };
      sec.cards.forEach(function (c) {
        if (marks[c] === "got") r.got++;
        else if (marks[c] === "review") r.review++;
        // Due again: cards you knew whose time has come (Review cards have their own step).
        if (srs[c] && srs[c].d <= now && marks[c] !== "review") dueSeen++;
      });
      r.touched = r.got + r.review + r.miss > 0;
      // Lower is weaker: share known, minus a penalty for known trouble (Review marks, quiz misses).
      r.score = r.got / r.total - 0.15 * (r.review + r.miss);
      got += r.got; review += r.review; total += r.total;
      return r;
    });
    const started = got + review + missedQ > 0 || !!last.total;

    // Next steps, most useful first.
    const steps = [];
    if (!started) {
      steps.push({ label: "Start with the reading guide", why: "Every fact retold, with tap-to-explain notes.", href: base + "reading/" });
      steps.push({ label: "Then try the flashcards", why: plural(total, "card", "cards") + ", one per quizzable fact.", href: base + "flashcard/" });
      steps.push({ label: "Test yourself with a practice quiz", why: "AP-style and reading-detail questions, every answer explained.", href: base + "practice/" });
    } else {
      if (review) steps.push({ label: "Go over the " + plural(review, "card", "cards") + " you marked Review", why: "The facts you said you don't know yet.", href: base + "flashcard/#review" });
      if (missedQ) steps.push({ label: "Redo " + plural(missedQ, "quiz question", "quiz questions") + " you missed", why: "Each one leaves the list once you get it right.", href: base + "practice/?mode=missed" });
      if (dueSeen) steps.push({ label: "Review your due flashcards", why: plural(dueSeen, "card you knew is", "cards you knew are") + " due again, then new cards.", href: base + "flashcard/#due" });
      // The weakest section with known trouble; failing that, the first one not finished.
      const weak = troubled(secs)[0] || secs.filter(function (r) { return r.got < r.total; })[0];
      if (weak) steps.push({ label: "Study " + weak.title, why: weak.touched ? weak.got + " of " + weak.total + " cards known" : "Not started yet", href: base + "flashcard/#" + weak.id });
      if (!last.total) steps.push({ label: "Take a practice quiz", why: "See how the reading holds up under AP-style questions.", href: base + "practice/" });
      else steps.push({ label: "Play a round of Match", why: "Quick practice telling similar ideas apart.", href: base + "match/" });
    }
    const next = box.querySelector(".plan-next");
    next.replaceChildren.apply(next, steps.slice(0, 3).map(function (st, i) {
      const a = el("a", "plan-step" + (i === 0 ? " first" : ""));
      a.href = st.href;
      a.append(el("span", "plan-step-label", st.label), el("span", "plan-step-why", st.why));
      return a;
    }));

    // Numbers
    const stats = box.querySelector(".plan-stats");
    const pct = last.total ? Math.round(100 * last.right / last.total) + "%" : "–";
    stats.replaceChildren.apply(stats, [
      ["Cards known", got + " / " + total],
      ["Marked Review", String(review)],
      ["Quiz misses to redo", String(missedQ)],
      ["Last quiz", pct],
    ].map(function (x) {
      const t = el("div", "plan-stat");
      t.append(el("strong", "", x[1]), el("span", "", x[0]));
      return t;
    }));

    // Sections, in reading order. Up to three with known trouble (Review marks or missed quiz
    // questions), weakest first, get a "Focus" tag; untouched sections just show a dash.
    const focus = troubled(secs).slice(0, 3).map(function (r) { return r.id; });
    const list = box.querySelector(".plan-secs");
    list.replaceChildren.apply(list, secs.map(function (r) {
      const li = el("li", "plan-sec" + (focus.indexOf(r.id) >= 0 ? " focus" : ""));
      const a = el("a", "plan-sec-title", r.title);
      a.href = base + "flashcard/#" + r.id;
      const bar = el("span", "plan-bar");
      const g = el("span", "g"), rv = el("span", "r");
      g.style.width = (100 * r.got / r.total) + "%";
      rv.style.width = (100 * r.review / r.total) + "%";
      bar.append(g, rv);
      const n = el("span", "plan-sec-n", r.touched ? r.got + "/" + r.total : "–");
      li.append(a, bar, n);
      if (focus.indexOf(r.id) >= 0) li.append(el("span", "plan-tag", "Focus"));
      if (r.miss) li.title = plural(r.miss, "missed quiz question", "missed quiz questions");
      return li;
    }));
    box.hidden = false;
  }

  function setup() { document.querySelectorAll(".plan[data-plan]").forEach(render); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
  document.addEventListener("turbo:load", setup);
})();
