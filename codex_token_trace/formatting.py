from __future__ import annotations

from typing import Iterable, Sequence


def fmt_int(value: int | None) -> str:
    if value is None:
        return "-"
    return f"{value:,}"


def fmt_pct(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value * 100:.1f}%"


def shorten(text: str, width: int) -> str:
    text = text.replace("\n", "\\n")
    if len(text) <= width:
        return text
    return text[: max(0, width - 1)] + "…"


def table(headers: Sequence[str], rows: Iterable[Sequence[object]]) -> str:
    materialized = [[str(cell) for cell in row] for row in rows]
    widths = [len(h) for h in headers]
    for row in materialized:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))

    def render(row: Sequence[str]) -> str:
        return "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row))

    lines = [render(headers), render(["-" * w for w in widths])]
    lines.extend(render(row) for row in materialized)
    return "\n".join(lines)
