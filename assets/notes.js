// Click-to-explain panel for study guide pages.
// Any element with data-note="id" opens the <template id="note-id"> in the panel.
// Chart marks with data-tip="text" also show a small hover tooltip.
//
// Turbo Drive swaps the <body> without reloading, and this file (in <head>) runs only once.
// So: document-level listeners are added once, page elements are looked up fresh every time
// (never cached), and per-page setup re-runs on turbo:load. "Bound" marks are JS properties,
// not data- attributes: Back/Forward restores a cloned snapshot that keeps attributes but
// drops listeners.

(function () {
  if (window.__notesInit) return;
  window.__notesInit = true;

  let lastTrigger = null;

  function panel() { return document.getElementById("panel"); }

  function openNote(id, trigger) {
    const p = panel();
    const tpl = document.getElementById("note-" + id);
    if (!p || !tpl) return;
    document.getElementById("panel-title").textContent = tpl.dataset.title || "";
    const body = document.getElementById("panel-body");
    body.replaceChildren(tpl.content.cloneNode(true));
    body.scrollTop = 0;
    p.classList.add("open");
    p.setAttribute("aria-hidden", "false");
    lastTrigger = trigger;
    p.querySelector(".panel-close").focus({ preventScroll: true });
  }

  function closeNote(restoreFocus) {
    const p = panel();
    if (!p || !p.classList.contains("open")) return;
    p.classList.remove("open");
    p.setAttribute("aria-hidden", "true");
    if (restoreFocus && lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus({ preventScroll: true });
    }
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest(".panel-close")) { closeNote(true); return; }
    const trigger = e.target.closest("[data-note]");
    if (trigger) {
      e.preventDefault();
      openNote(trigger.dataset.note, trigger);
      return;
    }
    const p = panel();
    if (p && p.classList.contains("open") && !p.contains(e.target)) closeNote(true);
  });

  // Keyboard: Enter/Space on SVG marks and figure cards, Esc closes.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeNote(true); return; }
    const t = e.target;
    if ((e.key === "Enter" || e.key === " ") && t.matches && t.matches("[data-note]:not(button)")) {
      e.preventDefault();
      openNote(t.dataset.note, t);
    }
  });

  // Hover tooltips on chart marks. The element is re-attached if Turbo replaced the body.
  let tip = null;
  function tipEl() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tip";
      tip.setAttribute("aria-hidden", "true");
    }
    if (!document.body.contains(tip)) document.body.appendChild(tip);
    return tip;
  }

  document.addEventListener("pointermove", function (e) {
    const mark = e.target.closest && e.target.closest("[data-tip]");
    if (!mark || e.pointerType === "touch") {
      if (tip) tip.classList.remove("show");
      return;
    }
    const t = tipEl();
    t.textContent = mark.dataset.tip;
    const x = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 8);
    t.style.left = x + "px";
    t.style.top = e.clientY + 16 + "px";
    t.classList.add("show");
  });

  // "Explain it" for pages that don't carry the notes themselves (flashcards, match). The notes
  // live in the reading guide as <template id="note-...">: fetch that page once, copy the wanted
  // notes into one template on this page (inside `host`, so it leaves with the page on the next
  // Turbo visit), and open it in the panel. The first note gives the title; later ones follow
  // under an "Also:" heading.
  const guides = {};
  function guideDoc(url) {
    if (!guides[url]) {
      guides[url] = fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (t) { return new DOMParser().parseFromString(t, "text/html"); })
        .catch(function (err) { delete guides[url]; throw err; });
    }
    return guides[url];
  }
  window.siteExplain = function (key, ids, from, trigger, host) {
    if (!ids.length) return;
    if (document.getElementById("note-x-" + key)) { openNote("x-" + key, trigger); return; }
    trigger.setAttribute("aria-busy", "true");
    guideDoc(from).then(function (doc) {
      const tpl = document.createElement("template");
      tpl.id = "note-x-" + key;
      ids.forEach(function (n, i) {
        const src = doc.getElementById("note-" + n);
        if (!src) return;
        if (!tpl.dataset.title) tpl.dataset.title = src.dataset.title;
        if (i > 0) {
          const h = document.createElement("p");
          h.className = "note-also";
          h.textContent = "Also: " + src.dataset.title;
          tpl.content.appendChild(h);
        }
        tpl.content.appendChild(document.importNode(src.content, true));
      });
      host.appendChild(tpl);
      openNote("x-" + key, trigger);
    }).catch(function () {
      let tpl = document.getElementById("note-x-offline");
      if (!tpl) {
        tpl = document.createElement("template");
        tpl.id = "note-x-offline";
        tpl.dataset.title = "Couldn't load the explanation";
        tpl.innerHTML = "<p>Check your connection and try again, or open the reading guide.</p>";
        host.appendChild(tpl);
      }
      openNote("x-offline", trigger);
    }).then(function () { trigger.removeAttribute("aria-busy"); });
  };

  // A styled stand-in for window.confirm, which looks different in every browser and can't be
  // themed. siteConfirm({ title, text, ok, cancel, danger }) returns a Promise of true/false.
  // It uses <dialog>, so focus stays inside, Esc cancels and the page behind is inert; Cancel
  // gets focus first, so a stray Enter never confirms something destructive.
  let openModal = null;
  window.siteConfirm = function (o) {
    if (openModal) openModal.finish(false);
    return new Promise(function (resolve) {
      const d = document.createElement("dialog");
      d.className = "modal";
      d.setAttribute("aria-labelledby", "modal-title");
      d.setAttribute("aria-describedby", "modal-text");
      d.innerHTML =
        '<div class="modal-box"><h2 class="modal-title" id="modal-title"></h2>' +
        '<p class="modal-text" id="modal-text"></p><div class="modal-actions">' +
        '<button type="button" class="modal-btn" data-v="0"></button>' +
        '<button type="button" class="modal-btn primary" data-v="1"></button></div></div>';
      d.querySelector(".modal-title").textContent = o.title || "Are you sure?";
      d.querySelector(".modal-text").textContent = o.text || "";
      d.querySelector("[data-v='0']").textContent = o.cancel || "Cancel";
      const ok = d.querySelector("[data-v='1']");
      ok.textContent = o.ok || "OK";
      if (o.danger) ok.classList.add("danger");

      let done = false;
      function finish(value) {
        if (done) return;
        done = true;
        openModal = null;
        resolve(value);
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        d.classList.add("closing");
        setTimeout(function () { if (d.open) d.close(); d.remove(); }, calm ? 0 : 160);
      }
      d.addEventListener("cancel", function (e) { e.preventDefault(); finish(false); });   // Esc
      d.addEventListener("click", function (e) {
        const b = e.target.closest(".modal-btn");
        if (b) finish(b.dataset.v === "1");
        else if (e.target === d) finish(false);   // the backdrop (the box fills the dialog itself)
      });
      openModal = { finish: finish };
      document.body.appendChild(d);
      d.showModal();
      d.querySelector("[data-v='0']").focus();
    });
  };

  // "Print" on a night-before sheet prints its PDF, which looks the same everywhere, instead of
  // the web page. Chrome, Edge and Firefox can print a PDF loaded into a hidden frame; Safari
  // (Mac and iOS) and Android can't, so there the PDF opens in a new tab to print from.
  function printPdf(url) {
    const ua = navigator.userAgent;
    const apple = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
      (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|FxiOS|Firefox/.test(ua));
    if (apple || /Android/i.test(ua)) { window.open(url, "_blank", "noopener"); return; }
    const old = document.getElementById("pdf-print-frame");
    if (old) old.remove();
    const f = document.createElement("iframe");
    f.id = "pdf-print-frame";
    f.title = "PDF to print";
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
    f.addEventListener("load", function () {
      // Give the browser's PDF viewer a moment to finish drawing before printing.
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); }
        catch (err) { window.open(url, "_blank", "noopener"); }
      }, 400);
    });
    f.src = url;
    document.body.appendChild(f);
  }
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-print-pdf]");
    if (!b) return;
    e.preventDefault();
    printPdf(b.dataset.printPdf);
  });

  // Before Turbo snapshots a page for its back/forward preview, put it back to rest.
  document.addEventListener("turbo:before-cache", function () {
    closeNote(false);
    if (tip) tip.classList.remove("show");
    if (openModal) openModal.finish(false);
  });
})();
