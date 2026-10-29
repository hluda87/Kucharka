#!/usr/bin/env python3
"""
Import receptu z webu s minimální spotřebou tokenů.
Většina webů s recepty obsahuje schema.org/Recipe v JSON-LD - skript ho
jen stáhne a převede do formátu recepty.json, AI pak kontroluje jen výsledek.

Použití:
  python3 import_recipe.py "https://..."            # vypíše JSON receptu
  python3 import_recipe.py "https://..." --append   # přidá do ../recepty.json

Video (YouTube): zatím vezme název a popis ze stránky; pokud popis neobsahuje
suroviny, je potřeba ruční doplnění v editoru aplikace.
Používá jen standardní knihovnu Pythonu.
"""
import json, re, sys, urllib.request, unicodedata
from pathlib import Path

UNITS = ["kg","g","mg","l","ml","cl","lžíce","lžička","lžičky","lžic","hrnek","hrnky",
         "ks","kus","kusy","stroužek","stroužky","balení","balíček","konzerva","plechovka","špetka"]
COURSE_KEYWORDS = {
    "Polévka": ["polévka","polievka","vývar","soup"],
    "Dezert": ["dezert","koláč","bábovka","palačinka","tiramisu","muffin","dort"],
    "Snídaně": ["snídaně","omeleta","míchaná vejce","kaše"],
    "Pečení": ["chléb","rohlík","buchta","pečení"],
    "Nápoje": ["limonáda","smoothie","koktejl","nápoj"],
}

def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()

def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(s)).strip("-") or "recept"

def parse_fraction(txt: str):
    txt = txt.replace(",", ".").strip()
    if "/" in txt:
        a, b = txt.split("/", 1)
        try: return float(a) / float(b)
        except Exception: return None
    try: return float(txt)
    except Exception: return None

def parse_ingredient(line: str) -> dict:
    line = " ".join(line.strip().split())
    m = re.match(r"^(\d+(?:[.,]\d+)?(?:\s*/\s*\d+)?|\d+/\d+)\s*([a-záčďéěíňóřšťúůýž ]*?)\s+(.+)$", line, re.I)
    if not m:
        return {"amount": None, "unit": "", "name": line, "normalized": normalize(line), "note": "", "scalable": False}
    amount = parse_fraction(m.group(1))
    rest_unit = m.group(2).strip().lower()
    name = m.group(3).strip()
    unit = ""
    for u in sorted(UNITS, key=len, reverse=True):
        if rest_unit == u or rest_unit.startswith(u):
            unit = u; break
    if not unit and rest_unit:
        name = (rest_unit + " " + name).strip()
    note = ""
    if "," in name:
        name, note = [x.strip() for x in name.split(",", 1)]
    return {"amount": amount, "unit": unit, "name": name, "normalized": normalize(name), "note": note, "scalable": amount is not None}

def find_recipe_ld(html: str):
    blocks = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I)
    for b in blocks:
        try: data = json.loads(b.strip())
        except Exception: continue
        candidates = data if isinstance(data, list) else [data]
        for c in candidates:
            if isinstance(c, dict) and "@graph" in c: candidates.extend(c["@graph"])
        for c in candidates:
            if isinstance(c, dict) and "Recipe" in str(c.get("@type", "")):
                return c
    return None

def detect_courses(title: str, categories) -> list:
    hay = normalize(title + " " + " ".join(categories or []))
    found = [course for course, kws in COURSE_KEYWORDS.items() if any(normalize(k) in hay for k in kws)]
    return found or ["Hlavní chod"]

def parse_time(v) -> int | None:
    if not v: return None
    if isinstance(v, (int, float)): return int(v)
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", str(v))
    if m:
        d, h, mi = (int(x) if x else 0 for x in m.groups())
        return d*1440 + h*60 + mi
    digits = re.search(r"\d+", str(v))
    return int(digits.group()) if digits else None

def main():
    if len(sys.argv) < 2:
        print("Chybí URL", file=sys.stderr); sys.exit(2)
    url = sys.argv[1]; append = "--append" in sys.argv
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 KucharkaImport/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        html = r.read().decode("utf-8", "ignore")
    ld = find_recipe_ld(html)
    if not ld:
        print(json.dumps({"error": "no_json_ld", "url": url, "hint": "Web nemá schema.org/Recipe - je potřeba ruční/AI výtah z hlavní části stránky, nebo doplnit v editoru."}, ensure_ascii=False, indent=2))
        sys.exit(1)
    servings = ld.get("recipeYield")
    if isinstance(servings, list): servings = servings[0] if servings else 4
    m = re.search(r"\d+", str(servings or ""))
    base = int(m.group()) if m else 4
    cats = ld.get("recipeCategory"); cats = cats if isinstance(cats, list) else ([cats] if cats else [])
    instr = ld.get("recipeInstructions") or []
    steps = []
    if isinstance(instr, str): steps = [s.strip() for s in re.split(r"\n+", instr) if s.strip()]
    else:
        for it in instr:
            if isinstance(it, str): steps.append(it.strip())
            elif isinstance(it, dict):
                if it.get("text"): steps.append(it["text"].strip())
                elif it.get("itemListElement"): steps.extend(x.get("text","").strip() for x in it["itemListElement"] if isinstance(x, dict))
    img = ld.get("image"); img = img[0] if isinstance(img, list) else (img.get("url","") if isinstance(img, dict) else (img or ""))
    recipe = {
        "id": slug(ld.get("name","recept")),
        "title": ld.get("name","Bez názvu"),
        "source_url": url, "image": img or "",
        "courses": detect_courses(ld.get("name",""), cats),
        "base_servings": base,
        "time_minutes": parse_time(ld.get("totalTime") or ld.get("cookTime") or ld.get("prepTime")),
        "ingredients": [parse_ingredient(x) for x in (ld.get("recipeIngredient") or [])],
        "steps": [s for s in steps if s], "notes": ""
    }
    if append:
        path = Path(__file__).resolve().parent.parent / "recepty.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        if any(r["id"] == recipe["id"] for r in data):
            print(f"Recept {recipe['id']} už v kuchařce je, nepřidávám duplicitu."); return
        data.append(recipe); path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Přidáno do {path}: {recipe['title']}")
    else:
        print(json.dumps(recipe, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
