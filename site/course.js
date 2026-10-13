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
