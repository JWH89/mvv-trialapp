#!/usr/bin/env python3
"""Extract the exercises of the Naar Nederland workbook ("Werkboek") into app data.

Reads the official workbook PDF and writes assets/data/workbook.json with:
  - lessons 21–65: the lesson text (dialogue) and every exercise item with its answer
  - the four tussentoetsen (progress tests), parts A–D

Each exercise item becomes one record, for example:
  {"id": "w26-3-2", "lesson": 26, "exercise": "3", "kind": "match",
   "instruction": "Trek een lijn naar het goede antwoord.",
   "prompt": "Daar zijn twee … vrij.", "choices": ["tafel", "stoelen", "zoveel", "kop"],
   "answer": "stoelen"}

kind is one of:
  choice  pick one of the choices printed next to the item (omcirkel, waar/niet waar)
  match   pick from the words in the right-hand column (trek een lijn)
  fill    pick from the word bank above the exercise (vul in, tegenstelling)
  recall  the book gives no choices: answer, then check (starred extra parts,
          "Geef antwoord")

Answers come from the answer key ("Antwoorden") at the back of the book. Exercises with
no answers in the key (personal questions such as "Hoe laat neem jij ontbijt?") are left out.

The script checks itself and stops with an error when the number of items in an exercise
does not match the number of answers in the key, or when an answer is not one of the
item's choices. Places where the book and its answer key disagree are listed, with the
reason, in KNOWN_DIFFERENCES below.

Usage (from the mvv-app folder):
    pip install pdfplumber
    python tools/extract_workbook.py path/to/nn-werkboek-2015-herzien-omslag-lowres.pdf
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("Missing package. Run:  pip install pdfplumber")

FIRST_LESSON, LAST_LESSON = 21, 65
BLUE, ORANGE, BLACK, WHITE = (0.0, 0.57, 0.84), (0.93, 0.45, 0.01), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)
FOOTER_TOP = 640          # everything below this is the page footer
BLANK = re.compile(r"\.{3,}|…")

# Book and answer key disagree. Key: item id -> (what the key says, answer we use, why).
# Checked by hand against the book. The run stops on any other mismatch, so a new edition
# gets checked again.
KNOWN_DIFFERENCES = {
    "w32-4-2": ("nogal", "vol", "the word list in the book has “vol” (een vol programma)."),
    "w41-3-7": ("gewone", "normale", "the book has “normale” in the right-hand column. Both fit."),
    "w60-7-1": ("midden", "centrum", "the word list in the book has “centrum”. Both fit."),
}


def fail(msg):
    sys.exit("ERROR: " + msg)


# ---------------------------------------------------------------- low-level helpers
def colour(w):
    c = w.get("non_stroking_color")
    if isinstance(c, (list, tuple)):
        if len(c) == 3:
            return tuple(round(x, 2) for x in c)
        if len(c) == 1:
            return (round(c[0], 2),) * 3
        if len(c) == 4:  # CMYK -> rough RGB
            cy, m, y, k = c
            return tuple(round((1 - v) * (1 - k), 2) for v in (cy, m, y))
    return BLACK


def lines_of(page, tol=2.5):
    """Words grouped into visual lines (top to bottom, left to right)."""
    words = page.extract_words(extra_attrs=["non_stroking_color", "size", "fontname"])
    words = [w for w in words if w["top"] < FOOTER_TOP]
    words.sort(key=lambda w: (w["top"], w["x0"]))
    out = []
    for w in words:
        w["c"] = colour(w)
        if out and abs(w["top"] - out[-1]["top"]) <= tol:
            out[-1]["w"].append(w)
        else:
            out.append({"top": w["top"], "w": [w]})
    for line in out:
        line["w"].sort(key=lambda w: w["x0"])
    return out


def text(words):
    s = " ".join(w["text"] for w in words)
    s = re.sub(r"\s+([.,;:?!)])", r"\1", s)
    s = re.sub(r"\(\s+", "(", s)
    return s.strip()


def norm(s):
    s = unicodedata.normalize("NFD", s.replace("’", "'").replace("‘", "'"))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")   # helemáál -> helemaal
    return re.sub(r"\s+", " ", s).strip().lower().rstrip(".")


def split_choices(s):
    return [c.strip() for c in re.split(r"\s+[–-]\s+|\s+[–-]$|^[–-]\s+", s) if c.strip()]


def join_choice_text(a, b):
    """Choices that continue on the next line.

    'door de wind –' + 'door het slechte weer'      -> a new choice (dash at the end)
    'Omdat ze naar Nederland gaat.' + 'Omdat ...'   -> a new choice (capital / full stop)
    'oude auto’s gaan' + 'vaak kapot'               -> the same choice, wrapped
    """
    a, b = a.rstrip(), b.strip()
    if a.endswith(("–", "-")):
        return f"{a} {b}"
    if a.endswith((".", "?", "!")) or b[:1].isupper() or b[:1].isdigit():
        return f"{a} – {b}"
    return f"{a} {b}"


def starts_lower(s):
    return s[:1].islower()


def tidy_prompt(s):
    s = BLANK.sub("…", s)
    s = re.sub(r"…[.…]*", "…", s)
    return s.replace(" ,", ",").strip()


# ---------------------------------------------------------------- page map
def page_kinds(pdf):
    """Find where each lesson / test starts, and where the answer key starts and ends."""
    starts, key_start, key_end = [], None, None
    for i, page in enumerate(pdf.pages):
        top = [w for w in page.extract_words(extra_attrs=["non_stroking_color", "size"]) if w["top"] < 80]
        big = [w for w in top if w["size"] >= 14 and colour(w) == WHITE]     # white text in the title bar
        t = " ".join(w["text"] for w in big)
        m = re.match(r"(LES|TUSSENTOETS) (\d+)", t)
        if m:
            starts.append((i, m.group(1), int(m.group(2)), t))
        elif t.strip():
            starts.append((i, "OTHER", i, t))      # e.g. TEGENSTELLINGEN: ends the section before it
        head = " ".join(w["text"] for w in top)
        if key_start is None and head.startswith("ANTWOORDEN"):
            key_start = i
        if key_start is not None and key_end is None and i > key_start and head.startswith("INDEX"):
            key_end = i
    if key_start is None:
        fail("answer key (ANTWOORDEN) not found")
    key_end = key_end or len(pdf.pages)
    ranges, seen = {}, set()
    for n, (i, kind, num, title) in enumerate(starts):
        name = f"{kind} {num}"
        if name in seen:
            continue
        seen.add(name)
        nxt = next((s[0] for s in starts[n + 1:] if f"{s[1]} {s[2]}" != name), key_start)
        ranges[name] = {"pages": list(range(i, min(nxt, key_start))), "title": title}
    return ranges, key_start, key_end


# ---------------------------------------------------------------- answer key
def parse_key(pdf, start, end):
    """{section: [{"n": "3", "part": None|"A", "answers": [...]}, ...]}"""
    sections, cur = {}, None
    for i in range(start, end):
        page = pdf.pages[i]
        mid = page.width / 2
        lines = lines_of(page)
        for side in (0, 1):
            col = []
            for line in lines:
                ws = [w for w in line["w"] if (w["x0"] < mid - 10) == (side == 0) and w["c"] != WHITE]
                if ws:
                    col.append(ws)
            # answers start at the most common left edge of non-numbered lines
            xs = [round(ws[0]["x0"]) for ws in col if not re.fullmatch(r"\d+\.?|[A-H]", ws[0]["text"])]
            ans_x = max(set(xs), key=xs.count) if xs else 0
            for ws in col:
                t = text(ws)
                if ws[0]["c"] == BLUE:
                    m = re.match(r"(LES|TUSSENTOETS) (\d+)", t)
                    if m:
                        cur = []
                        sections[f"{m.group(1)} {m.group(2)}"] = cur
                    continue
                if cur is None or t == "ANTWOORDEN":
                    continue
                first = ws[0]["text"]
                if re.fullmatch(r"[A-H]", first) and len(ws) == 1:
                    cur.append({"part": first, "n": None, "answers": []})
                    continue
                if re.fullmatch(r"\d+\.?", first) and ws[0]["x0"] < ans_x - 5:
                    part = cur[-1]["part"] if cur else None
                    entry = {"part": part, "n": first.rstrip("."), "answers": []}
                    if cur and cur[-1]["n"] is None and cur[-1]["part"] == part:
                        cur[-1] = entry          # replace the bare part marker
                    else:
                        cur.append(entry)
                    ws = ws[1:]
                    if not ws:
                        continue
                    cur[-1]["answers"].append(text(ws))
                    continue
                if cur:
                    cur[-1]["answers"].append(text(ws))
    return sections


# ---------------------------------------------------------------- exercise pages
def is_header(line):
    w = line["w"]
    return (w[0]["size"] >= 11.5 and w[0]["c"] == ORANGE and re.fullmatch(r"\d+|[A-H]", w[0]["text"])
            and any(x["c"] == BLUE for x in w[1:]))


def ex_type(instruction):
    i = instruction
    if i.startswith(("Omcirkel", "Lees de zin hardop en omcirkel")):
        return "choice"
    if i.startswith("Trek een lijn"):
        return "match"
    if i.startswith("Lees de zin hardop en vul"):
        return "fill"
    if i.startswith("Geef een tegenstelling"):
        return "opposite"
    return "open"


def parse_section(pdf, pages, is_test):
    """Return (lesson text lines, exercises). Each exercise keeps its raw lines."""
    text_lines, exercises, ex, in_extra = [], [], None, False
    for i in pages:
        for line in lines_of(pdf.pages[i]):
            ws = [w for w in line["w"] if w["c"] != WHITE]
            if not ws or (ws[0]["size"] >= 14 and line["top"] < 80):   # track markers, title bar
                continue
            line = dict(line, w=ws)
            if is_header(line):
                in_extra = False
                ex = {"n": ws[0]["text"], "instruction": text([w for w in ws[1:] if w["c"] == BLUE]),
                      "lines": [], "page": i + 1}
                exercises.append(ex)
                continue
            t = text(ws)
            if t == "OEFENINGEN":
                continue
            if ws[0]["c"] == ORANGE and t == "EXTRA":
                in_extra, ex = True, None
                continue
            if in_extra:
                continue
            if ex is None:
                black = [w for w in ws if w["c"] == BLACK]
                if black and not any(w["c"] == BLUE for w in ws):
                    text_lines.append((i, line["top"], text(black)))
                continue
            ex["lines"].append({"page": i, "top": line["top"], "w": ws})
    return text_lines, exercises


def is_handwriting(w):
    return "chulschrift" in w.get("fontname", "")


def ends_sentence(s):
    return s.rstrip().endswith((".", "?", "!", ":", "…"))


def build_rows(ex, is_test):
    """Turn an exercise's raw lines into items: prompt, inline choices, word bank."""
    typ = ex_type(ex["instruction"])
    bank, rows, lead, hand = [], [], None, None
    for ln in ex["lines"]:
        ws = ln["w"]
        if ws and all(is_handwriting(w) for w in ws):
            hand = ws[0]["x0"]           # worked example: the answer is handwritten above the blank
            continue
        if hand is not None:
            ws = sorted(ws + [{"text": ".....", "x0": hand - 1, "x1": hand, "c": BLACK}], key=lambda w: w["x0"])
            hand = None
        black = [w for w in ws if w["c"] == BLACK]
        if not black:
            orange = text([w for w in ws if w["c"] == ORANGE])
            if not orange:
                continue
            if not rows and lead is None:
                bank += split_choices(orange)                      # word bank above the items
            elif rows and typ == "choice":
                r = rows[-1]
                r["right"] = join_choice_text(r["right"], orange) if r["right"] else orange
            elif typ == "match":
                (rows[-1] if rows else lead)["rights"].append(orange)
            continue
        last_black = max(w["x1"] for w in black)
        num = None
        if is_test and re.fullmatch(r"\d+", black[0]["text"]) and black[0]["x0"] < 62:
            num = black[0]["text"]
            ws = [w for w in ws if w is not black[0]]
            black = black[1:]
        if typ == "opposite":
            # the word to turn around is printed in orange inside the sentence
            prompt_ws = [w for w in ws if w["c"] == BLACK or w["x0"] < last_black]
            prompt = " ".join(f"[{w['text']}]" if w["c"] == ORANGE else w["text"] for w in prompt_ws)
            prompt = text([{"text": prompt}])
            right = ""
        else:
            prompt = text(black)
            right = text([w for w in ws if w["c"] == ORANGE and w["x0"] > last_black])
        if is_test and num is None and rows:
            rows[-1]["prompt"] += " " + prompt                     # wrapped question
            if right and typ == "match":
                rows[-1]["rights"].append(right)
            elif right:
                rows[-1]["right"] = join_choice_text(rows[-1]["right"], right) if rows[-1]["right"] else right
            continue
        row = {"page": ln["page"], "top": ln["top"], "last": ln["top"], "num": num, "prompt": prompt,
               "right": right if typ != "match" else "", "rights": [right] if (typ == "match" and right) else []}
        if lead:
            row["prompt"] = lead["prompt"] + " " + prompt
            row["top"] = lead["top"]
            row["rights"] = lead["rights"] + row["rights"]
            lead = None
        if not is_test:
            # matching: the right-hand words are not tied to a line, an item only needs its blank
            incomplete = (typ == "choice" and not right) or (typ in ("fill", "match") and not BLANK.search(prompt)) or \
                         (typ == "open" and not ends_sentence(prompt) and not BLANK.search(prompt))
            if typ == "opposite" and not BLANK.search(prompt):
                if rows and not ends_sentence(rows[-1]["prompt"]):
                    rows[-1]["prompt"] += " " + prompt
                continue                                           # otherwise: the worked example
            prev = rows[-1] if rows else None
            if typ in ("choice", "open") and prev and prev["page"] == ln["page"] and starts_lower(prompt) and \
                    not ends_sentence(prev["prompt"]) and ln["top"] - prev["last"] < 20:
                incomplete = True             # questions end with ? or . — this line finishes the last one
            if incomplete:
                if prev and prev["page"] == ln["page"] and not ends_sentence(prev["prompt"]) \
                        and ln["top"] - prev["last"] < 20:
                    prev["prompt"] += " " + prompt                 # tail of the previous item
                    prev["last"] = ln["top"]
                    prev["rights"] += row["rights"]
                    if right and typ != "match":
                        prev["right"] = join_choice_text(prev["right"], right) if prev["right"] else right
                else:
                    lead = row                                     # first half of the next item
                continue
        rows.append(row)
    if lead:
        rows.append(lead)
    return typ, bank, rows


