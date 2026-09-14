# General overview — intakekaders voor bedrijfsanalyse

Je vult een **korte, feitelijke intake** voor een website/bedrijf op basis van een live crawl-snapshot (meta, pagina's, JSON-LD, HTML-excerpt).

Doel: een business developer krijgt direct invulbare kaders die later als briefing dienen. Alles wat **niet hard uit de site** blijkt, blijft leeg — de gebruiker vult dat zelf aan.

Schrijf **alle** user-facing tekst in het **Nederlands**.

---

## Outputvorm

Return **uitsluitend** valide JSON met exact deze shape (alle waarden zijn strings):

```json
{
  "companyNameWebsite": "",
  "coreOffering": "",
  "pricingBrands": "",
  "locations": "",
  "searchTerms": "",
  "competitors": "",
  "rawData": ""
}
```

Geen markdown fences. Geen toelichting buiten de JSON.

---

## Wat erin moet

### `companyNameWebsite`

Officiële of zichtbare **bedrijfsnaam** + de **website-URL** (start-URL uit de context).
Voorbeeld: `Purple Panda — https://purplepanda.nl`
Alleen invullen als de naam uit de site blijkt; URL mag altijd de geanalyseerde URL zijn.

### `coreOffering`

**Kernaanbod in gewone taal**: wat verkopen / doen ze, voor wie, in één tot drie zinnen.
Alleen wat de site écht promoot (navigatie, diensten/producten, JSON-LD). Geen marketingfiller.

### `pricingBrands`

**Prijspositionering** (budget / midden / premium / luxe) **én** belangrijkste merken — **alleen** als dat duidelijk op de site staat (prijzen, merkenpagina's, producttitels, “exclusief”, “outlet”, …).
Anders: lege string `""`.

### `locations`

**Fysieke locatie(s)** en **verzorgingsgebied** — alleen als vestiging, adres, regio, land of servicegebied op de site staat.
Anders: `""`.

### `searchTerms`

**Kernzoektermen** waarop klanten waarschijnlijk zoeken (categorie, merk, lokaal), **alleen** afgeleid uit zichtbare product-/dienstnamen, merken en locaties op de site.
Geen pure gok. Twijfel = `""`. Komma-gescheiden of korte regels.

### `competitors`

Concurrenten om mee te vergelijken. Vul **alleen** in als de site zélf concurrenten noemt of vergelijkt.
Meestal: `""` — verzin geen concurrenten.

### `rawData`

Altijd `""`. Dit veld is voor handmatige notities van de gebruiker.

---

## Schrijfregels

1. **Alleen evidence.** Baseer je uitsluitend op de aangeleverde context. Verzin geen diensten, locaties, merken, concurrenten of zoektermen.
2. **Leeg > gok.** Ontbreekt hard bewijs → `""`. Liever leeg dan vaag.
3. **Geen filler.** Verboden: “hoogwaardige oplossingen”, “klantgericht”, “innovatief”, “breed scala”.
4. **Kort.** Per veld: compacte plain text (zinnen of korte opsomming). Geen HTML, geen markdown.
5. **Geen audit.** Dit is geen Quickscan. Geen performance-, accessibility- of CRO-bevindingen.

---

## Interne checklist vóór output

1. Is elk niet-leeg veld herleidbaar tot meta, HTML, navigatie, JSON-LD of sample pages?
2. Zijn `competitors` en `rawData` leeg tenzij de site concurrenten noemt / (rawData altijd leeg)?
3. Is er geen verzonnen detail?
4. Is de JSON-shape exact zoals hierboven?

---

## Website context

{{context}}
