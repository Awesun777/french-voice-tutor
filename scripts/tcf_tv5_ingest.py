#!/usr/bin/env python3
"""
Ingest one TV5MONDE / France Éducation international TCF training booklet
(the official downloadable PDF + its listening MP3) into the admin-only
"TCF Blanc" tab.

  railway run --service french-voice-tutor -- \
      .venv/bin/python scripts/tcf_tv5_ingest.py \
          --pdf  "~/Desktop/RomainTalk/TCF Romain/tv5-tcf/tcf1_2.pdf" \
          --mp3  "~/Desktop/RomainTalk/TCF Romain/tv5-tcf/tcf1-podcast.mp3" \
          --series 1 --out /tmp/tv5-1.json [--upload]

Pipeline
  1. Render every booklet page and have GPT-4o read the items (number,
     question, A–D choices, whether a document image belongs to it) — the
     booklets are print-to-PDF of the web app, all vector art, no text layer.
  2. Pull each page's embedded photo (the reading documents / listening
     pictures) straight out of the PDF and attach it to its item.
  3. Read the "Corrigé" grid on the last page → 40 answer letters.
  4. Split the MP3 at the long silences that separate questions, re-encode
     each clip to 64 kbps mono, transcribe it with Whisper (fr).
  5. Write a JSON; with --upload, upsert into MySQL `tcf_tv5_items`
     (MYSQL_PUBLIC_URL or DATABASE_URL).

Deps: pymupdf, requests, pymysql (a uv venv is fine), ffmpeg on PATH,
OPENAI_API_KEY in the environment (hence `railway run`).
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pymupdf
import requests

OPENAI = "https://api.openai.com/v1"
VISION_MODEL = "gpt-4o"

SECTION_BY_N = lambda n: "oral" if n <= 15 else ("structure" if n <= 25 else "ecrit")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def openai_headers():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("OPENAI_API_KEY not set (run through `railway run`)")
    return {"Authorization": f"Bearer {key}"}


def chat_json(messages, max_tokens=4000, retries=3):
    for attempt in range(retries):
        r = requests.post(
            f"{OPENAI}/chat/completions",
            headers={**openai_headers(), "Content-Type": "application/json"},
            json={
                "model": VISION_MODEL,
                "messages": messages,
                "temperature": 0,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
            },
            timeout=180,
        )
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(3 * (attempt + 1))
            continue
        r.raise_for_status()
        return json.loads(r.json()["choices"][0]["message"]["content"])
    r.raise_for_status()


def page_png_b64(page: pymupdf.Page, dpi=130) -> str:
    return base64.b64encode(page.get_pixmap(dpi=dpi).tobytes("png")).decode()


PAGE_PROMPT = """Tu lis une page d'un livret d'entraînement au TCF (QCM en français).
Extrais TOUS les items présents sur la page, dans l'ordre. Réponds en JSON strict :
{"consigne": "<la consigne de section si un titre de section (COMPRÉHENSION ORALE / STRUCTURE DE LA LANGUE / COMPRÉHENSION ÉCRITE) apparaît sur cette page, sinon null>",
 "section_title": "<le titre de section s'il apparaît, sinon null>",
 "items": [
   {"n": <numéro de l'item>,
    "consigne_before": "<la ligne d'instruction commençant par « > » imprimée juste AU-DESSUS de ce numéro d'item (par ex. « Écoutez le document sonore et la question. Choisissez la bonne réponse. »), sinon null>",
    "question": "<texte de la question ou de la phrase à compléter, tel qu'imprimé, sinon null>",
    "choices": ["<A>", "<B>", "<C>", "<D>"],
    "has_image": <true si un document visuel (photo, extrait de presse, affiche…) est imprimé sous ce numéro>,
    "image_text": "<si has_image : transcris fidèlement tout le texte lisible dans le document ; si c'est une photo sans texte, décris-la en une ou deux phrases précédées de « Photo : » (personnes, lieu, action, objets) ; sinon null>"}
 ]}
