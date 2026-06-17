# Plan 007: Make `supabase_schema.sql` safe to run without the employee app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 1670584..HEAD -- supabase_schema.sql`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live file before proceeding; on a mismatch treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `1670584`, 2026-06-17

## Why this matters

`supabase_schema.sql` is the definitive DDL for the project. A fresh run of the
file fails with `ERROR: relation "public.profiles" does not exist` if the
employee app has not been deployed first. This leaves three tables
(`atenciones_pendientes`, `solicitudes_ayuda`, `push_subscriptions`) without
their authenticated-role RLS policies, meaning the `anon` role gets
unrestricted access to those tables.

The file has three kinds of hard dependencies on the employee app:

1. **FK `REFERENCES public.profiles(id)`** — inline in three CREATE TABLE
   statements (lines 189, 244, 313). If `profiles` doesn't exist, CREATE TABLE
   fails.
2. **`is_active_employee()` / `validate_session()`** — used in `CREATE POLICY`
   statements for the three tables (lines 212–217, 281–293, 321–322). If the
   functions don't exist, policy creation fails.

Fix: strip inline FKs from CREATE TABLE, add conditional DO $$ blocks that
add the FK constraints only when `profiles` exists; wrap authenticated-role
policies in DO $$ blocks that check for the functions before running. The file
already uses DO $$ for idempotent operations — match that pattern.

## Current state

File: `supabase_schema.sql`

### All three bare FK references (grep confirms exactly 3)

```
Line 189:  atendido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL
Line 244:  resuelto_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
Line 313:  empleado_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
```

### Bare employee policies — `atenciones_pendientes` (lines 211–217)

```sql
-- empleados activos (app): leer la cola + marcar atendido
DROP POLICY IF EXISTS "Empleados - leer atenciones" ON public.atenciones_pendientes;
CREATE POLICY "Empleados - leer atenciones" ON public.atenciones_pendientes
  FOR SELECT TO authenticated USING (is_active_employee());
DROP POLICY IF EXISTS "Empleados - actualizar atenciones" ON public.atenciones_pendientes;
CREATE POLICY "Empleados - actualizar atenciones" ON public.atenciones_pendientes
  FOR UPDATE TO authenticated USING (is_active_employee() AND validate_session())
  WITH CHECK (is_active_employee() AND validate_session());
```

### Bare employee policies — `solicitudes_ayuda` + `_items` (lines 280–293)

```sql
DROP POLICY IF EXISTS "Empleados - leer solicitudes" ON public.solicitudes_ayuda;
CREATE POLICY "Empleados - leer solicitudes" ON public.solicitudes_ayuda
  FOR SELECT TO authenticated USING (is_active_employee());
DROP POLICY IF EXISTS "Empleados - resolver solicitudes" ON public.solicitudes_ayuda;
CREATE POLICY "Empleados - resolver solicitudes" ON public.solicitudes_ayuda
  FOR UPDATE TO authenticated USING (is_active_employee() AND validate_session())
  WITH CHECK (is_active_employee() AND validate_session());
DROP POLICY IF EXISTS "Empleados - leer items" ON public.solicitudes_ayuda_items;
CREATE POLICY "Empleados - leer items" ON public.solicitudes_ayuda_items
  FOR SELECT TO authenticated USING (is_active_employee());
DROP POLICY IF EXISTS "Empleados - escribir items" ON public.solicitudes_ayuda_items;
CREATE POLICY "Empleados - escribir items" ON public.solicitudes_ayuda_items
  FOR ALL TO authenticated USING (is_active_employee() AND validate_session())
  WITH CHECK (is_active_employee() AND validate_session());
```

### Bare employee policy — `push_subscriptions` (lines 320–322)

```sql
DROP POLICY IF EXISTS "Empleados - gestionar push" ON public.push_subscriptions;
CREATE POLICY "Empleados - gestionar push" ON public.push_subscriptions
  FOR ALL TO authenticated USING (is_active_employee()) WITH CHECK (is_active_employee());
```

Repo convention: the file already uses `DO $$ BEGIN ... END $$` with exception
handling (see the Realtime publication blocks after each table). Match that pattern.

## Commands you will need

| Purpose        | Command                                                     | Expected on success         |
|----------------|-------------------------------------------------------------|-----------------------------|
| Tests          | `node --test`                                               | 10/10 pass, exit 0          |
| Sources sync   | `node scripts/check_sources_sync.js`                        | `sources in sync: OK`       |
| Count FK refs  | `grep -c "REFERENCES public.profiles" supabase_schema.sql`  | `0` (all moved to DO blocks)|

