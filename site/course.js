/* fill the top-bar menus from the rail and the contents list on the page */
(function () {
  var rail = document.querySelector(".layout > .rail"), route = document.querySelector("details.route");
  if (rail && route && !route.querySelector(".rail")) route.appendChild(rail.cloneNode(true));
  var toc = document.querySelector(".lesson-head .toc"), menu = document.querySelector("details.sections");
  if (toc && menu && !menu.querySelector(".toc")) {
    var copy = toc.cloneNode(true), title = copy.querySelector("b");
    if (title) title.remove();
    menu.appendChild(copy);
  }
})();
(function () {
  var menus = "details.route[open], details.sections[open]";
  document.addEventListener("click", function (e) {
    document.querySelectorAll(menus).forEach(function (d) {
      if (!d.contains(e.target) || (e.target.closest("a") && d.contains(e.target))) d.open = false;
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(menus).forEach(function (d) {
      d.open = false; d.querySelector("summary").focus();
    });
  });
  // mark the section being read in both contents lists
  var links = document.querySelectorAll('nav.toc a[href^="#"]');
  if (!links.length) return;
  var secs = [], seen = {};
  links.forEach(function (a) {
    var s = document.getElementById(a.hash.slice(1));
    if (s && !seen[s.id]) { seen[s.id] = true; secs.push(s); }
  });
  var current, queued = false;
  function update() {
    queued = false;
    var id = null, line = window.innerHeight * 0.3;
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top > line) break;
      id = secs[i].id;
    }
    // at the very bottom the last sections cannot reach the line
    var root = document.documentElement;
    if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) id = secs[secs.length - 1].id;
    if (id === current) return;
    current = id;
    links.forEach(function (a) {
      if (a.hash === "#" + id) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", function () {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
/* a button back to the lesson header, shown once the header has scrolled away */
(function () {
  var head = document.querySelector(".lesson-head");
  if (!head) return;
  var h1 = head.querySelector("h1"), ru = document.documentElement.lang === "ru";
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "to-top";
  btn.title = ru ? "Наверх" : "Back to the top";
  btn.setAttribute("aria-label", ru ? "Вернуться к началу урока" : "Back to the top of the lesson");
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.appendChild(btn);
  btn.addEventListener("click", function () {
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
    // move focus too, so the next Tab starts from the top rather than from a hidden button
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
  });
  var shown = false, queued = false;
  function update() {
    queued = false;
    var past = head.getBoundingClientRect().bottom < 0;
    if (past !== shown) { shown = past; btn.classList.toggle("is-shown", past); }
  }
  window.addEventListener("scroll", function () {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
/* narrow screens: the pinned top bar tucks away while reading down and comes back on a scroll up */
(function () {
  var bar = document.querySelector(".topbar");
  if (!bar) return;
  var narrow = window.matchMedia("(max-width: 860px)");
  var lastY = window.scrollY, holdUntil = 0, queued = false;
  function tuck(on) { bar.classList.toggle("is-tucked", on); }
  function update() {
    queued = false;
    var y = window.scrollY, dy = y - lastY;
    if (!narrow.matches || y <= bar.offsetHeight || bar.querySelector("details[open]")) { tuck(false); lastY = y; return; }
    if (Date.now() < holdUntil) { tuck(true); lastY = y; return; }
    if (Math.abs(dy) < 8) return; // small moves add up until they count
    tuck(dy > 0);
    lastY = y;
  }
  // a jump to a section lands with the bar out of the way, even when the jump goes up
  function hold() { holdUntil = Date.now() + 500; }
  document.addEventListener("click", function (e) { if (e.target.closest('a[href^="#"]')) hold(); });
  window.addEventListener("hashchange", hold);
  if (location.hash) holdUntil = Date.now() + 1500;
  // the hold is for the jump only: a finger or wheel on the page ends it
  function release() { holdUntil = 0; }
  window.addEventListener("touchstart", release, { passive: true });
  window.addEventListener("wheel", release, { passive: true });
  window.addEventListener("scroll", function () {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("load", update);
  bar.addEventListener("focusin", function () { tuck(false); });
  update();
})();
/* phones: label table cells for the card layout, and give each diagram its own sideways scroller */
(function () {
  document.querySelectorAll(".table-wrap > table").forEach(function (t) {
    var heads = t.querySelectorAll("thead th");
    if (heads.length < 3) return;
    t.classList.add("stack");
    t.querySelectorAll("tbody tr").forEach(function (tr) {
      Array.prototype.forEach.call(tr.cells, function (td, i) {
        if (heads[i]) td.setAttribute("data-label", heads[i].textContent.trim());
      });
    });
  });
  document.querySelectorAll(".diagram > svg").forEach(function (svg) {
    var box = document.createElement("div");
    box.className = "diagram-scroll";
    svg.parentNode.insertBefore(box, svg);
    box.appendChild(svg);
    var w = parseFloat(svg.getAttribute("width"));
    if (w) box.style.setProperty("--w", w);
  });
})();
/* colour C code in <code class="language-c">; comments reuse the .c class */
(function () {
  var KEYWORDS = /^(?:asm|auto|break|case|const|continue|default|do|else|enum|extern|for|goto|if|inline|register|restrict|return|sizeof|static|struct|switch|typedef|union|volatile|while|__attribute__)$/;
  var TYPES = /^(?:void|char|short|int|long|float|double|signed|unsigned|_Bool|bool|\w+_t|__[lb]e\d+|__[us]\d+|u\d+)$/;
  // comment | #directive | string, char or <header.h> | number | identifier
  var TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(^[ \t]*#[ \t]*\w+)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)+'|<[\w.\/]+\.h>)|(\b(?:0x[\da-fA-F]+|\d+)[uUlL]*\b)|([A-Za-z_]\w*)/gm;
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  document.querySelectorAll("pre code.language-c").forEach(function (code) {
    var src = code.textContent, out = "", last = 0, tag = false, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      var w = m[0], cls = m[1] ? "c" : m[2] ? "k" : m[3] ? "s" : m[4] ? "n" : null;
      if (m[5]) {
        if (KEYWORDS.test(w)) cls = "k";
        else if (tag || TYPES.test(w)) cls = "t";          // the name after struct is a type
        else if (/^[A-Z][A-Z\d_]+$/.test(w)) cls = "n";    // O_CREAT, EINTR, DT_REG
        else {
          var j = TOKEN.lastIndex;
          while (src.charAt(j) === " " || src.charAt(j) === "\t") j++;
          if (src.charAt(j) === "(") cls = "f";
        }
        tag = /^(?:struct|union|enum)$/.test(w);
      }
      out += esc(src.slice(last, m.index)) + (cls ? '<span class="' + cls + '">' + esc(w) + "</span>" : esc(w));
      last = TOKEN.lastIndex;
    }
    code.innerHTML = out + esc(src.slice(last));
  });
})();
/* split code blocks into one span per line, so phones can wrap long lines with a
   hanging indent instead of scrolling sideways; on wider screens nothing changes.
   Runs after the C colouring, and keeps any colour span that crosses a line. */
(function () {
  function split(node) {
    if (node.nodeType === 3) return node.data.split("\n").map(function (s) { return s ? [document.createTextNode(s)] : []; });
    if (node.nodeType !== 1) return [[]];
    var parts = [[]];
    Array.prototype.forEach.call(node.childNodes, function (c) {
      var sub = split(c);
      parts[parts.length - 1] = parts[parts.length - 1].concat(sub[0]);
      for (var i = 1; i < sub.length; i++) parts.push(sub[i]);
    });
    return parts.map(function (nodes) {
      if (!nodes.length) return [];
      var shell = node.cloneNode(false);
      nodes.forEach(function (n) { shell.appendChild(n); });
      return [shell];
    });
  }
  document.querySelectorAll("pre:not([id])").forEach(function (pre) {
    if (pre.closest(".diagram")) return; // drawings must keep their columns
    var root = pre.querySelector(":scope > code") || pre, lines = [[]];
    Array.prototype.forEach.call(root.childNodes, function (c) {
      var sub = split(c);
      lines[lines.length - 1] = lines[lines.length - 1].concat(sub[0]);
      for (var i = 1; i < sub.length; i++) lines.push(sub[i]);
    });
    if (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
    var out = document.createDocumentFragment();
    lines.forEach(function (nodes, i) {
      var ln = document.createElement("span");
      ln.className = "ln";
      nodes.forEach(function (n) { ln.appendChild(n); });
      // the indent, in columns, that a wrapped line continues from (tabs are 4 wide)
      var text = ln.textContent, col = 0;
      for (var j = 0; j < text.length && (text[j] === " " || text[j] === "\t"); j++) col = text[j] === "\t" ? (Math.floor(col / 4) + 1) * 4 : col + 1;
      if (col) ln.style.setProperty("--i", col);
      if (i < lines.length - 1) ln.appendChild(document.createTextNode("\n"));
      out.appendChild(ln);
    });
    root.textContent = "";
    root.appendChild(out);
    pre.classList.add("lines");
  });
})();