Règles : recopie les textes exactement (accents, ponctuation), sans la lettre A/B/C/D devant chaque choix. Si les choix A B C D sont imprimés sans texte (item audio), mets quatre chaînes vides. Ne mets jamais la mention « Validé par CIE » dans image_text. Ne commente pas, n'invente rien. Une page peut contenir 0 item (feuille de réponses, page de garde) : items = []."""

GRID_PROMPT = """Cette page est le corrigé d'un QCM de 40 questions : pour chaque numéro (1 à 40), une croix X marque la bonne réponse dans l'une des colonnes A, B, C, D. Les numéros sont disposés en trois colonnes (1–15, 16–25, 26–40).
Lis très attentivement la position de chaque X et réponds en JSON strict : {"answers": {"1": "B", "2": "A", ... , "40": "C"}}. Il doit y avoir exactement 40 entrées, chacune une lettre A, B, C ou D."""


LETTER_PREFIX = re.compile(r"^[ABCD][\s.)\-–:]+(?=\S)")


def clean_choice(c: str) -> str:
    c = (c or "").strip()
    if re.fullmatch(r"[ABCD][.)]?", c):
        return ""  # a bare letter = the choice is spoken, not printed
    return LETTER_PREFIX.sub("", c).strip()


def clean_doc_text(t: str | None) -> str | None:
    t = (t or "").replace("Validé par CIE", "").strip()
    return t or None