def lesson_text(lines):
    """Join text lines into paragraphs (a bigger vertical gap starts a new paragraph)."""
    paras, prev = [], None
    for page, top, t in lines:
        if prev and prev[0] == page and top - prev[1] < 22 and paras:
            if paras[-1].endswith("-") and t[:1].islower():
                paras[-1] = paras[-1][:-1] + t          # vier- / kante -> vierkante
            else:
                paras[-1] += "\n" + t
        else:
            paras.append(t)
        prev = (page, top)
    return [p for p in paras if not re.fullmatch(r"[\d\s]+", p)]


# ---------------------------------------------------------------- pairing with the key
def match_groups(rows):
    """For 'trek een lijn': the right-hand words of each block of rows (blocks split by a gap)."""
    groups, cur, prev = [], [], None
    for idx, r in enumerate(rows):
        if prev is not None and (r["page"] != prev["page"] or r["top"] - prev["last"] > 26):
            groups.append(cur)
            cur = []
        cur.append(idx)
        prev = r
    groups.append(cur)
    lookup = {}
    for g in groups:
        words = [w for i in g for w in rows[i]["rights"]]
        for i in g:
            lookup[i] = words
    return lookup


SKIPPED = []


def check_pools(name, ex, typ, bank, rows, answers, groups, problems):
    """Word bank / matching words: every word is used exactly once (so no answer sits on the wrong item)."""
    if typ == "fill" and bank and len(bank) == len(answers):
        if sorted(norm(a) for a in answers) != sorted(norm(b) for b in bank):
            problems.append(f"{name} ex {ex['n']}: answers {answers} do not use the word bank {bank} once each")
    if typ == "match" and groups:
        seen = set()
        for k, words in groups.items():
            key = tuple(words)
            if key in seen:
                continue
            seen.add(key)
            idx = [i for i, w in groups.items() if tuple(w) == key]
            got = sorted(norm(answers[i]) for i in idx)
            if got != sorted(norm(w) for w in words):
                problems.append(f"{name} ex {ex['n']}: matching answers {got} differ from the words {words}")