## Scope

**In scope** (the only file you should modify):
- `supabase_schema.sql`

**Out of scope** (do NOT touch):
- Any running Supabase database — this plan only edits the DDL file.
- `lib/`, `scratch_live/`, `n8n_workflow.json`, `docker-compose.yml`.

## Git workflow

- Branch: `advisor/007-schema-dependency-guards`
- Commit message: `fix(db): guard employee-app dependencies in supabase_schema.sql`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create branch

```
git checkout -b advisor/007-schema-dependency-guards
```

### Step 2: Fix `atenciones_pendientes` — remove inline FK

In the `CREATE TABLE IF NOT EXISTS public.atenciones_pendientes` block,
change:
```sql
    atendido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL
```
to:
```sql
    atendido_por uuid
```

**Verify (intermediate)**: `grep -c "REFERENCES public.profiles" supabase_schema.sql` → `2`

### Step 3: Fix `solicitudes_ayuda` — remove inline FK

In the `CREATE TABLE IF NOT EXISTS public.solicitudes_ayuda` block, change:
```sql
    resuelto_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
```
to:
```sql
    resuelto_por uuid,
```

**Verify (intermediate)**: `grep -c "REFERENCES public.profiles" supabase_schema.sql` → `1`

### Step 4: Fix `push_subscriptions` — remove inline FK

In the `CREATE TABLE IF NOT EXISTS public.push_subscriptions` block, change:
```sql
    empleado_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
```
to:
```sql
    empleado_id  uuid,
```

**Verify**: `grep -c "REFERENCES public.profiles" supabase_schema.sql` → `0` (exit 1)

### Step 5: Add conditional FK DO blocks — one per table

Insert each DO block immediately after the COMMENT ON TABLE (or CREATE TABLE
closing `;` for `push_subscriptions` which has no COMMENT ON TABLE).

**After `COMMENT ON TABLE public.atenciones_pendientes`:**
```sql
-- Clave foránea a profiles (tabla del employee-app). Se aplica solo si ya existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    BEGIN
      ALTER TABLE public.atenciones_pendientes
        ADD CONSTRAINT fk_atenciones_atendido_por
        FOREIGN KEY (atendido_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
```

**After `COMMENT ON TABLE public.solicitudes_ayuda`:**
```sql
-- Clave foránea a profiles (tabla del employee-app). Se aplica solo si ya existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    BEGIN
      ALTER TABLE public.solicitudes_ayuda
        ADD CONSTRAINT fk_solicitudes_resuelto_por
        FOREIGN KEY (resuelto_por) REFERENCES public.profiles(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
```

**After the `ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;` line
(there is no COMMENT ON TABLE for push_subscriptions, insert the DO block
before the policy DROP/CREATE lines):**
```sql
-- Clave foránea a profiles (tabla del employee-app). Se aplica solo si ya existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    BEGIN
      ALTER TABLE public.push_subscriptions
        ADD CONSTRAINT fk_push_empleado_id
        FOREIGN KEY (empleado_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
```

**Verify**: `grep -c "fk_atenciones_atendido_por\|fk_solicitudes_resuelto_por\|fk_push_empleado_id" supabase_schema.sql`
→ prints `3`

### Step 6: Wrap employee policies in function-existence DO blocks

Replace the three bare employee-policy blocks with DO $$ guards.

**For `atenciones_pendientes` (replace the 4 DROP POLICY / CREATE POLICY lines):**
```sql
-- Políticas para empleados: solo si is_active_employee() y validate_session() existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'is_active_employee')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
              WHERE n.nspname = 'public' AND p.proname = 'validate_session')
  THEN
    DROP POLICY IF EXISTS "Empleados - leer atenciones" ON public.atenciones_pendientes;
    CREATE POLICY "Empleados - leer atenciones" ON public.atenciones_pendientes
      FOR SELECT TO authenticated USING (is_active_employee());
    DROP POLICY IF EXISTS "Empleados - actualizar atenciones" ON public.atenciones_pendientes;
    CREATE POLICY "Empleados - actualizar atenciones" ON public.atenciones_pendientes
      FOR UPDATE TO authenticated USING (is_active_employee() AND validate_session())
      WITH CHECK (is_active_employee() AND validate_session());
  ELSE
    RAISE NOTICE 'Saltando políticas de empleados para atenciones_pendientes: is_active_employee() o validate_session() no existen todavía.';
  END IF;
END $$;
```