def extract_items(doc: pymupdf.Document, cache_dir: Path | None):
    items: dict[int, dict] = {}
    consignes: dict[str, str] = {}
    last_n = 0
    current_consigne: str | None = None
    for pno in range(len(doc)):
        page = doc[pno]
        cache = cache_dir / f"page{pno + 1}.v3.json" if cache_dir else None
        if cache and cache.exists():
            data = json.loads(cache.read_text())
        else:
            b64 = page_png_b64(page)
            data = chat_json([
                {"role": "user", "content": [
                    {"type": "text", "text": PAGE_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"}},
                ]}
            ])
            if cache:
                cache.write_text(json.dumps(data, ensure_ascii=False))
        page_items = data.get("items") or []
        # Items are printed in order; the model occasionally misreads a big
        # numeral (39 → 1), so trust the sequence over the OCR'd number.
        for it in page_items:
            try:
                n = int(it.get("n"))
            except (TypeError, ValueError):
                n = 0
            if n != last_n + 1:
                log(f"  page {pno + 1}: item numbered {n!r}, expected {last_n + 1}; using sequence")
                n = last_n + 1
            it["n"] = n
            last_n = n
        if data.get("section_title") and data.get("consigne"):
            consignes[data["section_title"].strip().lower()] = data["consigne"].strip()
        # Embedded photos on this page, top to bottom, assigned in order to the
        # items the model flagged as having a document.
        photos = []
        for img in page.get_images(full=True):
            xref = img[0]
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            info = doc.extract_image(xref)
            if info["width"] < 120 or info["height"] < 60:
                continue  # icons / logos
            photos.append((rects[0].y0, info))
        photos.sort(key=lambda t: t[0])
        want = [it for it in page_items if it.get("has_image")]
        if len(want) != len(photos):
            log(f"  page {pno + 1}: {len(want)} items flagged with image vs {len(photos)} photos found")
        for it, (_, info) in zip(want, photos):
            it["_image"] = info
        for it in page_items:
            n = int(it["n"])
            cb = (it.get("consigne_before") or "").strip().lstrip(">").strip()
            # "Validé par CIE" is the item's caption, not an instruction.
            if cb and "CIE" not in cb and len(cb) > 20:
                current_consigne = cb
            ch = [clean_choice(c) for c in (it.get("choices") or [])][:4]
            while len(ch) < 4:
                ch.append("")
            rec = {
                "n": n,
                "section": SECTION_BY_N(n),
                "consigne": current_consigne,
                "question": (it.get("question") or "").strip() or None,
                "choices": ch,
                "spoken_choices": all(c == "" for c in ch),
                "doc_text": clean_doc_text(it.get("image_text")),
                "image_b64": None,
                "image_mime": None,
            }
            if it.get("_image"):
                info = it["_image"]
                rec["image_b64"] = base64.b64encode(info["image"]).decode()
                rec["image_mime"] = f"image/{info['ext']}"
            if n in items:
                log(f"  duplicate item {n} on page {pno + 1}; keeping first")
            else:
                items[n] = rec
        log(f"page {pno + 1}/{len(doc)}: {[int(i['n']) for i in page_items]}")
    return items, consignes


# The "Corrigé" page is the same print template in every booklet: three
# blocks of rows (1–15, 16–25, 26–40); columns A–D are ~15.5 pt apart and rows
# ~17.4 pt apart, and each X is a real text glyph with coordinates.
GRID_BLOCKS = [(156.0, 1, 15), (290.0, 16, 25), (423.0, 26, 40)]
GRID_COL_STEP, GRID_ROW_STEP, GRID_TOP = 15.5, 17.4, 55.0


def read_grid_geometric(doc: pymupdf.Document) -> dict[int, str] | None:
    page = doc[len(doc) - 1]
    xs = [w for w in page.get_text("words") if w[4] == "X"]
    if len(xs) != 40:
        log(f"grid: found {len(xs)} X glyphs, expected 40 — falling back to vision")
        return None
    answers: dict[int, str] = {}
    for x0, y0, _x1, _y1, *_ in xs:
        block = min(GRID_BLOCKS, key=lambda b: abs(b[0] - x0))
        col = (x0 - block[0]) / GRID_COL_STEP
        row = (y0 - GRID_TOP) / GRID_ROW_STEP
        if abs(col - round(col)) > 0.25 or abs(row - round(row)) > 0.25 or not (0 <= round(col) <= 3):
            log(f"grid: X at ({x0:.1f},{y0:.1f}) does not sit on the grid — falling back to vision")
            return None
        n = block[1] + round(row)
        if n > block[2] or n in answers:
            log(f"grid: row mapping conflict at item {n} — falling back to vision")
            return None
        answers[n] = "ABCD"[round(col)]
    if sorted(answers) != list(range(1, 41)):
        return None
    log("grid: read 40 answers from X glyph positions")
    return answers


def read_grid(doc: pymupdf.Document) -> dict[int, str]:
    geo = read_grid_geometric(doc)
    if geo:
        return geo
    page = doc[len(doc) - 1]
    data = chat_json([
        {"role": "user", "content": [
            {"type": "text", "text": GRID_PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{page_png_b64(page, dpi=170)}", "detail": "high"}},
        ]}
    ], max_tokens=800)
    answers = {int(k): str(v).strip().upper() for k, v in (data.get("answers") or {}).items()}
    bad = [n for n in range(1, 41) if answers.get(n) not in ("A", "B", "C", "D")]
    if bad:
        sys.exit(f"answer grid incomplete/invalid for items {bad}: {answers}")
    return answers


def detect_silences(mp3: Path, min_len: float, noise_db: int = -35):
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp3), "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    starts = [float(m) for m in re.findall(r"silence_start: ([0-9.]+)", out)]
    ends = [float(m) for m in re.findall(r"silence_end: ([0-9.]+)", out)]
    return list(zip(starts, ends))


def duration_of(mp3: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)], capture_output=True, text=True).stdout
    return float(out.strip())