def merge_lesson(name, exercises, key_blocks, problems):
    items, by_n = [], {}
    for b in key_blocks:
        by_n.setdefault(b["n"], []).append(b)
    found = {ex["n"] for ex in exercises}
    for n in by_n:
        if n not in found:
            problems.append(f"{name}: the key has answers for exercise {n}, but it was not found in the book")
    for ex in exercises:
        blocks = by_n.get(ex["n"], [])
        if not blocks:
            if ex_type(ex["instruction"]) != "open":
                problems.append(f"{name} ex {ex['n']} ({ex['instruction']}): no answers in the key")
            SKIPPED.append(f"{name} ex {ex['n']}")
            continue        # personal questions: no answers in the key
        typ, bank, rows = build_rows(ex, False)
        main = blocks[0]["answers"]
        extra = [a for b in blocks[1:] for a in b["answers"]]
        if typ == "choice" and len(main) > len(rows):
            main = join_wrapped_answers(main, rows)
        if len(rows) != len(main) + len(extra):
            problems.append(f"{name} ex {ex['n']} (p{ex['page']}): {len(rows)} items but "
                            f"{len(main)}+{len(extra)} answers in key: " + " | ".join(r["prompt"][:30] for r in rows))
            continue
        groups = match_groups(rows) if typ == "match" else None
        num = name.split()[1]
        fixed = [KNOWN_DIFFERENCES.get(f"w{num}-{ex['n']}-{k + 1}", (None, a))[1]
                 if norm(KNOWN_DIFFERENCES.get(f"w{num}-{ex['n']}-{k + 1}", ("",))[0]) == norm(a) else a
                 for k, a in enumerate(main)]
        check_pools(name, ex, typ, bank, rows[:len(main)], fixed, groups, problems)
        for k, (row, ans) in enumerate(zip(rows, main + extra)):
            starred = k >= len(main)
            idx = (k - len(main) + 1) if starred else (k + 1)
            items.append(make_item(name, ex, typ, bank, row, ans, idx, starred, groups.get(k) if groups else None, problems))
    return items


