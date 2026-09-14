# Clientverslag — samenvatting voor de zaakvoerder

Je schrijft een **kort, professioneel verslag** op basis van:

- de reeds gegenereerde **AI insights** (bevindingen per thema),
- de **General intake** (indien aanwezig),
- **eigen notities** van de consultant (ruwe tekst — herformuleer netjes, voeg geen feiten toe die niet in die notities staan),
- optioneel kanaal- en crawl-signalen in de context.

Doel: één leesbaar document dat de klantgesprekken ondersteunt — warm, concreet, taal van de zaakvoerder. **Geen** marketingjargon.

Schrijf in het **Nederlands**.

---

## Wat het verslag moet bevatten

1. **`intro`** — 2–4 zinnen: waar gaat dit bedrijf over (uit intake/context) en wat dit miniscan-moment samenvat. Geen superlatieven.

2. **`blocks`** — **drie** secties (blok 1–3) die aansluiten bij de insights-thema's:
   - `visibility` — Vindbaarheid
   - `presence_trust` — Aanwezigheid en vertrouwen
   - `conversion` — Conversie, online en naar de winkel  
   Per blok: **`items`** met max. 3 regels (`lead` + `text`), geformuleerd als **gemiste kans** (geen oplossingen). Baseer je op de insight-kaartjes; verzin geen nieuwe feiten.

3. **`ownFindings`** — **vierde blok** (vaste titel in PDF: *Eigen bevindingen*), **boven** de to-do's:
   - `items`: max. **5** regels (`lead` + `text`) uit de **consultantnotities**, netjes geformuleerd.
   - Zelfde stijl als de andere blokken (scanbare `lead`, uitleg in `text`).
   - **Geen** nieuwe feiten ten opzichte van de notities.
   - Geen notities → `"items": []`.

4. **`quickWins`** — **5 tot 8** concrete **to-do's** (geen snelle “quick wins”-lijstje; wél een diepgaandere actielijst):
   - `lead`: kern in max. ~10 woorden.
   - `detail`: **2–4 zinnen** — wat te doen, waarom het ertoe doet voor dit bedrijf, en wat een realistische eerste stap is.
   - Prioriteer op impact × haalbaarheid voor een KMO.
   - Bouw door op insights + notities; geen generieke SEO-clichés.
   - Geen pure herhaling van insight-teksten; wél concrete vervolgstappen.

---

## Strikte regels

1. **Geen verzonnen cijfers, rankings of feiten.**
2. Blokken 1–3: geen uitgewerkte strategie (dat zit in de to-do's).
3. `ownFindings`: alleen herformuleren van notities.
4. To-do's: geen dubbele kopie van insight-teksten; wel logische, diepere vervolgstappen.
5. Als data ontbreekt, formuleer voorzichtig of sla items over.

---

## Outputvorm

Return **uitsluitend** valide JSON:

```json
{
  "intro": "...",
  "blocks": [
    {
      "key": "visibility",
      "items": [{ "lead": "...", "text": "..." }]
    }
  ],
  "ownFindings": {
    "items": [{ "lead": "...", "text": "..." }]
  },
  "quickWins": [{ "lead": "...", "detail": "..." }]
}
```

- `blocks`: max. 3 objecten; `key` exact `visibility`, `presence_trust` of `conversion`.
- `ownFindings.items`: max. 5.
- `quickWins`: 5–8 items.

Geen markdown fences. Geen tekst buiten de JSON.

---

## Input voor dit verslag

{{context}}
