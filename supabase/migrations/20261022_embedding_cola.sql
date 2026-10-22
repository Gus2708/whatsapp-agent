-- Queue of products whose embedding must be (re)generated.
-- Filled by a trigger on productos; drained by the Edge Function embed-productos,
-- which pg_cron calls every minute (see 20261022_embedding_cron.sql).
--
-- Why a queue and not a Database Webhook per row: sync.py upserts in batches of 1000,
-- so a webhook would fire on every stock/price UPDATE, and pg_net is fire-and-forget,
-- so a failed call would lose the event. The queue keeps the work until it is done.

create table if not exists public.embedding_cola (
  codigo_interno text primary key,
  encolado_en    timestamptz not null default now(),
  intentos       int not null default 0,
  ultimo_error   text
);

-- Only service_role (the worker) touches it.
alter table public.embedding_cola enable row level security;

create or replace function public.encolar_embedding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.descripcion), '') = '' then
    return new;
  end if;
  -- A new change resets the attempt counter: the text to embed is different now.
  insert into public.embedding_cola (codigo_interno)
  values (new.codigo_interno)
  on conflict (codigo_interno)
  do update set encolado_en = now(), intentos = 0, ultimo_error = null;
  return new;
end;
$$;

-- Two triggers because a WHEN clause cannot reference OLD on INSERT.
-- UPDATE OF descripcion fires even when the value did not change (sync.py rewrites the
-- whole row), so the update trigger compares OLD and NEW.
drop trigger if exists trg_productos_encolar_embedding_ins on public.productos;
create trigger trg_productos_encolar_embedding_ins
after insert on public.productos
for each row
execute function public.encolar_embedding();

drop trigger if exists trg_productos_encolar_embedding_upd on public.productos;
create trigger trg_productos_encolar_embedding_upd
after update of descripcion on public.productos
for each row
when (old.descripcion is distinct from new.descripcion)
execute function public.encolar_embedding();

-- Backfill: anything already in the catalog without a vector.
insert into public.embedding_cola (codigo_interno)
select p.codigo_interno
from public.productos p
where coalesce(trim(p.descripcion), '') <> ''
  and not exists (
    select 1 from public.productos_embedding e where e.codigo_interno = p.codigo_interno
  )
on conflict do nothing;
