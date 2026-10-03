"""Add canonical, clickable DOI links without changing published PDF text or layout.

Run with the bundled Codex Python runtime, which includes pdfplumber and pypdf.
"""

import argparse
import logging
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, NameObject, NumberObject, TextStringObject


DOI_PATTERN = re.compile(r"10\.\d{4,9}/[^\s<>\"']+", re.IGNORECASE)
logging.getLogger("pypdf").setLevel(logging.ERROR)


def canonical_url(word: str) -> str | None:
    match = DOI_PATTERN.search(word)
    if not match:
        return None
    doi = match.group().rstrip(".,;:)]}")
    return f"https://doi.org/{doi}" if doi else None


def intersection_area(first: tuple[float, ...], second: tuple[float, ...]) -> float:
    return max(0, min(first[2], second[2]) - max(first[0], second[0])) * max(
        0, min(first[3], second[3]) - max(first[1], second[1])
    )


def link_dois(source: Path, output: Path) -> tuple[int, int]:
    reader = PdfReader(source, strict=False)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    added = 0
    corrected = 0

    with pdfplumber.open(source) as pdf:
        for page_index, page in enumerate(pdf.pages):
            if page.rotation:
                raise ValueError(f"Rotated page {page_index + 1} in {source}")
            height = float(page.height)
            for word in page.extract_words():
                url = canonical_url(word["text"])
                if not url:
                    continue
                rect = (
                    float(word["x0"]),
                    height - float(word["bottom"]),
                    float(word["x1"]),
                    height - float(word["top"]),
                )
                existing = None
                for annotation in writer.pages[page_index].get("/Annots") or []:
                    obj = annotation.get_object()
                    action_ref = obj.get("/A")
                    action = action_ref.get_object() if action_ref else None
                    if not action or "10." not in str(action.get("/URI", "")):
                        continue
                    old_rect = tuple(float(value) for value in obj.get("/Rect", []))
                    if len(old_rect) != 4:
                        continue
                    area = intersection_area(rect, old_rect)
                    word_area = (rect[2] - rect[0]) * (rect[3] - rect[1])
                    if word_area > 0 and area / word_area > 0.4:
                        existing = action
                        break
                if existing is not None:
                    current_url = str(existing.get("/URI"))
                    # A long DOI may wrap across words. The annotation retains
                    # the full identifier even when this word has only a prefix.
                    canonical_existing = canonical_url(current_url)
                    if canonical_existing and current_url != canonical_existing:
                        existing[NameObject("/URI")] = TextStringObject(canonical_existing)
                        corrected += 1
                    continue
                writer.add_uri(
                    page_index,
                    url,
                    rect,
                    border=ArrayObject([NumberObject(0), NumberObject(0), NumberObject(0)]),
                )
                added += 1

    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, suffix=".pdf", delete=False) as temp:
        temporary_path = Path(temp.name)
        writer.write(temp)
    temporary_path.replace(output)
    return added, corrected


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    added_links, corrected_links = link_dois(args.source, args.output)
    print(f"{args.output}: added {added_links}, corrected {corrected_links} DOI links")
