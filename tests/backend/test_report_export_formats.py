"""Real conversion checks for the three formats offered by the report reader.

Requires the same native WeasyPrint libraries as production PDF export.
No search, model calls, or external images are used.
"""
from pathlib import Path
from urllib.parse import unquote

import pytest
from docx import Document
from pypdf import PdfReader

from backend.utils import write_md_to_pdf, write_md_to_word, write_text_to_md


REPORT = "# Export validation\n\nA report with **readable content**.\n"


@pytest.mark.asyncio
async def test_markdown_export_preserves_source(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    result = await write_text_to_md(REPORT, "ui-format-check")
    assert Path(unquote(result)).read_text(encoding="utf-8") == REPORT


@pytest.mark.asyncio
async def test_word_export_is_a_readable_document(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    result = await write_md_to_word(REPORT, "ui-format-check")
    assert result, "Word export returned no download path"
    document = Document(unquote(result))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert "Export validation" in text
    assert "readable content" in text


@pytest.mark.asyncio
async def test_pdf_export_is_a_readable_document(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    result = await write_md_to_pdf(REPORT, "ui-format-check")
    assert result, "PDF export failed; check the native WeasyPrint dependencies"
    document = PdfReader(unquote(result))
    assert document.pages
    text = "\n".join(page.extract_text() for page in document.pages)
    assert "Export validation" in text
    assert "readable content" in text