def split_audio(mp3: Path, expected: int = 15):
    """Cut at the long (~6 s) gaps between questions.

    The podcast opens with a ~2 min spoken intro that runs straight into
    question 1 (only a short pause between them) and closes with an outro, so
    the long-gap split yields intro+Q1, Q2…Q15, outro. Q1 is recovered by
    re-cutting the first segment at its internal pauses: the trailing part
    whose length best matches the next two picture items is Q1."""
    total = duration_of(mp3)
    for min_len in (4.5, 4.0, 3.5, 5.0, 5.5, 3.0):
        gaps = detect_silences(mp3, min_len)
        bounds = [0.0] + [(s + e) / 2 for s, e in gaps] + [total]
        segs = [(a, b) for a, b in zip(bounds, bounds[1:]) if b - a > 4]
        if len(segs) == expected:
            log(f"audio: {len(segs)} clips with gap>={min_len}s")
            return segs
        if len(segs) == expected + 2:
            log(f"audio: {len(segs)} clips with gap>={min_len}s; dropping intro and outro")
            return segs[1:-1]
        if len(segs) == expected + 1:
            first = segs[0]
            if first[1] - first[0] > 90:
                # intro + Q1 fused; the last segment is the outro
                target = sum(b - a for a, b in segs[1:3]) / 2
                inner = [(x, y) for x, y in detect_silences(mp3, 1.6) if first[0] + 5 < x < first[1] - 5]
                best = None
                for x, y in inner:
                    cut = (x + y) / 2
                    d = abs((first[1] - cut) - target)
                    if best is None or d < best[0]:
                        best = (d, cut)
                if best and best[0] < target * 0.5:
                    q1 = (best[1], first[1])
                    log(f"audio: {len(segs)} clips with gap>={min_len}s; Q1 recovered from the intro chunk ({q1[1]-q1[0]:.0f}s), outro dropped")
                    return [q1] + segs[1:-1]
                sys.exit("could not isolate Q1 inside the intro chunk")
            log(f"audio: {len(segs)} clips with gap>={min_len}s; dropping the leading intro ({first[1]-first[0]:.0f}s)")
            return segs[1:]
        log(f"audio: gap>={min_len}s gives {len(segs)} clips (want {expected})")
    sys.exit("could not split the audio into 15 clips; inspect with silencedetect")


def encode_clip(mp3: Path, start: float, end: float, dst: Path):
    # 0.35 s of lead-in so the first syllable is never clipped.
    ss = max(0.0, start - 0.35)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{ss:.3f}", "-to", f"{end:.3f}", "-i", str(mp3),
         "-ac", "1", "-ar", "44100", "-b:a", "64k", str(dst)],
        check=True,
    )


TRANSCRIBE_MODEL = "gpt-4o-transcribe"
CUE_BREAK = re.compile(r"\s+(?=(?:[ABCD]\.\s|Regardez l'image|Écoutez |Question\b))")


def transcribe(path: Path) -> str:
    # Long pauses between the spoken A/B/C/D propositions make ASR drop
    # some of them; squeeze silences to 0.7 s before sending.
    trimmed = path.with_name(path.stem + ".trim.mp3")
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
         "-af", "silenceremove=stop_periods=-1:stop_duration=0.7:stop_threshold=-38dB", "-ac", "1", "-b:a", "64k", str(trimmed)],
        check=True,
    )
    with open(trimmed, "rb") as f:
        r = requests.post(
            f"{OPENAI}/audio/transcriptions",
            headers=openai_headers(),
            files={"file": (trimmed.name, f, "audio/mpeg")},
            data={"model": TRANSCRIBE_MODEL, "language": "fr", "response_format": "text",
                  "prompt": "Entraînement au TCF, compréhension orale. Chaque proposition est annoncée par sa lettre : A. … B. … C. … D. …"},
            timeout=300,
        )
    r.raise_for_status()
    text = " ".join(r.text.split())
    return CUE_BREAK.sub("\n", text).strip()