def join_wrapped_answers(answers, rows):
    """An answer the key wraps over two lines: join it when only the joined text is a choice."""
    out, i = [], 0
    while i < len(answers):
        k = len(out)
        choices = [norm(c) for c in split_choices(rows[k]["right"])] if k < len(rows) else []
        if norm(answers[i]) not in choices and i + 1 < len(answers) and \
                norm(answers[i] + " " + answers[i + 1]) in choices:
            out.append(answers[i] + " " + answers[i + 1])
            i += 2
        else:
            out.append(answers[i])
            i += 1
    return out


NOTICES = []


def merge_test(name, exercises, key_blocks, problems):
    """Tests: parts A–D with numbered items; the key lists one answer per numbered item."""
    items, answers = [], {}
    by_part = {}
    for b in key_blocks:
        if b["n"] is not None:
            by_part.setdefault(b["part"], []).append(b)
    for part, blocks in by_part.items():
        nums = [b["n"] for b in blocks]
        expected = [str(k) for k in range(1, len(blocks) + 1)]
        if nums != expected:
            # e.g. the key prints "2" twice where it means "1, 2": number them in order
            NOTICES.append(f"{name} part {part}: key numbering {','.join(nums[:4])}… read in order as 1–{len(blocks)}")
            nums = expected
        for n, b in zip(nums, blocks):
            answers[(part, n)] = " ".join(b["answers"])
    for ex in exercises:
        typ, bank, rows = build_rows(ex, True)
        want = [k for k in answers if k[0] == ex["n"]]
        if len(rows) != len(want):
            problems.append(f"{name} part {ex['n']} (p{ex['page']}): {len(rows)} items but {len(want)} answers in key")
            continue
        words = [w for r in rows for w in r["rights"]] if typ == "match" else None
        for row in rows:
            ans = answers.get((ex["n"], row["num"]))
            if ans is None:
                problems.append(f"{name} part {ex['n']} item {row['num']}: no answer in key")
                continue
            items.append(make_item(name, ex, typ, bank, row, ans, row["num"], False, words, problems))
    return items