**For `solicitudes_ayuda` + `_items` (replace the 8 DROP POLICY / CREATE POLICY lines):**
```sql
-- Políticas para empleados: solo si is_active_employee() y validate_session() existen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'is_active_employee')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
              WHERE n.nspname = 'public' AND p.proname = 'validate_session')
  THEN
    DROP POLICY IF EXISTS "Empleados - leer solicitudes" ON public.solicitudes_ayuda;
    CREATE POLICY "Empleados - leer solicitudes" ON public.solicitudes_ayuda
      FOR SELECT TO authenticated USING (is_active_employee());
    DROP POLICY IF EXISTS "Empleados - resolver solicitudes" ON public.solicitudes_ayuda;
    CREATE POLICY "Empleados - resolver solicitudes" ON public.solicitudes_ayuda
      FOR UPDATE TO authenticated USING (is_active_employee() AND validate_session())
      WITH CHECK (is_active_employee() AND validate_session());
    DROP POLICY IF EXISTS "Empleados - leer items" ON public.solicitudes_ayuda_items;
    CREATE POLICY "Empleados - leer items" ON public.solicitudes_ayuda_items
      FOR SELECT TO authenticated USING (is_active_employee());
    DROP POLICY IF EXISTS "Empleados - escribir items" ON public.solicitudes_ayuda_items;
    CREATE POLICY "Empleados - escribir items" ON public.solicitudes_ayuda_items
      FOR ALL TO authenticated USING (is_active_employee() AND validate_session())
      WITH CHECK (is_active_employee() AND validate_session());
  ELSE
    RAISE NOTICE 'Saltando políticas de empleados para solicitudes_ayuda: is_active_employee() o validate_session() no existen todavía.';
  END IF;
END $$;
```

**For `push_subscriptions` (replace the 2 DROP POLICY / CREATE POLICY lines):**
```sql
-- Política para empleados: solo si is_active_employee() existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'is_active_employee')
  THEN
    DROP POLICY IF EXISTS "Empleados - gestionar push" ON public.push_subscriptions;
    CREATE POLICY "Empleados - gestionar push" ON public.push_subscriptions
      FOR ALL TO authenticated USING (is_active_employee()) WITH CHECK (is_active_employee());
  ELSE
    RAISE NOTICE 'Saltando política de empleados para push_subscriptions: is_active_employee() no existe todavía.';
  END IF;
END $$;
```

**Verify**: `grep -n "^CREATE POLICY.*is_active_employee\|^CREATE POLICY.*validate_session" supabase_schema.sql`
→ 0 bare matches (all wrapped in DO blocks).

### Step 7: Run tests and guards

**Verify**: `node --test` → 10/10 pass, exit 0

**Verify**: `node scripts/check_sources_sync.js` → `sources in sync: OK`

### Step 8: Commit

```
git add supabase_schema.sql
git commit -m "fix(db): guard employee-app dependencies in supabase_schema.sql"
```

**Verify**: `git show --stat HEAD` shows only `supabase_schema.sql` modified.

## Done criteria

ALL must hold:

- [ ] `grep -c "REFERENCES public.profiles" supabase_schema.sql` → `0`
- [ ] `grep -n "^CREATE POLICY.*is_active_employee" supabase_schema.sql` → 0 matches
- [ ] `grep -c "fk_atenciones_atendido_por" supabase_schema.sql` → `1`
- [ ] `grep -c "fk_solicitudes_resuelto_por" supabase_schema.sql` → `1`
- [ ] `grep -c "fk_push_empleado_id" supabase_schema.sql` → `1`
- [ ] `node --test` exits 0
- [ ] `node scripts/check_sources_sync.js` exits 0
- [ ] `git diff --stat HEAD~1 HEAD` shows only `supabase_schema.sql`

## STOP conditions

- `grep -c "REFERENCES public.profiles" supabase_schema.sql` is not exactly 3 before you begin.
- A step's verification fails after two attempts.
- Any file other than `supabase_schema.sql` needs to be changed to complete the plan.

## Maintenance notes

- Re-run `supabase_schema.sql` on a new Supabase project after deploying the employee app — the DO blocks will find the prerequisites and apply FKs + employee policies.
- Constraint names `fk_atenciones_atendido_por`, `fk_solicitudes_resuelto_por`,
  `fk_push_empleado_id` are used in EXCEPTION handlers; don't rename them.
- If new tables reference `profiles` or `is_active_employee()`, apply the same DO-block pattern.