def upload(series: int, title: str, items: list[dict]):
    import pymysql
    from urllib.parse import urlparse, unquote

    url = os.environ.get("MYSQL_PUBLIC_URL") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("MYSQL_PUBLIC_URL / DATABASE_URL not set")
    u = urlparse(url)
    conn = pymysql.connect(host=u.hostname, port=u.port or 3306, user=unquote(u.username or ""), password=unquote(u.password or ""),
                           database=u.path.lstrip("/"), charset="utf8mb4", autocommit=False)
    now = int(time.time() * 1000)
    with conn.cursor() as cur:
        for it in items:
            cur.execute(
                """INSERT INTO tcf_tv5_items
                   (series, n, section, consigne, question, choices_json, spoken_choices, answer, doc_text,
                    image_b64, image_mime, audio_b64, audio_mime, audio_seconds, transcript, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON DUPLICATE KEY UPDATE section=VALUES(section), consigne=VALUES(consigne), question=VALUES(question),
                     choices_json=VALUES(choices_json), spoken_choices=VALUES(spoken_choices), answer=VALUES(answer),
                     doc_text=VALUES(doc_text), image_b64=VALUES(image_b64), image_mime=VALUES(image_mime),
                     audio_b64=VALUES(audio_b64), audio_mime=VALUES(audio_mime), audio_seconds=VALUES(audio_seconds),
                     transcript=VALUES(transcript), created_at=VALUES(created_at)""",
                (series, it["n"], it["section"], it.get("consigne"), it.get("question"), json.dumps(it["choices"], ensure_ascii=False),
                 1 if it.get("spoken_choices") else 0, it["answer"], it.get("doc_text"), it.get("image_b64"), it.get("image_mime"),
                 it.get("audio_b64"), it.get("audio_mime"), it.get("audio_seconds"), it.get("transcript"), now),
            )
        cur.execute(
            "INSERT INTO tcf_tv5_series (series, title, item_count, created_at) VALUES (%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE title=VALUES(title), item_count=VALUES(item_count), created_at=VALUES(created_at)",
            (series, title, len(items), now),
        )
    conn.commit()
    conn.close()
    log(f"uploaded {len(items)} items for series {series}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--mp3", required=True)
    ap.add_argument("--series", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--reuse", help="reuse an earlier --out JSON (skip vision/audio) and just upload")
    ap.add_argument("--cache-dir", help="directory for per-page vision results (re-runs skip the API)")
    ap.add_argument("--reuse-audio", help="take clips + transcripts from an earlier --out JSON instead of re-splitting/transcribing")
    a = ap.parse_args()

    title = f"TV5MONDE — Entraînement n°{a.series}"
    if a.reuse:
        data = json.load(open(a.reuse))
        if a.upload:
            upload(a.series, title, data["items"])
        return

    pdf, mp3 = Path(os.path.expanduser(a.pdf)), Path(os.path.expanduser(a.mp3))
    doc = pymupdf.open(pdf)
    log(f"booklet: {len(doc)} pages")
    cache_dir = None
    if a.cache_dir:
        cache_dir = Path(os.path.expanduser(a.cache_dir)) / f"series{a.series}"
        cache_dir.mkdir(parents=True, exist_ok=True)
    items, consignes = extract_items(doc, cache_dir)
    missing = [n for n in range(1, 41) if n not in items]
    if missing:
        sys.exit(f"items missing after extraction: {missing}")
    answers = read_grid(doc)
    for n, rec in items.items():
        rec["answer"] = answers[n]
        if not rec.get("consigne"):
            key = {"oral": "compréhension orale", "structure": "structure de la langue", "ecrit": "compréhension écrite"}[rec["section"]]
            rec["consigne"] = consignes.get(key)

    if a.reuse_audio:
        prev = {it["n"]: it for it in json.load(open(os.path.expanduser(a.reuse_audio)))["items"]}
        for n in range(1, 16):
            for k in ("audio_b64", "audio_mime", "audio_seconds", "audio_bounds", "transcript"):
                items[n][k] = prev[n].get(k)
        log("audio: reused clips and transcripts from " + a.reuse_audio)
        segs = []
    else:
        segs = split_audio(mp3, 15)
    with tempfile.TemporaryDirectory() as td:
        for i, (s, e) in enumerate(segs, start=1):
            clip = Path(td) / f"q{i}.mp3"
            encode_clip(mp3, s, e, clip)
            rec = items[i]
            rec["audio_b64"] = base64.b64encode(clip.read_bytes()).decode()
            rec["audio_mime"] = "audio/mpeg"
            rec["audio_seconds"] = round(e - s, 1)
            rec["audio_bounds"] = [round(s, 2), round(e, 2)]
            rec["transcript"] = transcribe(clip)
            log(f"clip {i}: {e - s:.1f}s, transcript {len(rec['transcript'])} chars")

    ordered = [items[n] for n in range(1, 41)]
    out = {"series": a.series, "title": title, "items": ordered}
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False))
    log(f"wrote {a.out}")
    # Human-readable summary (no blobs) next to it
    summary = [{k: v for k, v in it.items() if k not in ("image_b64", "audio_b64")} for it in ordered]
    Path(a.out).with_suffix(".summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    if a.upload:
        upload(a.series, title, ordered)


if __name__ == "__main__":
    main()
