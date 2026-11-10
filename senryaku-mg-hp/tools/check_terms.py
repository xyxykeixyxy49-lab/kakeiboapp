#!/usr/bin/env python3
"""公開テキストの NGワード・商標表記チェッカー。

使い方:
    python3 tools/check_terms.py            # site/ 配下を検査
    python3 tools/check_terms.py path ...   # 指定ファイル/ディレクトリを検査

ルールの根拠は docs/brand-guideline.md を参照。
エラーが 1 件でもあれば終了コード 1 を返す（CI で使用）。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_SUFFIXES = {".html", ".htm", ".md", ".txt"}

FOOTNOTE = "「戦略MG®」は、株式会社戦略MG研究所の登録商標です"

# (正規表現, メッセージ)
NG_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"マネジメントゲーム\s*[（(]?\s*MG"), "NG「マネジメントゲームMG」→「戦略MG」を使う"),
    (re.compile(r"(?<!戦略MG)マネジメントゲーム"), "NG「マネジメントゲーム」単独 →「戦略MGマネジメントゲーム」と書く"),
    (re.compile(r"戦略MG会計"), "NG「戦略MG会計」"),
    (re.compile(r"戦略会計"), "NG「戦略会計」（戦略会計STRACも確認が取れるまで使用不可）"),
    (re.compile(r"STRAC", re.IGNORECASE), "NG「STRAC」"),
    (re.compile(r"(?<!戦略)MG(?![A-Za-z])"), "「MG」単独 →「戦略MG」と書く"),
]

TAG_RE = re.compile(r"<[^>]+>")


def strip_html(text: str) -> str:
    # コメント・タグを除いた本文だけを検査する（クラス名等の誤検知を防ぐ）
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<(script|style)\b.*?</\1>", "", text, flags=re.S | re.I)
    return TAG_RE.sub("", text)


def check_file(path: Path) -> list[str]:
    raw = path.read_text(encoding="utf-8")
    body = strip_html(raw) if path.suffix in {".html", ".htm"} else raw
    errors: list[str] = []
    for lineno, line in enumerate(body.splitlines(), 1):
        for pattern, msg in NG_RULES:
            for m in pattern.finditer(line):
                errors.append(f"{path.relative_to(ROOT)}:{lineno}: {msg}  …{line.strip()[:60]}")
    if path.suffix in {".html", ".htm"} and "戦略MG" in body:
        if "戦略MG®" not in body:
            errors.append(f"{path.relative_to(ROOT)}: 初出に「戦略MG®」表記がない")
        if FOOTNOTE not in body:
            errors.append(f"{path.relative_to(ROOT)}: 登録商標の注記（{FOOTNOTE}）がない")
    return errors


def iter_files(args: list[str]):
    targets = [Path(a).resolve() for a in args] or [ROOT / "site"]
    for t in targets:
        if t.is_dir():
            yield from (p for p in sorted(t.rglob("*")) if p.suffix in TARGET_SUFFIXES)
        elif t.suffix in TARGET_SUFFIXES:
            yield t


def main() -> int:
    errors = [e for f in iter_files(sys.argv[1:]) for e in check_file(f)]
    for e in errors:
        print(e)
    print(f"\n{len(errors)} 件の指摘" if errors else "OK: 指摘なし")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
