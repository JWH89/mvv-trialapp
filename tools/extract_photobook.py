#!/usr/bin/env python3
"""Extract the KNS photo book (Naar Nederland "Fotoboek") into app assets.

Reads the official photo book PDF and writes:
  assets/images/vb01.jpg, vb02.jpg      the two example questions (voorbeeldvragen)
  assets/images/q001.jpg … q100.jpg     one photo per exam question
  assets/data/questions.json            one record per question, linked to its photo

The photos are copied byte for byte from the PDF (original JPEG, no re-encoding).
The questions and answers come from the table "100 examenvragen bij het fotoboek en
de film Naar Nederland" at the back of the book.

The script checks its own output and stops with an error if anything is missing or
does not match (photo page numbers, question numbers, answer letters, file count).

Usage (from the mvv-app folder):
    pip install pypdf pdfplumber
    python tools/extract_photobook.py path/to/nn-fotoboek-2014-herzien-omslag-lowres.pdf

Options:
    --out DIR   app folder to write into (default: the folder above this script)
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    import pdfplumber
    from pypdf import PdfReader
except ImportError:
    sys.exit("Missing packages. Run:  pip install pypdf pdfplumber")

EXAMPLES = ["vb01", "vb02"]
N_QUESTIONS = 100

# Words that the PDF breaks over two lines at a hyphen that belongs to the word.
# Other line-end hyphens are removed when the words are joined ("gebombar-" + "deerd").
KEEP_HYPHEN = {"ministerpresident": "minister-president"}

# Column boundaries in the table, measured along the reading direction (points).
# Number | Question text | Option A | Option B | Correct letter
COLS = [("num", 0, 80), ("q", 80, 278), ("a", 278, 344), ("b", 344, 410), ("ans", 410, 1000)]


def fail(msg):
    sys.exit("ERROR: " + msg)


# ---------------------------------------------------------------- photos
def page_label(text):
    """The question number printed on a photo page ('1'…'100', or 'VOORBEELDVRAAG')."""
    words = text.split()
    if "VOORBEELDVRAAG" in words:
        return "example"
    nums = [w for w in words if re.fullmatch(r"\d{1,3}", w)]
    return int(nums[-1]) if nums else None


def extract_photos(reader, img_dir):
    """Find every page with exactly one photo and a question label; save the photo."""
    found = {}          # id -> (page number, bytes)
    example_i = 0
    for pno, page in enumerate(reader.pages, start=1):
        imgs = list(page.images)
        if len(imgs) != 1:
            continue    # cover (7 thumbnails), blank pages, answer table
        label = page_label(page.extract_text() or "")
        if label is None:
            continue
        if label == "example":
            if example_i >= len(EXAMPLES):
                fail(f"more example pages than expected (page {pno})")
            qid = EXAMPLES[example_i]
            example_i += 1
        else:
            qid = f"q{label:03d}"
        if qid in found:
            fail(f"{qid} appears twice (pages {found[qid][0]} and {pno})")
        img = imgs[0]
        data = img.data
        if not data.startswith(b"\xff\xd8"):
            fail(f"photo on page {pno} is not a JPEG ({img.name}); script needs updating")
        found[qid] = (pno, data)

    expected = EXAMPLES + [f"q{i:03d}" for i in range(1, N_QUESTIONS + 1)]
    missing = [q for q in expected if q not in found]
    if missing:
        fail("no photo found for: " + ", ".join(missing))

    img_dir.mkdir(parents=True, exist_ok=True)
    for old in img_dir.glob("*.jpg"):
        old.unlink()
    info = {}
    for qid in expected:
        pno, data = found[qid]
        (img_dir / f"{qid}.jpg").write_bytes(data)
        info[qid] = {"page": pno, "bytes": len(data), "sha1": hashlib.sha1(data).hexdigest()}
    return info


# ---------------------------------------------------------------- question table
def table_lines(pdf):
    """Yield lines of the answer table as lists of (column, word), in reading order."""
    for page in pdf.pages:
        text = page.extract_text() or ""
        if "Vraagtekst" not in text:
            continue
        words = page.extract_words(keep_blank_chars=False)
        # The table pages are rotated 90°: pdfplumber's x runs down the page (decreasing
        # x = further down) and 'top' runs across it. Normalise to (down, across).
        rot = page.rotation % 360
        pts = []
        for w in words:
            if rot == 90:
                down, across = page.width - w["x1"], w["top"]
            elif rot == 270:
                down, across = w["x0"], page.height - w["bottom"]
            else:
                down, across = w["top"], w["x0"]
            pts.append((down, across, w["text"]))
        pts.sort()
        lines, cur, last = [], [], None
        for down, across, t in pts:
            if last is not None and down - last > 3:
                lines.append(cur)
                cur = []
            cur.append((across, t))
            last = down
        if cur:
            lines.append(cur)
        for line in lines:
            line.sort()
            yield [(col_of(a), t) for a, t in line]


def col_of(across):
    for name, lo, hi in COLS:
        if lo <= across < hi:
            return name
    return "ans"


def join_parts(parts, merges):
    """Join wrapped lines of one cell, undoing line-end hyphenation."""
    out = ""
    for part in parts:
        if not out:
            out = part
        elif out.endswith("-") and part[:1].islower():
            head, tail = out[:-1].rsplit(" ", 1) if " " in out[:-1] else ("", out[:-1])
            word = tail + part.split(" ", 1)[0]
            core = word.rstrip("?.,")
            if core.lower() in KEEP_HYPHEN:
                word = KEEP_HYPHEN[core.lower()] + word[len(core):]
            merges.add(f"{tail}|{part.split(' ', 1)[0]} -> {word}")
            rest = part.split(" ", 1)[1] if " " in part else ""
            out = (head + " " if head else "") + word + (" " + rest if rest else "")
        elif out.endswith("-"):
            out = out + part          # e.g. "Willem-" + "Alexander"
        else:
            out = out + " " + part
    return out.strip()


def parse_questions(pdf):
    rows, cur = [], None
    for line in table_lines(pdf):
        cells = {}
        for col, t in line:
            cells.setdefault(col, []).append(t)
        text = " ".join(t for _, t in line)
        if text.startswith(("Nummer", "100 EXAMENVRAGEN")) or text in ("antwoord", "Correcte antwoord"):
            continue
        num = " ".join(cells.get("num", []))
        if re.fullmatch(r"vb\d\d|\d{1,3}", num):
            cur = {"num": num, "q": [], "a": [], "b": [], "ans": []}
            rows.append(cur)
        elif cur is None:
            continue
        elif num:
            fail(f"unexpected text in number column: {num!r}")
        for k in ("q", "a", "b", "ans"):
            if cells.get(k):
                cur[k].append(" ".join(cells[k]))

    merges = set()
    out = []
    for r in rows:
        ans = " ".join(r["ans"]).strip()
        if ans not in ("A", "B"):
            fail(f"question {r['num']}: correct answer is {ans!r}, expected A or B")
        out.append({
            "num": r["num"],
            "question": join_parts(r["q"], merges),
            "A": join_parts(r["a"], merges),
            "B": join_parts(r["b"], merges),
            "correct": ans,
        })
    return out, sorted(merges)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent)
    args = ap.parse_args()
    if not args.pdf.exists():
        fail(f"PDF not found: {args.pdf}")

    img_dir = args.out / "assets" / "images"
    data_dir = args.out / "assets" / "data"

    reader = PdfReader(str(args.pdf))
    photos = extract_photos(reader, img_dir)
    with pdfplumber.open(str(args.pdf)) as pdf:
        rows, merges = parse_questions(pdf)

    expected = EXAMPLES + [str(i) for i in range(1, N_QUESTIONS + 1)]
    got = [r["num"] for r in rows]
    if got != expected:
        missing = [n for n in expected if n not in got]
        extra = [n for n in got if n not in expected]
        fail(f"question table mismatch. missing: {missing} extra: {extra}")

    questions = []
    for r in rows:
        example = r["num"].startswith("vb")
        qid = r["num"] if example else f"q{int(r['num']):03d}"
        for k in ("question", "A", "B"):
            if not r[k]:
                fail(f"question {r['num']}: empty {k}")
        questions.append({
            "id": qid,
            "number": r["num"] if example else int(r["num"]),
            "example": example,
            "question": r["question"],
            "options": {"A": r["A"], "B": r["B"]},
            "correct": r["correct"],
            "answer": r[r["correct"]],
            "image": f"assets/images/{qid}.jpg",
            "page": photos[qid]["page"],
        })

    for q in questions:
        if not (args.out / q["image"]).exists():
            fail(f"{q['id']}: image file missing")

    data_dir.mkdir(parents=True, exist_ok=True)
    doc = {
        "source": args.pdf.name,
        "sourceSha1": hashlib.sha1(args.pdf.read_bytes()).hexdigest(),
        "generated": date.today().isoformat(),
        "count": len(questions),
        "questions": questions,
    }
    (data_dir / "questions.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    n_a = sum(q["correct"] == "A" for q in questions)
    print(f"OK  {len(questions)} questions ({N_QUESTIONS} exam + {len(EXAMPLES)} examples), "
          f"{len(photos)} photos, answers A={n_a} B={len(questions) - n_a}")
    print(f"    images -> {img_dir}")
    print(f"    data   -> {data_dir / 'questions.json'}")
    if merges:
        print("    words joined across a line break (check these once):")
        for m in merges:
            print("      " + m)


if __name__ == "__main__":
    main()
