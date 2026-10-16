#!/usr/bin/env python3
"""Put source footnotes into a lesson, in English and Russian, from sources/<lesson>.json.

    python3 tools/cite.py 01-syscalls            # write site/01-syscalls.html and site/ru/01-syscalls.html
    python3 tools/cite.py --check 01-syscalls    # report problems, write nothing
    python3 tools/cite.py                        # every lesson that has a JSON file

The JSON file:

    {
      "page": "01-syscalls.html",
      "sources": {
        "open2-append": {
          "url": "https://man7.org/linux/man-pages/man2/open.2.html#DESCRIPTION",
          "title": "open(2), Linux manual page",
          "where": {"en": "DESCRIPTION, O_APPEND", "ru": "раздел DESCRIPTION, O_APPEND"}
        }
      },
      "cites": [
        {"src": "open2-append",                  # or a list of ids
         "en": "exact raw-HTML text in the English page; the mark goes right after it",
         "ru": "the same place in the Russian page",
         "quote": "verbatim words from the source that back the statement"}
      ]
    }

Each snippet must occur exactly once in the lesson body (from <main> to the reading
list) and must end where a footnote can stand: in running text, not inside <pre>,
<code>, a link, a heading, a <summary> or a drawing. Sources are numbered by where
they are first cited on each page. Running the script again replaces what an earlier
run inserted, so the JSON file is the only thing to edit.
"""
import html, json, re, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN = {"pre", "code", "a", "summary", "h1", "h2", "h3", "h4", "h5", "h6", "svg", "nav", "title", "script", "style", "sup", "b", "strong", "em", "i", "kbd", "var"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

TEXT = {
    "en": dict(h2="Sources", toc="Sources",
               note="The numbers in the text point here. Each entry names the part of the source that backs the "
                    "statement; ↩ goes back to the place in the text.",
               back="Back to the text"),
    "ru": dict(h2="Источники", toc="Источники",
               note="Номера в тексте ведут сюда. В каждой записи указано, какая часть источника подтверждает "
                    "утверждение; ↩ возвращает к месту в тексте. Источники на английском, если не сказано иное.",
               back="Вернуться к тексту"),
}

OLD_SUP = re.compile(r'<sup class="cite">.*?</sup>', re.S)
OLD_SECTION = re.compile(r'\n<section class="sources" id="sources">.*?</section>', re.S)
OLD_TOC = re.compile(r'\n<li><a href="#sources">[^<]*</a></li>')


class Stack(HTMLParser):
    """Records, for every offset where a tag starts or ends, the open elements."""
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text, self.stack, self.events = text, [], []
        self.lines = [0]
        for m in re.finditer("\n", text):
            self.lines.append(m.end())
    def off(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col
    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append(tag)
        self.events.append((self.off() + len(self.get_starttag_text() or ""), list(self.stack)))
    def handle_startendtag(self, tag, attrs):
        pass
    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack and self.stack.pop() != tag:
                pass
        self.events.append((self.off(), list(self.stack)))

    def open_at(self, pos):
        cur = []
        for at, st in self.events:
            if at > pos:
                break
            cur = st
        return cur


def body_range(page):
    start = page.index('<main class="lesson">')
    end = page.find('<section class="further"', start)
    if end < 0:
        end = page.index("</main>", start)
    return start, end


def place(page, cites, lang, problems):
    """Return {offset: [source ids]} for one page."""
    start, end = body_range(page)
    body = page[start:end]
    tags = Stack(body)
    tags.feed(body)
    marks = {}
    for i, c in enumerate(cites):
        snip = c[lang]
        n = body.count(snip)
        label = f"cite {i + 1} ({lang}) “{snip[:60]}”"
        if n != 1:
            problems.append(f"{label}: found {n} times, need exactly 1")
            continue
        pos = body.index(snip) + len(snip)
        # never inside a tag
        lt, gt = body.rfind("<", 0, pos), body.rfind(">", 0, pos)
        if lt > gt:
            problems.append(f"{label}: ends inside a tag")
            continue
        bad = [t for t in tags.open_at(pos) if t in FORBIDDEN]
        if bad:
            problems.append(f"{label}: ends inside <{bad[-1]}>")
            continue
        ids = c["src"] if isinstance(c["src"], list) else [c["src"]]
        marks.setdefault(start + pos, [])
        for s in ids:
            if s not in marks[start + pos]:
                marks[start + pos].append(s)
    return marks


def render(page, marks, sources, lang):
    t = TEXT[lang]
    order = []
    for pos in sorted(marks):
        for s in marks[pos]:
            if s not in order:
                order.append(s)
    num = {s: i + 1 for i, s in enumerate(order)}
    uses = {s: 0 for s in order}
    backs = {s: [] for s in order}
    out, last = [], 0
    for pos in sorted(marks):
        links = []
        for s in sorted(marks[pos], key=lambda s: num[s]):
            uses[s] += 1
            n = num[s]
            cid = f"cite-{n}" if uses[s] == 1 else f"cite-{n}-{uses[s]}"
            backs[s].append(cid)
            src = sources[s]
            tip = html.escape(f'{src["title"]} — {src["where"][lang]}', quote=True)
            links.append(f'<a href="#src-{n}" id="{cid}" title="{tip}">{n}</a>')
        out.append(page[last:pos])
        out.append('<sup class="cite">' + "".join(links) + "</sup>")
        last = pos
    out.append(page[last:])
    page = "".join(out)

    items = []
    for s in order:
        src, n = sources[s], num[s]
        back = " ".join(
            f'<a href="#{cid}" aria-label="{t["back"]}">↩{"" if k == 0 else k + 1}</a>'
            for k, cid in enumerate(backs[s]))
        items.append(f'<li id="src-{n}"><a href="{html.escape(src["url"], quote=True)}">{html.escape(src["title"])}</a>'
                     f'<span class="where">{html.escape(src["where"][lang])}</span> <span class="back">{back}</span></li>')
    section = (f'\n<section class="sources" id="sources">\n<h2>{t["h2"]}</h2>\n'
               f'<p class="muted small">{t["note"]}</p>\n<ol>\n' + "\n".join(items) + "\n</ol>\n</section>")
    anchor = page.index('<nav class="pager-foot"')
    page = page[:anchor].rstrip("\n") + section + "\n" + page[anchor:]
    toc = re.search(r'<li><a href="#further">[^<]*</a></li>', page)
    if toc:
        page = page[:toc.end()] + f'\n<li><a href="#sources">{t["toc"]}</a></li>' + page[toc.end():]
    return page, len(order)


def strip(page):
    page = OLD_SUP.sub("", page)
    page = OLD_SECTION.sub("", page)
    return OLD_TOC.sub("", page)


def run(stem, check):
    data = json.loads((ROOT / "sources" / f"{stem}.json").read_text(encoding="utf-8"))
    sources, cites = data["sources"], data["cites"]
    problems = []
    for i, c in enumerate(cites):
        for s in (c["src"] if isinstance(c["src"], list) else [c["src"]]):
            if s not in sources:
                problems.append(f"cite {i + 1}: unknown source {s!r}")
        if not c.get("quote"):
            problems.append(f"cite {i + 1}: no quote")
    for k, s in sources.items():
        for f in ("url", "title", "where"):
            if not s.get(f):
                problems.append(f"source {k}: missing {f}")
        if not all(s.get("where", {}).get(l) for l in ("en", "ru")):
            problems.append(f"source {k}: 'where' needs en and ru")
    used = {s for c in cites for s in (c["src"] if isinstance(c["src"], list) else [c["src"]])}
    for k in sources:
        if k not in used:
            problems.append(f"source {k}: never cited")
    results = {}
    for lang, path in (("en", ROOT / "site" / data["page"]), ("ru", ROOT / "site" / "ru" / data["page"])):
        page = strip(path.read_text(encoding="utf-8"))
        marks = place(page, cites, lang, problems)
        results[lang] = (path, page, marks)
    if problems:
        print(f"{stem}: {len(problems)} problem(s)")
        for p in problems:
            print("  " + p)
        return False
    for lang, (path, page, marks) in results.items():
        new, n = render(page, marks, sources, lang)
        if not check:
            path.write_text(new, encoding="utf-8")
        refs = sum(len(v) for v in marks.values())
        print(f"{stem} {lang}: {n} sources, {len(marks)} places in the text, {refs} references" + (" (checked)" if check else ""))
    return True


if __name__ == "__main__":
    args = sys.argv[1:]
    check = "--check" in args
    stems = [a for a in args if a != "--check"] or sorted(p.stem for p in (ROOT / "sources").glob("*.json"))
    ok = all([run(s, check) for s in stems])
    sys.exit(0 if ok else 1)
