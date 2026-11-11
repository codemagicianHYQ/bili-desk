# -*- coding: utf-8 -*-
import re
from pathlib import Path

root = Path(r"d:\Document\01programming\front\bili-desk\src\renderer")
pat = re.compile(
    r"(err|e|error) instanceof Error \? \1\.message : (String\(\1\)|\"[^\"]+\")"
)

def ensure_import(text: str) -> str:
    if "formatDisplayedError" not in text:
        return text
    if re.search(r"formatDisplayedError[^;\n]*from \"@/lib/ipc-error\"", text):
        return text
    if "formatDisplayedError" in text and 'from "@/lib/ipc-error"' in text and "formatDisplayedError" in re.search(r'import \{([^}]+)\} from "@/lib/ipc-error";', text).group(1) if re.search(r'import \{([^}]+)\} from "@/lib/ipc-error";', text) else "":
        return text
    m = re.search(r'import \{([^}]+)\} from "@/lib/ipc-error";', text)
    if m and "formatDisplayedError" not in m.group(1):
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        names.append("formatDisplayedError")
        return text[: m.start()] + "import { " + ", ".join(names) + ' } from "@/lib/ipc-error";' + text[m.end() :]
    if m:
        return text
    first = re.search(r"^import [^\n]+\n", text, re.M)
    line = 'import { formatDisplayedError } from "@/lib/ipc-error";\n'
    if not first:
        return line + text
    return text[: first.end()] + line + text[first.end() :]

changed = []
for path in list(root.rglob("*.tsx")) + list(root.rglob("*.ts")):
    text = path.read_text(encoding="utf-8")
    new, n = pat.subn(
        lambda m: f'formatDisplayedError({m.group(1)}, undefined, {m.group(2) if m.group(2).startswith(chr(34)) else chr(34)+"操作失败"+chr(34)})',
        text,
    )
    if n == 0:
        continue
    new = ensure_import(new)
    path.write_text(new, encoding="utf-8")
    changed.append(f"{n} {path.name}")

print("\n".join(changed) or "none")
