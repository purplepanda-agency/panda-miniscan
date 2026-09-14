# General overview — bedrijfs-, diensten- en online-aanwezigheidssamenvatting

Je maakt een **korte, feitelijke algemene overview** van een website/bedrijf op basis van een live crawl-snapshot (meta, pagina's, JSON-LD, HTML-excerpt).

Doel: een business developer snapt direct wie dit is en wat ze doen; een tech expert ziet dezelfde feiten met scherpere formulering.

Schrijf **alle** user-facing tekst in het **Nederlands**.

---

## Outputvorm

Geef voor **elke** bullet twee formuleringen van **hetzelfde feit**:

- `business`: eenvoudige, begrijpelijke taal voor een niet-technische business developer (geen jargon tenzij nodig)
- `tech`: diepere, preciezere formulering voor een tech expert (mag termen, schema.org-types, kanalen, SEO-signalen noemen)

Return **uitsluitend** valide JSON met exact deze shape:

```json
{
  "companyInfo": [
    { "business": "...", "tech": "..." }
  ],
  "mainServices": [
    { "business": "...", "tech": "..." }
  ],
  "onlinePresence": [
    { "business": "...", "tech": "..." }
  ]
}
```

Geen markdown fences. Geen toelichting buiten de JSON.

---

## Wat erin moet

### `companyInfo` (max 3)

Wie het bedrijf is. Idealiter in deze volgorde wanneer de evidence dat toelaat:

1. **Identiteit** — officiële of zichtbare bedrijfsnaam + kernactiviteit in één zin
2. **Doelgroep / aanbodfocus** — voor wie / in welk domein (B2B/B2C, sector, productcategorie)
3. **Locatie / bereik** — alleen als duidelijk uit de site (vestiging, land, regio, meertaligheid)

Sla een slot over als de evidence ontbreekt. Liever 2 sterke bullets dan 3 vage.

### `mainServices` (max 8, liever 4–6)

Belangrijkste producten of diensten die de site écht promoot.

- Eén dienst/product per item
- Concrete namen of categorieën uit de site (navigatie, dienstenpagina's, producttitels, JSON-LD)
- Geen generieke marketingzinnen (“hoogwaardige oplossingen”, “klantgericht”, “innovatief”)
- Geen interne bedrijfswaarden of cultuurclaims tenzij dat het product ís

### `onlinePresence` (max 4)

Hoe ze online zichtbaar en vindbaar zijn, op basis van crawl-signalen:

- Rol van de site (shop, leadgen, portfolio, corporate, contenthub, …)
- Belangrijke paginatypen of funnel-stappen die in de crawl zichtbaar zijn
- Contact / conversiepad (formulier, telefoon, chat, store locator) indien zichtbaar
- Structured data / llms.txt / SEO-signalen alleen als ze in de context staan

Geen gokwerk over social media-volgers, ad spend of SEO-rankings.

---

## Schrijfregels

1. **Alleen evidence.** Baseer je uitsluitend op de aangeleverde context. Verzin geen diensten, locaties, klanten, awards, partners of kanalen.
2. **Geen filler.** Verboden: “het bedrijf positioneert zich als…”, “gericht op het bieden van…”, “een breed scala aan…”, “hoogwaardige service”. Zeg wat ze *doen*.
3. **Kort.** `business`: bij voorkeur 1 zin, max ~25 woorden. `tech`: 1–2 zinnen, max ~40 woorden. Geen alinea's.
4. **Zelfde punt.** `business` en `tech` beschrijven altijd hetzelfde feit; alleen diepte/woordkeuze verschilt.
5. **Specifiek.** Gebruik namen, productcategorieën, placenames en paginatypes uit de context wanneer beschikbaar.
6. **Twijfel = weglaten of voorzichtig.** Als iets onduidelijk is: skip of formuleer als “lijkt / lijkt gericht op…” — nooit als hard feit.
7. **Geen audit.** Dit is geen Quickscan. Geen performance-, accessibility- of CRO-bevindingen hier.
8. **Geen herhaling.** Zeg hetzelfde feit niet in companyInfo én mainServices én onlinePresence.

---

## Goede vs slechte voorbeelden

**Slecht (vaag / marketing):**
```json
{
  "business": "Het bedrijf biedt hoogwaardige digitale oplossingen voor uiteenlopende klanten.",
  "tech": "De organisatie positioneert zich als full-service provider met een focus op innovatie."
}
```

**Goed (concreet / zelfde feit):**
```json
{
  "business": "Purple Panda is een digitaal bureau dat webshops en websites bouwt voor merken.",
  "tech": "Purple Panda is een digitaal bureau; de site positioneert hen als bouwer van e-commerce en corporate websites (JSON-LD: Organization)."
}
```

**Slecht (dienst als slogan):**
```json
{ "business": "Klantgerichte service op maat", "tech": "Op maat gemaakte klanttrajecten" }
```

**Goed (dienst als aanbod):**
```json
{
  "business": "Shopify-webshops inrichten en optimaliseren",
  "tech": "Shopify e-commerce implementatie en optimalisatie (zichtbaar via shop-/productpaden en dienstenpagina's)"
}
```

---

## Interne checklist vóór output

1. Is elke bullet hard te herleiden tot meta, HTML, navigatie, JSON-LD of sample pages?
2. Zijn companyInfo / mainServices / onlinePresence niet overlappend?
3. Zijn business en tech hetzelfde feit?
4. Is er geen verzonnen detail?
5. Is de tekst kort genoeg voor een overzichtskaart (geen essay)?

---

## Website context

{{context}}
