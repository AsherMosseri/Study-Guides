# Study Guides

Static study site for all subjects, served by GitHub Pages from `main` at
study.thejunkdrawerapp.com. Work directly on `main`.

```
/                                   subject picker
/human-geo/                         AP Human Geography hub
/human-geo/quiz/                    reading-quiz study guides   e.g. /human-geo/quiz/reading-2.1-2.2/
  <reading>/                        options page: What to study next, then Reading guide, Flashcards,
                                    Match, Practice quiz
  <reading>/reading/                the guide itself
  <reading>/flashcard/              one card per quizzable fact (checklist/, flashcards/ redirect here)
  <reading>/match/                  timed matching game: terms, examples, facts
  <reading>/practice/               AP-style multiple choice with an explanation for every answer
  <reading>/review/                 study sheet (+ study-sheet.pdf and study-sheet-bw.pdf, generated)
/human-geo/test/                    chapter-test study guides   e.g. /human-geo/test/chapter-2/
  <chapter>/                        options page, like a reading's
  <chapter>/reading/                ONE guide for the whole chapter: the reading guides' sections, then
                                    the rest of the chapter, then "putting it all together". Once a
                                    reading's quiz is over its guide moves in here (its notes gain
                                    "Later in Chapter 2" links) and <reading>/reading/ becomes a redirect
  <chapter>/flashcard/, match/,     cover the WHOLE chapter; the reading's cards, pairs and questions
  practice/, review/                are reused, and every one explains from the chapter guide
/human-geo/test/dtm/blank/          blank demographic transition diagram to draw and label from memory
/bio/                               Biology (planned; same quiz/ and test/ layout)
/quiz/..., /test/...                redirect pages for the old addresses; keep them
assets/style.css                    one stylesheet for every page
assets/notes.js                     click-to-explain panel, chart tooltips
assets/flashcards.js                flashcard deck: flip, swipe, Got it / Review marks
assets/match.js                     matching game; a miss marks the linked flashcard Review
assets/quiz.js                      practice quiz; a miss marks the linked flashcard Review
assets/plan.js                      "What to study next" panel: reads every tool's saved progress
assets/calc.js                      natural increase calculator
assets/dtm.js                       Blank DTM: drawing canvases, placed chart labels, word-for-word checking, line scoring
assets/js/turbo.min.js              Turbo Drive (copied from the main site)
tools/version-assets.py             stamps ?v=<hash> on every local .css/.js link
tools/make-sheet-pdf.mjs            renders each study sheet to Letter PDFs (color, black and white);
                                    SHEETS lists each sheet with its page count
```

**Adding a subject:** create `/<subject>/index.html` (copy `/human-geo/index.html`), give it
`quiz/` and `test/` folders, and turn its card on the homepage into a link. Internal links are
root-absolute (`/human-geo/quiz/`), so pages can move without breaking breadcrumbs. "Already read"
(below) is tracked per subject.

## Commits

- **Asher Mosseri is the author of every commit.** This repo's git config sets
  `user.name "Asher Mosseri"` and `user.email asher@mosseri.org`; check it before committing.
- **No `Co-Authored-By` trailers, and no `Claude-Session` or other tool attribution lines** in
  commit messages or anywhere else in the repo.
- Commit messages are sentence case and descriptive, with a body that explains *why* rather than
  what. No conventional-commit prefixes.

## Content rules

**Connect only to what has already been read.** Every "Connects to", "Apply it", AP tip and
explanation links back to material the reader has covered: Chapter 1, or earlier in the current
chapter up to the end of the page's assigned reading. Never point ahead (later sections, chapters or
AP units) and never lean on outside theories the book does not cover (Boserup, world-systems theory,
the Columbian Exchange, demographic dividend...). If an AP term is useful but not in the reading,
name it only while explaining it through an example the reader has already seen. When a new page is
added, widen "already read" to include it for pages that come after it, never before. A chapter-test guide counts the whole chapter as
read, so its notes and tables should connect across every section of the chapter; that is its
main job.

**Charts use the book's data.** Numbers come from the reading's text and figures. When a figure's
values are not printed, measure them from the figure (the pyramids were measured from bar lengths)
or use the dataset the figure cites and confirm it lands in the same bins. Don't tag charts or
notes with where things came from ("(book)", "the book's figures", "measured from...", "Source:
..."): each page's intro box says once, positively, that every chart was built for this guide from
the book's own numbers and figures, and that covers it. Keep figure and page numbers (Fig. 2.15,
p. 25) because they help find things in the PDF, and keep "the book says X; use X on the quiz"
wherever newer data or a book error could cause confusion.

**Never copy the textbook.** The reading and its photos and maps are copyrighted (Wiley, H. J. de
Blij, Elsbeth Robson). Retell every fact in original wording, and describe book figures in figure
cards with their page number instead of reproducing them. Free-licensed images (Wikimedia Commons,
NASA) are fine with a credit.

**Check facts against the book before a quiz.** Compare every card, pair, question and note with the
PDF text (page-marked), and where the book's figure and text disagree (Fig. 2.15's lower-income
pyramid shows ~28% under 15; the text says over 40%), say which to use on the quiz.

