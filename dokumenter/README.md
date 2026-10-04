# Documents: how to add files

The document pages on kollegienet.dk are built automatically from these folders
when changes are pushed to `main`. GitHub Pages' build lists the files, so
**adding a correctly named file is all it takes**. The Danish and English
pages both update; no HTML needs editing.

## Board meeting minutes — `bestyrelsesmoeder/`

Name: `YYYY-MM-DD.pdf`, the date of the meeting. Optionally add a space and a
description after the date.

| File | Shown as (da / en) |
|---|---|
| `2026-11-03.pdf` | 3. november 2026 / 3 November 2026 |
| `2026-04-27 Konstituerende.pdf` | 27. april 2026 — Konstituerende |

Grouped by year, newest first. Use the signed version if there is one.

## Board meeting agendas — `dagsorden/`

Same naming as the minutes: `YYYY-MM-DD.pdf` (`.docx` also works).

## General meetings (repræsentantskabsmøde) — `repraesentantskabsmode/`

One folder per meeting year, e.g. `repraesentantskabsmode/2026/`. For an
extraordinary meeting, use `YYYY-ekstraordinaer`, which is shown as
"Ekstraordinær YYYY".

Files: `NN Title.pdf`. The two-digit number sets the order and isn't shown;
the rest of the name is the label, exactly as written. Spaces and æ/ø/å are fine.

| File | Shown as |
|---|---|
| `01 1. Indkaldelse til repræsentantskabsmøde i FKO.pdf` | 1. Indkaldelse til repræsentantskabsmøde i FKO |
| `02 Årsregnskab 2025-26.pdf` | Årsregnskab 2025-26 |
| `03 Revisionsprotokollat 2025-26.pdf` | Revisionsprotokollat 2025-26 |
| `04 Budgetforslag.pdf` | Budgetforslag |

New years appear automatically on the general meeting page and in the year
links on the Documents page.

## Other files in this folder

Files directly in `dokumenter/` (statutes, router guides, leaflet) are linked
by hand from their pages.

## How it works

`_includes/archive-dated.html` and `_includes/archive-meetings.html` (Jekyll)
read the folders; month names and other texts are in `_data/archive.yml`. The
archive pages (`bestyrelsesmoeder.html`, `dagsorden.html`,
`repraesentantskabsmode.html`, `dokumenter.html` and their `en/` versions)
start with an empty `---` block so Jekyll processes them.

Preview locally with the same Jekyll version as GitHub Pages:

```sh
docker run --rm -it -v "$PWD":/src -p 4000:4000 ruby:3.3 bash -c \
  'gem install --no-document jekyll:3.10.0 kramdown-parser-gfm csv base64 bigdecimal logger &&
   cd /src && jekyll serve --safe --host 0.0.0.0'
```

Then open http://localhost:4000/bestyrelsesmoeder.html
