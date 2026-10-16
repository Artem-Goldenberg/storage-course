# From open() to RDMA

A storage course in nine lessons: syscalls, block devices, ext4 on disk, B-trees,
the VFS and page cache, NFS, network caching, RDMA and distributed filesystems.

The site is plain static HTML in `site/`, deployed to Render as a static site
(`render.yaml`). The Russian translation is in `site/ru/`; it shares
`course.css`, `course.js` and `search.js` with the English pages.

Each lesson cites its sources with numbered footnotes, in both languages. The
citations live in `sources/<lesson>.json` (the place in the text, the source,
the section that backs the statement, and a verbatim quote from it), and
`python3 tools/cite.py <lesson>` writes the marks and the "Sources" list into
`site/<lesson>.html` and `site/ru/<lesson>.html`. Edit the JSON, not the
generated HTML; the script's docstring describes the format.
