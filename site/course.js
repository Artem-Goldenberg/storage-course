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