def make_item(name, ex, typ, bank, row, answer, idx, starred, match_words, problems):
    num = int(name.split()[1])
    is_test = name.startswith("TUSSENTOETS")
    choices = None
    if typ == "choice" and row["right"]:
        kind, choices = "choice", split_choices(row["right"])
    elif typ == "match" and match_words:
        kind, choices = "match", match_words
    elif typ in ("fill", "opposite") and bank and not starred:
        kind, choices = "fill", bank
    else:
        kind = "recall"
    item_id = f"{'t' if is_test else 'w'}{num}-{ex['n']}{'x' if starred else ''}-{idx}"
    note, also = None, None
    if choices is not None and norm(answer) not in [norm(c) for c in choices]:
        # the key often lists several good answers: "bijzonder, gek, raar, ongewoon, vreemd"
        alts = alternatives(answer)
        hit = next((a for a in alts if norm(a) in [norm(c) for c in choices]), None)
        if hit and len(alts) > 1:
            also, answer = answer, hit
    if choices is not None and norm(answer) not in [norm(c) for c in choices]:
        known = KNOWN_DIFFERENCES.get(item_id)
        if known and norm(known[0]) == norm(answer):
            note = f"The answer key says “{answer}”, but {known[2]}"
            answer = known[1]
        else:
            problems.append(f"{item_id} ({name} ex {ex['n']}, p{row['page'] + 1}): answer {answer!r} not in "
                            f"choices {choices}  | {row['prompt']}")
    if choices is not None:
        # use the spelling printed in the book for the answer
        answer = next((c for c in choices if norm(c) == norm(answer)), answer)
    rec = {
        "id": item_id,
        "lesson": None if is_test else num,
        "test": num if is_test else None,
        "exercise": ex["n"],
        "extra": starred,
        "kind": kind,
        "instruction": ex["instruction"],
        "prompt": tidy_prompt(row["prompt"]),
        "answer": answer,
        "page": row["page"] + 1,
    }
    if choices:
        rec["choices"] = choices
    if also:
        rec["alsoGood"] = also
    if note:
        rec["note"] = note
    return rec


