# Design: Attribute Integrity Guard and Water-Based Paint Normalization

## Architecture & Data Flow

```
User Query: "Pintura de agua color pink Beige"
     │
     ▼
[ 1. Normalization & Synonyms ]
     • "pintura de agua" ➔ "pintura caucho"
     • Stopwords removed: "color" stripped
     • Stemming: "pink" ➔ rosad, "beige" ➔ beige
     • Tokens: ['pintura', 'caucho', 'pink', 'beige']
     │
     ▼
[ 2. Retrieval & Drop-One Relaxation ]
     • 4 tokens: ['pintura', 'caucho', 'pink', 'beige'] ➔ 0 results
     • Drop-one evaluates modifiers: drops 'pink'
     • 3 tokens: ['pintura', 'caucho', 'beige'] ➔ 2 results (Beige Floripaint galón & cuñete)
     • Flag set: _dropped = 'pink'
     │
     ▼
[ 3. Attribute Integrity Guard (General for Any Product) ]
     • If multi-word fallback (e.g. slice(0, 2)) executes:
         - Capture dropped words: _dropped = droppedTokens.join(' ')
         - Never allow match_status: 'exact'
     • Color & Attribute Validation:
         - Compare query-specified attributes (color/dimension/material) against candidate items.
         - If specified attribute is missing in candidates:
             _out.parcial = true
             _out.match_status = 'relaxed'
             _out.action = 'confirm'
             _out.requires_confirmation = true
             _out.instruccion = Warn agent not to claim exact match
     │
     ▼
[ 4. Agent Sanitizer & Safety Output ]
     • Output routed safely through searchGuard:
         "No encontré una coincidencia exacta en color pink, pero tenemos en color Beige: ..."
```

## Detailed Component Changes

### 1. Lexical Layer (`expandir` & `SIN`)
In `lib/serrucho-search.js`, `lib/catalog-search.js`, `scratch_live/live_buscar.js`:
- Add to `SIN`:
  ```javascript
  'pintura de agua': 'pintura caucho',
  'pinturas de agua': 'pintura caucho',
  'pintura al agua': 'pintura caucho',
  'pinturas al agua': 'pintura caucho',
  'pintura base agua': 'pintura caucho',
  'pintura base de agua': 'pintura caucho',
  'a base de agua': 'caucho',
  'al agua': 'caucho'
  ```
- In `expandir(t)`:
  ```javascript
  s = s.replace(/\bpinturas?\s+(de\s+|al\s+|a\s+base\s+de\s+|base\s+)?agua\b/gi, 'pintura caucho');
  ```
- Expand `COLOR_STEM` & `CANONICAL_COLORS` with missing common paint colors and variations:
  - `pink`, `pinc` -> `rosad`
  - `lila`, `lilas` -> `lila`
  - `beig`, `beis`, `veige` -> `beige`
  - `marfil`, `durazno`, `coral`, `turquesa`

### 2. Multi-Word Fallback Guard (`largas.slice(0, 2)`)
In `scratch_live/live_buscar.js` (and synced sources):
```javascript
if (res.length === 0 && largas.length > 1) {
  const sub = largas.slice(0, 2);
  const raw = await ilike(sub, 30);
  res = casanDeVerdad(raw, sub);
  if (res.length > 0 && largas.length > 2) {
    _dropped = largas.slice(2).join(' ');
  }
}
```
If `largas.length > 2` and `largas.slice(0, 2)` succeeds:
- Ensure `_dropped` is set to the omitted tokens.
- This prevents `_out` from defaulting to `exact` / `show_results`.
- It activates `eligible: true` for downstream qualification (JEV).

### 3. Attribute Mismatch Protection
Before final decision assignment:
- If the customer query specified an explicit color (e.g. via `extractDepartmentAttributes(p_busqueda)` or `CANONICAL_COLORS`), but NONE of the returned products contain that color in their description:
  - Set `_out.parcial = true`.
  - Set `_out.instruccion` explicitly alerting the agent that the requested color is not in stock.
  - Override `match_status` to `'relaxed'` (which maps to `action: 'confirm'`).

### 4. Memory Name Ingestion Guard
In `guardar_memoria_engram_tool` (workflow code):
- Validate candidate `nombre`:
  - If `nombre` matches common product nouns, color words (e.g. `/^(?:color\s+)?(?:lila|blanco|negro|azul|rojo|verde|amarillo|beige|rosado|gris|pintura|cemento|tubo|cable|tornillo)\b/i`), or is less than 3 letters without vowels, reject as a customer name.
