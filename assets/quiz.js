// Practice quiz: AP-style multiple choice built from the page's hidden .qz-data list (the right
// answer is always written first there; each quiz shuffles the choices).
//
// Modes: "practice" checks each answer as you go; "test" saves the answers for the end.
// A missed question marks its flashcard Review and due now, like a miss in Match, and joins the
// "missed" list (data-miss) until it's answered right, which "Only ones I've missed" draws from.
// Questions with the same data-set share one stimulus; they're always dealt together, in order.
//
// The quiz in progress lives in data-state (survives a Back/Forward clone) and in sessionStorage
// (survives leaving for the reading through "In the reading" and coming back), so you land on
// the same question with the same answer picked.

(function () {
  if (window.__qzInit) return;
  window.__qzInit = true;

  const LETTERS = "ABCDE";   // five choices, like the AP exam
  const SKILL = { concept: "Concept", data: "Data", visual: "Visual", scale: "Scale", detail: "Reading detail" };
  const SKILL_NOTE = {
    concept: "Apply an idea to a situation",
    data: "Read numbers and calculate",
    visual: "Read a pyramid or chart",
    scale: "Think about local vs. global",
    detail: "Recall a fact from the reading",
  };

  function calm() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function play(el, frames, ms, easing) {
    if (!el.animate || calm()) return null;
    return el.animate(frames, { duration: ms, easing: easing || "cubic-bezier(.2,.8,.2,1)" });
  }
  function load(key, store) {
    try { return JSON.parse((store || localStorage).getItem(key)) || {}; } catch (err) { return {}; }
  }
  function save(key, value, store) {
    try { (store || localStorage).setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
  }
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  function mmss(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function getState(page) {
    try { return JSON.parse(page.dataset.state || "null"); } catch (err) { return null; }
  }
  function setState(page, s) {
    if (s) {
      page.dataset.state = JSON.stringify(s);
      save("qzstate:" + page.dataset.store, s, sessionStorage);
    } else {
      delete page.dataset.state;
      try { sessionStorage.removeItem("qzstate:" + page.dataset.store); } catch (err) { /* unavailable */ }
    }
  }
  function item(id) { return document.getElementById(id); }
  function choicesOf(id) { return item(id).querySelectorAll(".ch > li"); }

  function pressed(page, attr) {
    const b = page.querySelector("[" + attr + "][aria-pressed='true']");
    return b ? b.getAttribute(attr) : null;
  }
  function pick(page, attr, value) {
    page.querySelectorAll("[" + attr + "]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value));
    });
  }

  // ---------- Starting ----------
  // The questions the start screen's filters allow (part of the reading, type, missed-only).
  function eligible(page, fromOverride) {
    const part = page.querySelector(".qz-part").value;
    const type = pressed(page, "data-type") || "all";
    const from = fromOverride || pressed(page, "data-from") || "all";
    const missed = load(page.dataset.miss);
    return Array.prototype.filter.call(page.querySelectorAll(".qz-item"), function (li) {
      return (!part || li.dataset.part === part) && (type === "all" || li.dataset.kind === type) &&
        (from !== "missed" || missed[li.id]);
    }).map(function (li) { return li.id; });
  }

  // Shuffle whole sets (and single questions), then deal them until the quiz is long enough.
  // A set is never split, so a quiz can run a question or two past the chosen length.
  function deal(ids, len) {
    const groups = [], seen = {};
    ids.forEach(function (id) {
      const set = item(id).dataset.set;
      if (!set) { groups.push([id]); return; }
      if (!seen[set]) { seen[set] = []; groups.push(seen[set]); }
      seen[set].push(id);
    });
    shuffle(groups);
    const out = [];
    groups.forEach(function (g) { if (len === "all" || out.length < Number(len)) out.push.apply(out, g); });
    return out;
  }

  function start(page, only) {
    const len = pressed(page, "data-len") || "10";
    const mode = pressed(page, "data-mode") || "practice";
    const from = pressed(page, "data-from") || "all";
    const pool = only && only.length ? deal(only, "all")
      : deal(eligible(page), from === "missed" ? "all" : len);
    if (!pool.length) return;
    const perm = {};
    pool.forEach(function (id) { perm[id] = shuffle(choicesOf(id).length === 5 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]); });
    const s = { mode: mode, order: pool, perm: perm, picked: {}, checked: {}, index: 0, used: 0, done: false };
    setState(page, s);
    show(page, s, "next");
  }

  // ---------- Drawing ----------
  function show(page, s, dir) {
    page.querySelector(".qz-start").hidden = !!s;
    page.querySelector(".qz-run").hidden = !s || s.done;
    page.querySelector(".qz-results").hidden = !s || !s.done;
    if (!s) { lastLine(page); return; }
    if (s.done) { results(page, s); return; }

    const id = s.order[s.index];
    const li = item(id);
    const total = s.order.length;
    page.querySelector(".qz-count").textContent = "Question " + (s.index + 1) + " of " + total;
    const skill = page.querySelector(".qz-skill");
    skill.textContent = SKILL[li.dataset.skill];
    skill.className = "qz-skill " + li.dataset.skill;
    skill.title = SKILL_NOTE[li.dataset.skill];
    page.querySelector(".qz-bar span").style.width = (100 * s.index / total) + "%";
    page.querySelector(".qz-stimbox").innerHTML = li.querySelector(".stim").innerHTML;
    // "Questions 4–6 use this table": the run of neighbors in this quiz from the same set.
    const note = page.querySelector(".qz-setnote");
    let a = s.index, b = s.index;
    if (li.dataset.set) {
      while (a > 0 && item(s.order[a - 1]).dataset.set === li.dataset.set) a--;
      while (b < total - 1 && item(s.order[b + 1]).dataset.set === li.dataset.set) b++;
    }
    note.hidden = a === b;
    if (a !== b) {
      const what = li.querySelector(".qz-pyr") ? "pyramid" : li.querySelector(".qz-passage") ? "passage" : "table";
      note.textContent = "Questions " + (a + 1) + "–" + (b + 1) + " use this " + what + ".";
    }
    page.querySelector(".qz-stem").textContent = li.querySelector(".stem").textContent;

    const box = page.querySelector(".qz-choices");
    const src = choicesOf(id);
    box.replaceChildren.apply(box, s.perm[id].map(function (orig, n) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "qz-choice";
      b.dataset.orig = orig;
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<span class="qz-letter"></span><span class="qz-text"></span><span class="qz-cwhy"></span>';
      b.querySelector(".qz-letter").textContent = LETTERS[n];
      b.querySelector(".qz-text").textContent = src[orig].textContent;
      return b;
    }));
    paintAnswer(page, s);

    const card = page.querySelector(".qz-card");
    if (dir === "next") play(card, [{ opacity: 0, transform: "translateX(28px)" }, { opacity: 1, transform: "none" }], 320);
    if (dir === "prev") play(card, [{ opacity: 0, transform: "translateX(-28px)" }, { opacity: 1, transform: "none" }], 320);
    tick(page);
  }

  // Selected choice, and (once checked) right/wrong marks, reasons and the feedback box.
  function paintAnswer(page, s) {
    const id = s.order[s.index];
    const picked = s.picked[id];
    const checked = !!s.checked[id];
    const src = choicesOf(id);
    page.querySelectorAll(".qz-choice").forEach(function (b) {
      const orig = Number(b.dataset.orig);
      b.setAttribute("aria-pressed", String(orig === picked));
      b.classList.toggle("is-right", checked && orig === 0);
      b.classList.toggle("is-wrong", checked && orig === picked && orig !== 0);
      b.classList.toggle("is-checked", checked);
      b.disabled = checked;
      b.querySelector(".qz-cwhy").textContent = checked && orig !== 0 ? src[orig].dataset.why : "";
    });
    const fb = page.querySelector(".qz-feedback");
    fb.hidden = !checked;
    if (checked) {
      const right = picked === 0;
      const v = fb.querySelector(".qz-verdict");
      v.textContent = right ? "Correct" : "Not quite. The answer is " + LETTERS[s.perm[id].indexOf(0)] + ".";
      v.className = "qz-verdict " + (right ? "right" : "wrong");
      fb.querySelector(".qz-why").textContent = src[0].dataset.why;
      fb.querySelector(".qz-read").href = readingHref(item(id).dataset.href);
    }
    const main = page.querySelector(".qz-main");
    const last = s.index === s.order.length - 1;
    if (s.mode === "practice") {
      main.textContent = !checked ? "Check" : last ? "See results" : "Next question";
      main.disabled = picked === undefined;
    } else {
      main.textContent = last ? "Finish" : "Next";
      main.disabled = picked === undefined;
    }
    page.querySelector("[data-qz='prev']").hidden = s.mode !== "test" || s.index === 0;
  }

  function readingHref(href) {
    const i = href.indexOf("#");
    return i < 0 ? href + "?from=quiz" : href.slice(0, i) + "?from=quiz" + href.slice(i);
  }

  // The clock counts time spent on questions; it pauses while you're away from the page.
  function tick(page) {
    if (page._ticking) return;
    page._ticking = true;
    let last = performance.now();
    function frame(now) {
      const s = getState(page);
      if (!s || s.done || !document.contains(page)) { page._ticking = false; return; }
      if (now - last >= 250) {
        s.used += now - last;
        last = now;
        setState(page, s);
        page.querySelector(".qz-time").textContent = mmss(s.used);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Answering ----------
  function choose(page, b) {
    const s = getState(page);
    const id = s.order[s.index];
    if (s.checked[id]) return;
    s.picked[id] = Number(b.dataset.orig);
    setState(page, s);
    paintAnswer(page, s);
    play(b, [{ transform: "scale(.98)" }, { transform: "scale(1.01)" }, { transform: "none" }], 220);
  }

  // Keep the "missed" list: a wrong answer adds the question, a right one clears it.
  function record(page, id, right) {
    const missed = load(page.dataset.miss);
    if (right) delete missed[id]; else missed[id] = 1;
    save(page.dataset.miss, missed);
  }

  // A miss marks the question's flashcard Review and due now.
  function markMiss(page, id) {
    const card = item(id).dataset.card;
    const marks = load(page.dataset.store), srs = load(page.dataset.srs);
    marks[card] = "review";
    srs[card] = { b: 0, d: 0 };
    save(page.dataset.store, marks);
    save(page.dataset.srs, srs);
  }

  function check(page) {
    const s = getState(page);
    const id = s.order[s.index];
    if (s.picked[id] === undefined || s.checked[id]) return;
    s.checked[id] = true;
    setState(page, s);
    record(page, id, s.picked[id] === 0);
    if (s.picked[id] !== 0) markMiss(page, id);
    paintAnswer(page, s);
    const chosen = page.querySelector(".qz-choice[aria-pressed='true']");
    if (s.picked[id] === 0) play(chosen, [{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "none" }], 360, "cubic-bezier(.2,.9,.3,1.3)");
    else play(chosen, [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "none" }], 400, "ease");
    play(page.querySelector(".qz-feedback"), [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], 300);
  }

  function go(page, step) {
    const s = getState(page);
    s.index += step;
    if (s.index >= s.order.length) { finish(page, s); return; }
    setState(page, s);
    show(page, s, step > 0 ? "next" : "prev");
    page.querySelector(".qz-head").scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
  }

  function mainAction(page) {
    const s = getState(page);
    const id = s.order[s.index];
    if (s.picked[id] === undefined) return;
    if (s.mode === "practice" && !s.checked[id]) { check(page); return; }
    go(page, 1);
  }

  function finish(page, s) {
    // Test mode: grade everything now.
    s.order.forEach(function (id) {
      if (!s.checked[id]) {
        s.checked[id] = true;
        record(page, id, s.picked[id] === 0);
        if (s.picked[id] !== 0) markMiss(page, id);
      }
    });
    s.done = true;
    s.index = s.order.length - 1;
    const right = s.order.filter(function (id) { return s.picked[id] === 0; }).length;
    save(page.dataset.last, { right: right, total: s.order.length, when: Date.now() });
    setState(page, s);
    show(page, s);
    window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });
  }

  // ---------- Results ----------
  function results(page, s) {
    const total = s.order.length;
    const right = s.order.filter(function (id) { return s.picked[id] === 0; }).length;
    const pct = total ? Math.round(100 * right / total) : 0;
    page.querySelector(".qz-score-num strong").textContent = right;
    page.querySelector(".qz-score-num span").textContent = "of " + total;
    page.querySelector(".qz-score-text").textContent = pct + "% · " + mmss(s.used) + " · " +
      (pct >= 90 ? "Excellent." : pct >= 70 ? "Solid. Review the misses below." : "Keep going: the explanations below are the fastest way up.");

    const fill = page.querySelector(".qz-ring .fill");
    const C = 2 * Math.PI * 52;
    fill.style.strokeDasharray = C;
    fill.style.strokeDashoffset = C * (1 - right / Math.max(total, 1));
    play(fill, [{ strokeDashoffset: C }, { strokeDashoffset: C * (1 - right / Math.max(total, 1)) }], 900, "cubic-bezier(.3,.8,.3,1)");
    fill.classList.toggle("low", pct < 70);

    // Score by skill
    const by = {};
    s.order.forEach(function (id) {
      const k = item(id).dataset.skill;
      by[k] = by[k] || { right: 0, total: 0 };
      by[k].total++;
      if (s.picked[id] === 0) by[k].right++;
    });
    const sk = page.querySelector(".qz-skills");
    sk.replaceChildren.apply(sk, Object.keys(SKILL).filter(function (k) { return by[k]; }).map(function (k) {
      const row = document.createElement("div");
      row.className = "qz-skillrow";
      row.innerHTML = '<span class="qz-sk-name"></span><span class="qz-sk-bar"><span></span></span><span class="qz-sk-n"></span>';
      row.querySelector(".qz-sk-name").textContent = SKILL[k];
      row.querySelector(".qz-sk-name").title = SKILL_NOTE[k];
      row.querySelector(".qz-sk-bar span").style.width = (100 * by[k].right / by[k].total) + "%";
      row.querySelector(".qz-sk-n").textContent = by[k].right + "/" + by[k].total;
      return row;
    }));

    // Review list: every question, misses first, each with its explanation.
    const missed = s.order.filter(function (id) { return s.picked[id] !== 0; });
    page.querySelector("[data-qz='retry']").hidden = !missed.length;
    const list = page.querySelector(".qz-review");
    list.replaceChildren.apply(list, missed.concat(s.order.filter(function (id) { return s.picked[id] === 0; })).map(function (id) {
      const src = choicesOf(id);
      const ok = s.picked[id] === 0;
      const li = document.createElement("li");
      li.className = "qz-rev " + (ok ? "right" : "wrong");
      li.innerHTML = '<details><summary><span class="qz-rev-mark"></span><span class="qz-rev-stem"></span></summary>' +
        '<div class="qz-rev-body"><div class="qz-rev-stim"></div><p class="qz-rev-you"></p><p class="qz-rev-ans"></p>' +
        '<p class="qz-rev-why"></p><p class="qz-links"><button type="button" class="fc-explain" data-qz-explain=""></button>' +
        '<a class="fc-link" href="#">In the reading</a></p></div></details>';
      li.querySelector(".qz-rev-mark").textContent = ok ? "✓" : "✗";
      li.querySelector(".qz-rev-stem").textContent = item(id).querySelector(".stem").textContent;
      li.querySelector(".qz-rev-stim").innerHTML = item(id).querySelector(".stim").innerHTML;
      const you = s.picked[id] === undefined ? "No answer" : src[s.picked[id]].textContent;
      li.querySelector(".qz-rev-you").innerHTML = "<strong>Your answer:</strong> ";
      li.querySelector(".qz-rev-you").append(you);
      if (!ok && s.picked[id] !== undefined) {
        const w = document.createElement("span");
        w.className = "qz-rev-wrongwhy";
        w.textContent = " " + src[s.picked[id]].dataset.why;
        li.querySelector(".qz-rev-you").append(w);
      }
      li.querySelector(".qz-rev-ans").innerHTML = "<strong>Answer:</strong> ";
      li.querySelector(".qz-rev-ans").append(src[0].textContent);
      li.querySelector(".qz-rev-why").textContent = src[0].dataset.why;
      const ex = li.querySelector("[data-qz-explain]");
      ex.dataset.qzExplain = id;
      ex.textContent = "Explain it";
      li.querySelector(".fc-link").href = readingHref(item(id).dataset.href);
      if (!ok) li.querySelector("details").open = missed.indexOf(id) < 3;
      return li;
    }));
    play(page.querySelector(".qz-results"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 420);
  }

  // Start screen: counts on the Type and "Only ones I've missed" buttons for the chosen part.
  function counts(page) {
    ["all", "ap", "detail"].forEach(function (t) {
      const b = page.querySelector("[data-type='" + t + "'] .n");
      const part = page.querySelector(".qz-part").value;
      b.textContent = Array.prototype.filter.call(page.querySelectorAll(".qz-item"), function (li) {
        return (!part || li.dataset.part === part) && (t === "all" || li.dataset.kind === t);
      }).length;
    });
    const n = eligible(page, "missed").length;
    const mb = page.querySelector("[data-from='missed']");
    mb.querySelector(".n").textContent = n;
    mb.disabled = !n;
    if (!n && pressed(page, "data-from") === "missed") pick(page, "data-from", "all");
    page.querySelector(".qz-len").hidden = pressed(page, "data-from") === "missed";
    page.querySelector("[data-qz='start']").disabled = !eligible(page).length;
  }

  function lastLine(page) {
    counts(page);
    const el = page.querySelector(".qz-last");
    const last = load(page.dataset.last);
    el.hidden = !last.total;
    if (last.total) el.textContent = "Last time: " + last.right + " of " + last.total + " (" + Math.round(100 * last.right / last.total) + "%)";
  }

  function explain(page, id, trigger) {
    if (!window.siteExplain) return;
    window.siteExplain("qz-" + id, item(id).dataset.notes.split(/\s+/).filter(Boolean), page.dataset.notesFrom, trigger, page);
  }

  // ---------- Events ----------
  document.addEventListener("click", function (e) {
    const page = e.target.closest && e.target.closest(".qz-page");
    if (!page) return;
    const c = e.target.closest(".qz-choice");
    if (c) { choose(page, c); return; }
    const len = e.target.closest("[data-len]");
    if (len) { pick(page, "data-len", len.dataset.len); return; }
    const mode = e.target.closest("[data-mode]");
    if (mode) { pick(page, "data-mode", mode.dataset.mode); return; }
    const type = e.target.closest("[data-type]");
    if (type) { pick(page, "data-type", type.dataset.type); counts(page); return; }
    const from = e.target.closest("[data-from]");
    if (from && !from.disabled) { pick(page, "data-from", from.dataset.from); counts(page); return; }
    const rx = e.target.closest("[data-qz-explain]");
    if (rx) { explain(page, rx.dataset.qzExplain, rx); return; }
    const act = e.target.closest("[data-qz]");
    if (!act || act.disabled) return;
    const s = getState(page);
    switch (act.dataset.qz) {
      case "start": start(page); break;
      case "main": mainAction(page); break;
      case "prev": go(page, -1); break;
      case "explain": if (s) explain(page, s.order[s.index], act); break;
      case "new": setState(page, null); show(page, null); break;
      case "retry": start(page, s.order.filter(function (id) { return s.picked[id] !== 0; })); break;
      case "quit":
        window.siteConfirm({ title: "Quit this quiz?", text: "Your answers so far won't be scored.", ok: "Quit", cancel: "Keep going", danger: true })
          .then(function (yes) { if (yes && document.contains(page)) { setState(page, null); show(page, null); } });
        break;
    }
  });

  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches(".qz-part")) counts(e.target.closest(".qz-page"));
  });

  document.addEventListener("keydown", function (e) {
    const page = document.querySelector(".qz-page");
    if (!page || page.querySelector(".qz-run").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const panel = document.getElementById("panel");
    if (panel && panel.classList.contains("open")) return;
    if (e.target.closest && e.target.closest("select, input, textarea, a")) return;
    const k = e.key.toUpperCase();
    const n = LETTERS.indexOf(k) >= 0 ? LETTERS.indexOf(k) : "12345".indexOf(e.key);
    if (n >= 0 && k.length === 1) {
      const b = page.querySelectorAll(".qz-choice")[n];
      if (b && !b.disabled) { e.preventDefault(); choose(page, b); b.focus({ preventScroll: true }); }
    } else if (e.key === "Enter" && !(e.target.closest && e.target.closest("button:not(.qz-choice)"))) {
      e.preventDefault();
      // Enter on a focused choice picks it first; after that, Enter checks and moves on.
      const c = e.target.closest && e.target.closest(".qz-choice");
      if (c && !c.disabled && c.getAttribute("aria-pressed") !== "true") choose(page, c);
      else mainAction(page);
    }
  });

  // Options page: "Last score 8 of 10 (80%)".
  function lastOf() {
    document.querySelectorAll("[data-last-of]").forEach(function (el) {
      const last = load(el.dataset.lastOf);
      el.hidden = !last.total;
      if (last.total) el.textContent = "Last score " + last.right + " of " + last.total + " (" + Math.round(100 * last.right / last.total) + "%)";
    });
  }

  function setup() {
    document.querySelectorAll(".qz-page").forEach(function (page) {
      let s = getState(page) || load("qzstate:" + page.dataset.store, sessionStorage);
      // Drop a saved quiz whose questions (or number of choices) no longer match the page.
      if (!s.order || !s.order.every(function (id) { return item(id) && s.perm[id] && s.perm[id].length === choicesOf(id).length; })) s = null;
      // Arriving from "What to study next" with ?mode=missed: a fresh missed-only quiz, whatever
      // was open before (the link is an explicit choice). The parameter is dropped at once, so a
      // reload keeps the new quiz instead of starting yet another.
      const wantMissed = new URLSearchParams(location.search).get("mode") === "missed";
      if (wantMissed) { history.replaceState(history.state, "", location.pathname); s = null; }
      if (s) setState(page, s); else setState(page, null);
      show(page, s);
      if (wantMissed) {
        page.querySelector(".qz-part").value = "";
        pick(page, "data-type", "all");
        if (eligible(page, "missed").length) { pick(page, "data-from", "missed"); counts(page); start(page); }
      }
    });
    lastOf();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
  document.addEventListener("turbo:load", setup);
})();