**Every fact from the reading stays in.** The teacher can quiz on anything, so every reading gets
a flashcards page with one card per quizzable fact, grouped by the guide's sections, each
answer linking to its heading in the guide (`reading/#id`). The guide ends each part with a
link to that part's deck (`flashcard/#part-2-1`). Card ids are stable: marks are saved under
them, so reword a card freely but don't rename its id. Each card is tagged `data-focus="ap"` (an idea an AP
question could apply to a map, graph or scenario) or `"detail"` (the reading's stories, field notes
and exact numbers); the deck can be filtered to either. `data-notes` lists the guide's note ids (first is the
main one) that "Explain it" pulls from `reading/`; every card needs at least one. Marks, the
spaced-repetition schedule (`srs:` key) and the deck in progress (sessionStorage) are all keyed by
card id. Each Match pair (`match/`) names its flashcard in `data-card` and takes its part and notes from
it; pairs sharing `data-group` never appear in one round, so give look-alikes the same group. Out-of-date numbers keep the book's figure and add
an "Update" box; book errors get a short note saying which value to use on the quiz. A card, Match pair or question that belongs to another guide carries `data-notes-from` (that
guide's URL) so "Explain it" loads the right notes; "In the reading" links carry `back=` so the
guide's return button goes back to the deck or quiz that sent you.

**Practice quiz questions are written for this site**, in the AP style (a pyramid, table or
situation, then apply an idea), never copied from AP Classroom or released exams (College Board
owns those). Five choices (A–E, as on the AP exam), the right one written first (the page shuffles), and every choice
carries a `data-why`: why it's right, or why it's wrong. Each question names its flashcard in
`data-card`. Questions are `data-kind="ap"` (apply an idea to a pyramid, table, passage or
situation) or `"detail"` (a fact straight from the reading); questions sharing a stimulus share a
`data-set` and are always dealt together, in order. A chart inside a question skips the "Apply it" box, since the explanation shown after
answering does that job; pyramids there come from the guide's own charts with the country renamed.

**Apply it.** Every chart has an "Apply it" box and every key-concept note (`class="term key"`) has
an "Apply it" section that uses an example from the reading to show the concept at work.

## Code rules

- **Every page carries link-preview tags** (description, canonical, og:* and twitter:*) right after
  `<title>`, with its own title, description and absolute `og:url`. `og:image` must be an absolute
  https URL. Subject pages use `og-<subject>.png`; the homepage uses `og.png`. Redirect pages copy
  their destination's tags so old links still preview.
- **Preview images and icons are generated**, not drawn by hand:
  `NODE_PATH=$(npm root -g) node tools/make-social-images.mjs && python3 tools/make-favicon.py`.
  A new subject adds an entry there. Scrapers cache images for a long time, so a redesign ships
  under a NEW filename (`og-2.png`), never a re-upload; icons likewise change by filename, not `?v=`.

- **After changing a study sheet or its styles, regenerate its PDFs:**
  `NODE_PATH=$(npm root -g) node tools/make-sheet-pdf.mjs` (it fails unless the sheet is exactly two
  pages). The sheet's print layout is two fixed blocks of three columns, never flowing CSS columns,
  which Chrome and Safari split differently. The color PDF keeps the light theme's colors; the
  black-and-white one adds `.print-bw` to `<html>`. The sheet's Color / Black and white switch picks
  which PDF Download and Print (`data-print-pdf`) use, so paper always matches the download.
- **After editing anything in `assets/`, run `python3 tools/version-assets.py`.** Cloudflare and
  browsers cache CSS/JS for hours; the hash in `?v=` is what makes them fetch the new file.
- **Asset paths are root-absolute (`/assets/...`)** so each `<head>` tag is identical on every page.
  Turbo compares head tags exactly; a relative path would look new and run the script again.
- **Scripts live in `<head>` with `defer`** and set up the page on `turbo:load` as well as on first
  load. Look elements up fresh each time; never cache them across pages.
- **"Already bound" guards are JS properties (`el._bound`), never `data-` attributes.** Back/Forward
  restores a cloned snapshot that keeps attributes but drops listeners.
- The theme toggle, pre-paint theme script and scroll-restoration script are copied from the main
  site (thejunkdrawer-website). Keep the scroll-restoration script byte-identical to the main site's.
- The site header is pinned (`position: sticky`, z-index 10) and `html` has `scroll-padding-top`
  so anchor jumps clear it. Anything else sticky or fixed must sit below it or above z-index 10.
- Dark mode: every new color needs a dark value in both dark blocks of `style.css`
  (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`).
- **No `alert()`, `confirm()` or `prompt()`.** Ask with `window.siteConfirm({ title, text, ok, cancel,
  danger })` from `notes.js`, a themed `<dialog>` that returns a Promise of true/false.
- Hover styles go inside `@media (hover: hover)`; give every button `:active` and `:focus-visible` too.
- Charts must stay readable at 390px wide: prefer HTML/CSS bars and positioned elements; SVG text
  needs a larger size under `@media (max-width: 480px)`.

Before pushing, serve the repo root (`python3 -m http.server`) and check the page in a real browser
(Playwright is installed) at desktop and phone widths, light and dark, including a Turbo visit and a
Back-button restore.
