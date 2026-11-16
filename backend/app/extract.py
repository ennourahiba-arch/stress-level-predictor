"""Reads uploaded course files in memory and splits them into numbered passages.

Files are never written to disk or kept after the request. Passages get ids
(P1, P2, ...) so every generated question can cite exactly where it came from.
"""
from __future__ import annotations

import io
import re
from typing import Any

MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES = 6
PASSAGE_TARGET = 900          # characters per passage, split on paragraph breaks
MAX_MATERIAL_CHARS = 90_000   # what is sent to the AI for course material
MAX_PAST_EXAM_CHARS = 25_000  # style examples from past exams


class ExtractError(ValueError):
    pass


def _pdf(data: bytes) -> str:
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ExtractError("This PDF is password-protected. Remove the password and upload it again.")
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)
    except ExtractError:
        raise
    except Exception:
        raise ExtractError("This PDF couldn't be read. Try exporting it again as PDF.")


def _docx(data: bytes) -> str:
    import docx
    try:
        d = docx.Document(io.BytesIO(data))
    except Exception:
        raise ExtractError("This Word file couldn't be read. Save it as .docx and try again.")
    parts = [p.text for p in d.paragraphs]
    for table in d.tables:
        for row in table.rows:
            parts.append(" | ".join(c.text for c in row.cells))
    return "\n\n".join(parts)


def _pptx(data: bytes) -> str:
    from pptx import Presentation
    try:
        prs = Presentation(io.BytesIO(data))
    except Exception:
        raise ExtractError("This PowerPoint file couldn't be read. Save it as .pptx and try again.")
    slides = []
    for i, slide in enumerate(prs.slides, start=1):
        texts = [sh.text_frame.text for sh in slide.shapes if getattr(sh, "has_text_frame", False) and sh.text_frame.text.strip()]
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
            texts.append(slide.notes_slide.notes_text_frame.text)
        if texts:
            slides.append(f"Slide {i}\n" + "\n".join(texts))
    return "\n\n".join(slides)


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_FILE_BYTES:
        raise ExtractError(f"{filename} is larger than 15 MB.")
    name = filename.lower()
    if name.endswith(".pdf"):
        text = _pdf(data)
    elif name.endswith(".docx"):
        text = _docx(data)
    elif name.endswith(".pptx"):
        text = _pptx(data)
    elif name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="replace")
    elif name.endswith((".doc", ".ppt")):
        raise ExtractError(f"{filename} uses an old Office format. Save it as .docx or .pptx and upload again.")
    else:
        raise ExtractError(f"{filename}: supported files are PDF, Word (.docx), PowerPoint (.pptx) and text.")
    text = re.sub(r"[ \t\u00a0]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) < 200:
        raise ExtractError(
            f"{filename} has almost no selectable text. If it's a scan or photos of pages, it needs text recognition first."
        )
    return text


def _pieces(text: str, limit: int = PASSAGE_TARGET * 2):
    """Paragraphs, with over-long ones split at sentence ends (hard cut as a last resort)."""
    for para in (p.strip() for p in text.split("\n\n")):
        if not para:
            continue
        if len(para) <= limit:
            yield para
            continue
        chunk = ""
        for sent in re.split(r"(?<=[.!?])\s+", para):
            while len(sent) > limit:
                yield sent[:limit]
                sent = sent[limit:]
            if len(chunk) + len(sent) + 1 > limit and chunk:
                yield chunk
                chunk = ""
            chunk = f"{chunk} {sent}".strip()
        if chunk:
            yield chunk


def to_passages(docs: list[tuple[str, str]], start: int = 1, cap: int = MAX_MATERIAL_CHARS) -> tuple[list[dict[str, Any]], bool]:
    """Group text into ~900-character passages with ids P1, P2, ... Returns (passages, truncated)."""
    out: list[dict[str, Any]] = []
    total, n = 0, start

    def emit(fname: str, text: str) -> None:
        nonlocal total, n
        out.append({"id": f"P{n}", "file": fname, "text": text})
        n += 1
        total += len(text)

    for fname, text in docs:
        buf = ""
        for piece in _pieces(text):
            if total >= cap:
                return out, True
            buf = f"{buf}\n\n{piece}" if buf else piece
            if len(buf) >= PASSAGE_TARGET:
                emit(fname, buf)
                buf = ""
        if buf:
            if total >= cap:
                return out, True
            emit(fname, buf)
    return out, False
