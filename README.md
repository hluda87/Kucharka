# Naše Kuchařka (MVP)

Statická webová aplikace (GitHub Pages + PWA) - funguje online i offline po prvním načtení.
Žádný server, data jsou v `recepty.json`.

## Funkce
- Seznam receptů, hledání podle názvu a surovin
- Filtry: podle chodu a podle surovin
  - režim *Obsahuje vybrané* - recept musí mít všechny vybrané suroviny
  - režim *Mám doma* - vyber suroviny, které máš doma; ukážou se recepty, kde chybí max 2 další
- Detail receptu s přepočtem surovin podle počtu porcí (+/-), rozumné zaokrouhlení
  (g/ml na celá čísla, lžíce/hrnky/ks na čtvrtiny, neskalovatelné položky jako „sůl dle chuti" beze změny)
- Editace přímo v aplikaci: název, chod, čas, porce, suroviny, postup, poznámka.
  Úpravy se ukládají lokálně v zařízení (localStorage). Tlačítko **Export změn**
  stáhne aktuální `recepty.json` - ten mi pošli pro trvalé zveřejnění.
  **Import** naopak nahraje `recepty.json` do lokálních úprav.
- Přidání nového receptu ručně tlačítkem *Nový recept*

## Přidání receptu z linku (malá spotřeba tokenů)
```bash
python3 tools/import_recipe.py "https://example.cz/recept"          # výpis JSON
python3 tools/import_recipe.py "https://example.cz/recept" --append # přidá do recepty.json
```
Skript čte `schema.org/Recipe` (JSON-LD), které má většina webů s recepty.
AI pak kontroluje jen výsledný záznam. Když web JSON-LD nemá, skript to oznámí
a recept je potřeba vytáhnout ručně / krátkým AI výtahem, nebo doplnit v editoru.

Video odkazy: postup zatím není automaticky přepisován - u videa se počítá
s receptem v popisu, jinak s ručním doplněním v editoru.

## Soubory
- `index.html`, `app.js`, `style.css` - aplikace
- `recepty.json` - data (strukturované suroviny: amount / unit / name / normalized / note / scalable)
- `manifest.json`, `sw.js` - PWA / offline cache
- `tools/import_recipe.py` - import z webu (jen standardní knihovna Pythonu)

## Lokální spuštění
```bash
cd kucharka && python3 -m http.server 8000
# otevřít http://localhost:8000
```
Přes `file://` nemusí fungovat načtení `recepty.json` (omezení prohlížeče).

## Zveřejnění
Stejně jako Pokémon databáze: nahrát do repozitáře na GitHubu a zapnout GitHub Pages.
Zatím **není zveřejněno** - čeká na výslovný příkaz.