def alternatives(answer):
    """'(ge)makkelijk, eenvoudig' -> ['gemakkelijk', 'makkelijk', 'eenvoudig']"""
    out = []
    for part in re.split(r",\s*|\s+of\s+", answer):
        m = re.fullmatch(r"(.*)\(([^)]*)\)(.*)", part.strip())
        if m:
            out += [m.group(1) + m.group(2) + m.group(3), m.group(1) + m.group(3)]
        elif part.strip():
            out.append(part.strip())
    return out


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent)
    args = ap.parse_args()
    if not args.pdf.exists():
        fail(f"PDF not found: {args.pdf}")

    with pdfplumber.open(str(args.pdf)) as pdf:
        ranges, key_start, key_end = page_kinds(pdf)
        key = parse_key(pdf, key_start, key_end)
        wanted = [f"LES {n}" for n in range(FIRST_LESSON, LAST_LESSON + 1)] + [f"TUSSENTOETS {n}" for n in range(1, 5)]
        for where, have in (("book", ranges), ("answer key", key)):
            missing = [w for w in wanted if w not in have]
            if missing:
                fail(f"sections not found in the {where}: " + ", ".join(missing))
        wanted.sort(key=lambda w: ranges[w]["pages"][0])      # book order: each test after its lessons

        problems, lessons, tests, items = [], [], [], []
        for name in wanted:
            is_test = name.startswith("TUSSENTOETS")
            tl, exercises = parse_section(pdf, ranges[name]["pages"], is_test)
            if is_test:
                items += merge_test(name, exercises, key[name], problems)
                tests.append({"test": int(name.split()[1]), "title": f"Tussentoets {name.split()[1]}",
                              "page": ranges[name]["pages"][0] + 1})
            else:
                items += merge_lesson(name, exercises, key[name], problems)
                title = re.sub(r"^LES \d+\s*", "", ranges[name]["title"])
                lessons.append({"lesson": int(name.split()[1]), "title": title, "text": lesson_text(tl),
                                "page": ranges[name]["pages"][0] + 1})

    ids = [it["id"] for it in items]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        problems.append("duplicate ids: " + ", ".join(dupes))
    unused = sorted(set(KNOWN_DIFFERENCES) - {it["id"] for it in items if "note" in it})
    if unused:
        problems.append("KNOWN_DIFFERENCES no longer needed (book changed?): " + ", ".join(unused))
    if problems:
        print("Problems found:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        fail(f"{len(problems)} problem(s); nothing written")

    data_dir = args.out / "assets" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    doc = {
        "source": args.pdf.name,
        "sourceSha1": hashlib.sha1(args.pdf.read_bytes()).hexdigest(),
        "generated": date.today().isoformat(),
        "count": len(items),
        "lessons": lessons,
        "tests": tests,
        "items": items,
    }
    (data_dir / "workbook.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    kinds = {}
    for it in items:
        kinds[it["kind"]] = kinds.get(it["kind"], 0) + 1
    n_lesson = sum(1 for it in items if it["lesson"])
    print(f"OK  {len(items)} items: {n_lesson} from {len(lessons)} lessons, {len(items) - n_lesson} from "
          f"{len(tests)} tests  ({', '.join(f'{k} {v}' for k, v in sorted(kinds.items()))})")
    print(f"    data -> {data_dir / 'workbook.json'}")
    if KNOWN_DIFFERENCES:
        print(f"    {len(KNOWN_DIFFERENCES)} known book/key differences applied (see KNOWN_DIFFERENCES)")
    for n in NOTICES:
        print("    note: " + n)
    print(f"    skipped {len(SKIPPED)} personal 'Geef antwoord' exercises (no answers in the key)")


if __name__ == "__main__":
    main()
