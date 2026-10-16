/* Course-wide search on the home page. On first use it fetches the lessons and the
   glossary, splits every section into blocks of text, and matches glossary terms,
   section headings and section text. Each result links straight to the section, with
   a text fragment (#id:~:text=) so the browser scrolls to the word and highlights it. */
(function () {
  var PAGES = ["01-syscalls.html", "02-blocks.html", "03-ondisk.html", "04-btrees.html",
    "05-vfs-cache.html", "06-nfs.html", "07-nfs-caching.html", "08-rdma.html", "09-distributed.html"];
  var GLOSSARY = "glossary.html";
  var BLOCKS = "p, li, dt, dd, td, th, pre, figcaption, summary, h3, h4, blockquote";
  var MAX_TERMS = 6, MAX_SECTIONS = 10;
  var WORD = /[\wÀ-ɏЀ-ӿ]/;
  // the Russian home page (ru/index.html) loads this same script next to the Russian lessons
  var TEXT = document.documentElement.lang === "ru" ? {
    glossary: "Глоссарий", lessons: "В уроках", loading: "Загружаю уроки…",
    failed: "Не удалось загрузить уроки, поэтому поиск недоступен. Попробуйте перезагрузить страницу.",
    none: function (q) { return "По запросу «" + q + "» ничего не найдено. Попробуйте более короткое слово."; }
  } : {
    glossary: "Glossary", lessons: "In the lessons", loading: "Loading the lessons…",
    failed: "Could not load the lessons, so search is unavailable. Try reloading the page.",
    none: function (q) { return "Nothing matches “" + q + "”. Try a shorter word."; }
  };

  var input = document.getElementById("sx-input");
  var panel = document.getElementById("sx-panel");
  var status = document.getElementById("sx-status");
  var list = document.getElementById("sx-list");
  if (!input) return;

  var index = null, loading = null, options = [], active = -1;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function squash(s) { return s.replace(/\s+/g, " ").trim(); }
  // case, dashes, underscores and ё fold away; the length stays the same, so a
  // position in the normalised string is a position in the original
  function norm(s) { return s.toLowerCase().replace(/[-_‐-—]/g, " ").replace(/ё/g, "е"); }
  function enc(s) { return encodeURIComponent(s).replace(/-/g, "%2D"); }

  /* ---------- building the index ---------- */
  function parse(html) { return new DOMParser().parseFromString(html, "text/html"); }

  function readLesson(file, doc) {
    var page = {
      file: file,
      num: file.slice(0, 2),
      title: squash(doc.querySelector("h1").textContent),
      layer: doc.body.getAttribute("data-layer") || "kernel",
      sections: []
    };
    doc.querySelectorAll("main section[id]").forEach(function (sec) {
      if (sec.id === "sources") return; // the footnote list would only echo source titles
      var h2 = sec.querySelector("h2");
      var s = { page: page, id: sec.id, title: h2 ? squash(h2.textContent) : sec.id, blocks: [] };
      s.ntitle = norm(s.title);
      // each text node goes to its nearest block, so nested blocks are not counted twice
      var byEl = new Map(), sub = null;
      var walk = doc.createTreeWalker(sec, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          return n.parentElement.closest("svg, script, style, h2, sup.cite") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      for (var n = walk.nextNode(); n; n = walk.nextNode()) {
        var el = n.parentElement.closest(BLOCKS);
        if (!el || !sec.contains(el)) el = sec;
        var h3 = el.closest("h3");
        if (h3) sub = { id: h3.id || null, title: squash(h3.textContent) };
        var b = byEl.get(el);
        if (!b) { b = { raw: "", sub: sub }; byEl.set(el, b); s.blocks.push(b); }
        b.raw += n.nodeValue;
      }
      s.blocks.forEach(function (b) { b.text = squash(b.raw); b.norm = norm(b.text); delete b.raw; });
      s.blocks = s.blocks.filter(function (b) { return b.text; });
      page.sections.push(s);
    });
    return page;
  }

  function readGlossary(doc) {
    var terms = [];
    doc.querySelectorAll(".entry").forEach(function (e) {
      var chip = e.querySelector(".layer-chip"), dd = e.querySelector("dd").cloneNode(true);
      dd.querySelectorAll(".layer-chip").forEach(function (c) { c.remove(); });
      var href = chip.getAttribute("href").split("#");
      var t = { term: squash(e.querySelector("dt").textContent), def: squash(dd.textContent), file: href[0], id: href[1] || "" };
      t.nterm = norm(t.term);
      t.ndef = norm(t.def);
      terms.push(t);
    });
    return terms;
  }

  function load() {
    if (!loading) {
      loading = Promise.all(PAGES.concat(GLOSSARY).map(function (f) {
        return fetch(f).then(function (r) {
          if (!r.ok) throw new Error(f + ": " + r.status);
          return r.text();
        });
      })).then(function (texts) {
        var pages = PAGES.map(function (f, i) { return readLesson(f, parse(texts[i])); });
        var sections = [], byKey = {};
        pages.forEach(function (p) {
          p.sections.forEach(function (s) { sections.push(s); byKey[p.file + "#" + s.id] = s; });
        });
        var terms = readGlossary(parse(texts[PAGES.length]));
        terms.forEach(function (t) { t.section = byKey[t.file + "#" + t.id] || null; });
        index = { sections: sections, terms: terms };
      }).catch(function (err) {
        loading = null;
        throw err;
      });
    }
    return loading;
  }

  /* ---------- matching ---------- */
  function wordStart(n, at) { return at === 0 || !WORD.test(n.charAt(at - 1)); }

  // q.all false: the whole phrase; q.all true: every word somewhere in the text
  function find(n, q) {
    if (!q.all) {
      var at = n.indexOf(q.phrase);
      if (at === -1) return null;
      // prefer an occurrence at the start of a word
      for (var i = at; i !== -1; i = n.indexOf(q.phrase, i + 1)) if (wordStart(n, i)) { at = i; break; }
      return { at: at, len: q.phrase.length, phrase: true, start: wordStart(n, at) };
    }
    for (var k = 0; k < q.words.length; k++) if (n.indexOf(q.words[k]) === -1) return null;
    at = n.indexOf(q.words[0]);
    return { at: at, len: q.words[0].length, phrase: false, start: wordStart(n, at) };
  }

  function mark(text, words) {
    var n = norm(text), ranges = [];
    words.forEach(function (w) {
      for (var i = n.indexOf(w); i !== -1; i = n.indexOf(w, i + w.length)) ranges.push([i, i + w.length]);
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var out = "", at = 0;
    ranges.forEach(function (r) {
      if (r[1] <= at) return;
      var s = Math.max(r[0], at);
      out += esc(text.slice(at, s)) + "<mark>" + esc(text.slice(s, r[1])) + "</mark>";
      at = r[1];
    });
    return out + esc(text.slice(at));
  }

  function snippet(text, at, words) {
    var start = 0, end = text.length;
    if (at > 70) {
      start = text.indexOf(" ", at - 60) + 1;
      if (start <= 0 || start > at) start = at - 60;
    }
    if (end - start > 200) {
      end = text.lastIndexOf(" ", start + 200);
      if (end <= at) end = start + 200;
    }
    return (start > 0 ? "… " : "") + mark(text.slice(start, end), words) + (end < text.length ? " …" : "");
  }

  // ":~:text=prefix-,word,-suffix": the whole word, pinned by its neighbours in the
  // same block so the browser finds this occurrence and not an earlier one
  function fragment(text, at, len) {
    var s = at, e = at + len;
    while (s > 0 && WORD.test(text.charAt(s - 1))) s--;
    while (e < text.length && WORD.test(text.charAt(e))) e++;
    var before = text.charAt(s - 1) === " " ? text.slice(0, s - 1).split(" ").slice(-3).join(" ") : "";
    var after = text.charAt(e) === " " ? text.slice(e + 1).split(" ").slice(0, 3).join(" ") : "";
    if (!before && !after) return "";
    return ":~:text=" + (before ? enc(before) + "-," : "") + enc(text.slice(s, e)) + (after ? ",-" + enc(after) : "");
  }

  function searchTerms(q) {
    var hits = [];
    index.terms.forEach(function (t) {
      var f = find(t.nterm, q), score;
      if (t.nterm === q.phrase) score = 1000;
      else if (f && f.phrase && f.at === 0) score = 600;
      else if (f && f.phrase && f.start) score = 400;
      else if (f) score = 250;
      else if (find(t.ndef, q)) score = 60;
      else return;
      hits.push({ t: t, score: score - t.term.length / 100 });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, MAX_TERMS).map(function (h) {
      var t = h.t, s = t.section, href = t.file + (t.id ? "#" + t.id : "");
      if (s) {
        // point the link at the term itself inside its section
        var tq = { phrase: t.nterm, words: t.nterm.split(" ").filter(Boolean) };
        for (var i = 0; i < s.blocks.length; i++) {
          var f = find(s.blocks[i].norm, tq);
          if (f && f.phrase) { href += fragment(s.blocks[i].text, f.at, f.len); break; }
        }
      }
      return {
        href: href,
        layer: s ? s.page.layer : "kernel",
        num: s ? s.page.num : "··",
        where: s ? s.page.title + " · " + s.title : TEXT.glossary,
        title: mark(t.term, q.marks),
        text: mark(t.def, q.marks)
      };
    });
  }

  function searchSections(q) {
    var hits = [];
    index.sections.forEach(function (s) {
      var t = find(s.ntitle, q), score = 0, best = null, quality = -1, count = 0;
      if (t) score += (t.phrase ? 300 : 150) + (t.start ? 100 : 0);
      s.blocks.forEach(function (b) {
        var f = find(b.norm, q);
        if (!f) return;
        count++;
        var qu = (f.phrase ? 2 : 0) + (f.start ? 1 : 0);
        if (qu > quality) { quality = qu; best = { b: b, f: f }; }
      });
      if (!t && !best) return;
      score += Math.min(count, 6) * 20 + Math.max(quality, 0) * 10;
      hits.push({ s: s, score: score, best: best });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, MAX_SECTIONS).map(function (h) {
      var s = h.s, b = h.best && h.best.b, f = h.best && h.best.f;
      var sub = b && b.sub, title = s.title + (sub ? " › " + sub.title : "");
      var href = s.page.file + "#" + (sub && sub.id ? sub.id : s.id);
      if (b) href += fragment(b.text, f.at, f.len);
      var first = s.blocks[0];
      return {
        href: href,
        layer: s.page.layer,
        num: s.page.num,
        where: s.page.title,
        title: mark(title, q.marks),
        text: b ? snippet(b.text, f.at, q.marks) : first ? snippet(first.text, 0, q.marks) : ""
      };
    });
  }

  /* ---------- the results panel ---------- */
  function item(r, i) {
    return '<a class="sx-item" role="option" id="sx-o' + i + '" aria-selected="false" href="' + esc(r.href) +
      '" style="--c: var(--l-' + r.layer + ')"><span class="layer-chip">' + r.num + '</span><span class="sx-main">' +
      '<span class="sx-where">' + esc(r.where) + '</span><span class="sx-title">' + r.title + '</span>' +
      (r.text ? '<span class="sx-text">' + r.text + "</span>" : "") + "</span></a>";
  }

  function group(label, rows, from) {
    if (!rows.length) return "";
    return '<div role="group" aria-label="' + label + '"><p class="sx-group" aria-hidden="true">' + label + "</p>" +
      rows.map(function (r, i) { return item(r, from + i); }).join("") + "</div>";
  }

  function open(show) {
    panel.hidden = !show;
    input.setAttribute("aria-expanded", show ? "true" : "false");
  }

  function setActive(i) {
    if (active >= 0 && options[active]) options[active].setAttribute("aria-selected", "false");
    active = i;
    if (i >= 0 && options[i]) {
      options[i].setAttribute("aria-selected", "true");
      options[i].scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", options[i].id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function render() {
    var raw = input.value.trim();
    var words = norm(raw).split(/\s+/).filter(Boolean);
    options = [];
    active = -1;
    input.removeAttribute("aria-activedescendant");
    if (words.join("").length < 2) { list.innerHTML = ""; status.textContent = ""; open(false); return; }
    open(true);
    if (!index) {
      list.innerHTML = "";
      status.textContent = TEXT.loading;
      load().then(render, function () {
        status.textContent = TEXT.failed;
      });
      return;
    }
    // the exact phrase first; only if it is nowhere, every word anywhere in one block
    var phrase = words.join(" ");
    var q = { phrase: phrase, words: words, marks: [phrase], all: false };
    var terms = searchTerms(q), sections = searchSections(q);
    var spread = words.filter(function (w) { return w.length > 1; });
    if (!terms.length && !sections.length && words.length > 1 && spread.length) {
      q = { phrase: phrase, words: spread, marks: spread, all: true };
      terms = searchTerms(q);
      sections = searchSections(q);
    }
    list.innerHTML = group(TEXT.glossary, terms, 0) + group(TEXT.lessons, sections, terms.length);
    options = Array.prototype.slice.call(list.querySelectorAll(".sx-item"));
    var n = terms.length + sections.length;
    status.textContent = n ? "" : TEXT.none(raw);
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", function () {
    load().catch(function () {});
    if (input.value.trim()) render();
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!options.length) return;
      e.preventDefault();
      var d = e.key === "ArrowDown" ? 1 : -1;
      setActive(active < 0 ? (d > 0 ? 0 : options.length - 1) : (active + d + options.length) % options.length);
    } else if (e.key === "Enter") {
      var target = options[active >= 0 ? active : 0];
      if (target) { e.preventDefault(); location.href = target.href; }
    } else if (e.key === "Escape") {
      if (!panel.hidden) { e.preventDefault(); open(false); }
    }
  });
  list.addEventListener("mousemove", function (e) {
    var a = e.target.closest(".sx-item");
    if (a && options.indexOf(a) !== active) setActive(options.indexOf(a));
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".sx-field")) open(false);
  });
  // "/" jumps to the search box from anywhere on the page
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
})();
