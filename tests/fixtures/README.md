# Fixtures: catalog.json / config.json

These fixtures back the hermetic rewrite of `tests/lamina_search.test.js` and
`tests/paint_search.test.js`. They are a small, hand-curated subset of the real
Supabase `productos`, `presupuesto_config`, and `tazas` tables -- not a full
mirror. Each row's `_origen` field names the exact test(s) it exists for. An
unused or unexplained row would show up here as a mismatch between `_origen`
and the current test suite.

## Drift detector

These fixtures are frozen snapshots. They will silently drift from the real
catalog over time (price changes, discontinued products, renamed brands).
`npm run test:live` is the detector: it exercises the same matcher
(`scratch_live/live_buscar.js`) against the real, credentialed Supabase
instance. If the hermetic suite (`npm test`) passes but `npm run test:live`
starts failing on assertions this file's rows were built to satisfy, the
fixtures have drifted from production and `catalog.json`/`config.json` need
regenerating.

## Regenerating `catalog.json`

Run this query against the real Supabase project (e.g. via the SQL editor or
`supabase db query`) and hand-pick/scrub the rows that satisfy the assertions
in `tests/lamina_search.test.js` and `tests/paint_search.test.js`:

```sql
select codigo_interno, descripcion, precio_venta, existencia
from productos
where descripcion ilike '%lamina%'
   or descripcion ilike '%pintura%'
order by existencia desc nulls last
limit 200;
```

Pick the smallest set of rows that keeps every existing assertion passing,
add an `_origen` string to each row naming the test(s) it supports, and
verify with:

```bash
node --test "tests/**/*.test.js"
```

## Regenerating `config.json`

```sql
select markup_porcentaje from presupuesto_config where id = 1;
select bcv_usd from tazas where nombre = 'actual';
```

These are pinned deliberately so `precio_bs_texto`/`precio_divisas_texto`
stay deterministic across test runs; the hermetic suite does not assert on
their exact values, only on `nombre`/`disponible`/`encontrados`.
