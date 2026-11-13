-- SBWPC membership and donation system: foundation
-- Tables, access rules and audit log. Run once in the Supabase SQL editor.
-- Access model:
--   anon (the public browser key): no access to any table.
--   authenticated: only people listed in public.admins, and only after
--     passing the two-factor step (JWT aal = aal2).
--   service_role (server functions only): full access, used by the
--     payment and reminder functions in later stages.

create extension if not exists citext with schema extensions;

-- ---------- helpers ----------
create or replace function public.today_pt() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

create table public.admins (
  email extensions.citext primary key,
  role text not null default 'admin' check (role in ('admin', 'treasurer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Signed in, on the admin list, and passed two-factor
create or replace function public.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select a.role
  from public.admins a
  where a.active
    and lower(a.email::text) = lower((select auth.jwt()) ->> 'email')
    and ((select auth.jwt()) ->> 'aal') = 'aal2'
$$;
create or replace function public.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select public.staff_role() is not null
$$;
create or replace function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.staff_role() = 'admin', false)
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- core tables ----------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email extensions.citext,
  phone text,
  address1 text,
  address2 text,
  city text,
  state text,
  zip text,
  occupation text,
  employer text,
  email_opt_in boolean not null default false,
  notes text,
  source text not null default 'web' check (source in ('web', 'import', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_email_idx on public.people (email);
create index people_name_idx on public.people (last_name, first_name);

create table public.recurring_plans (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  kind text not null check (kind in ('dues', 'donation')),
  amount_cents integer not null check (amount_cents > 0),
  frequency text not null check (frequency in ('monthly', 'yearly')),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'cancelled', 'failed')),
  paypal_subscription_id text unique,
  started_on date,
  next_charge_on date,
  cancelled_on date,
  manage_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_plans_person_idx on public.recurring_plans (person_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  level text not null check (level in ('Friend', 'Advocate', 'Feminist Household', 'Access', 'Voice', 'Power', 'Feminist Champion', 'Legacy')),
  state text not null default 'pending' check (state in ('pending', 'active', 'cancelled')),
  starts_on date,
  expires_on date,
  auto_renew boolean not null default false,
  recurring_plan_id uuid references public.recurring_plans (id) on delete set null,
  household_name text,
  committees text[] not null default '{}',
  referred_by text,
  renew_token uuid not null unique default gen_random_uuid(),
  source text not null default 'web' check (source in ('web', 'import', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memberships_person_idx on public.memberships (person_id);
create index memberships_expires_idx on public.memberships (expires_on);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  membership_id uuid references public.memberships (id) on delete set null,
  recurring_plan_id uuid references public.recurring_plans (id) on delete set null,
  kind text not null check (kind in ('dues', 'donation')),
  amount_cents integer not null check (amount_cents > 0),
  paid_on date not null default public.today_pt(),
  method text not null check (method in ('paypal', 'apple_pay', 'card', 'check', 'cash', 'other')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'refunded', 'failed')),
  paypal_order_id text,
  paypal_capture_id text unique,
  in_honor_of text,
  note text,
  source text not null default 'web' check (source in ('web', 'import', 'manual')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_person_idx on public.payments (person_id);
create index payments_paid_on_idx on public.payments (paid_on);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  kind text not null check (kind in ('30_day', '7_day', 'day_of', 'lapsed_14', 'pre_charge', 'manual')),
  cycle_expires_on date not null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error text
);
-- Each automatic reminder goes out once per membership cycle
create unique index reminders_once_idx on public.reminders (membership_id, kind, cycle_expires_on) where kind <> 'manual';

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

-- ---------- triggers ----------
create trigger people_touch before update on public.people for each row execute function public.touch_updated_at();
create trigger memberships_touch before update on public.memberships for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();
create trigger recurring_plans_touch before update on public.recurring_plans for each row execute function public.touch_updated_at();

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who text := coalesce((select auth.jwt()) ->> 'email', 'system');
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
begin
  -- Tokens are secrets: keep them out of the log
  old_row := old_row - 'renew_token' - 'manage_token';
  new_row := new_row - 'renew_token' - 'manage_token';
  insert into public.audit_log (actor, action, table_name, row_id, before, after)
  values (who, lower(tg_op), tg_table_name, coalesce(new_row ->> 'id', old_row ->> 'id', new_row ->> 'email', old_row ->> 'email'), old_row, new_row);
  return coalesce(new, old);
end $$;

create trigger people_audit after insert or update or delete on public.people for each row execute function public.write_audit();
create trigger memberships_audit after insert or update or delete on public.memberships for each row execute function public.write_audit();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.write_audit();
create trigger recurring_plans_audit after insert or update or delete on public.recurring_plans for each row execute function public.write_audit();
create trigger admins_audit after insert or update or delete on public.admins for each row execute function public.write_audit();

-- ---------- views ----------
-- Membership with its live status
create view public.membership_status with (security_invoker = true) as
select
  m.*,
  case
    when m.state = 'cancelled' then 'cancelled'
    when m.state = 'pending' or m.expires_on is null then 'pending'
    when m.expires_on < public.today_pt() then 'expired'
    when m.expires_on <= public.today_pt() + 30 then 'expiring_soon'
    else 'active'
  end as status,
  m.expires_on - public.today_pt() as days_left
from public.memberships m;

-- Calendar-year totals per person, for the $100 FPPC reporting threshold
create view public.contributor_totals with (security_invoker = true) as
select
  p.person_id,
  extract(year from p.paid_on)::int as year,
  sum(p.amount_cents) as total_cents,
  count(*) as payment_count,
  sum(p.amount_cents) >= 10000 as reportable
from public.payments p
where p.status = 'completed'
group by p.person_id, extract(year from p.paid_on);

-- ---------- row level security ----------
alter table public.admins enable row level security;
alter table public.people enable row level security;
alter table public.memberships enable row level security;
alter table public.payments enable row level security;
alter table public.recurring_plans enable row level security;
alter table public.reminders enable row level security;
alter table public.audit_log enable row level security;

-- Staff (admin or treasurer, two-factor passed) can read
create policy staff_read on public.admins for select to authenticated using (public.is_staff());
create policy staff_read on public.people for select to authenticated using (public.is_staff());
create policy staff_read on public.memberships for select to authenticated using (public.is_staff());
create policy staff_read on public.payments for select to authenticated using (public.is_staff());
create policy staff_read on public.recurring_plans for select to authenticated using (public.is_staff());
create policy staff_read on public.reminders for select to authenticated using (public.is_staff());
create policy staff_read on public.audit_log for select to authenticated using (public.is_staff());

-- Only admins can change records
create policy admin_insert on public.people for insert to authenticated with check (public.is_admin());
create policy admin_update on public.people for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete on public.people for delete to authenticated using (public.is_admin());
create policy admin_insert on public.memberships for insert to authenticated with check (public.is_admin());
create policy admin_update on public.memberships for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete on public.memberships for delete to authenticated using (public.is_admin());
create policy admin_insert on public.payments for insert to authenticated with check (public.is_admin());
create policy admin_update on public.payments for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_insert on public.recurring_plans for insert to authenticated with check (public.is_admin());
create policy admin_update on public.recurring_plans for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_insert on public.reminders for insert to authenticated with check (public.is_admin());
-- Payments, reminders and the audit log are never deleted from the admin screen.
-- The admin list itself is changed only from the Supabase dashboard.

-- ---------- grants ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated, service_role;
grant select on public.admins, public.reminders, public.audit_log, public.membership_status, public.contributor_totals to authenticated;
grant select, insert, update, delete on public.people, public.memberships to authenticated;
grant select, insert, update on public.payments, public.recurring_plans to authenticated;
grant insert on public.reminders to authenticated;
grant execute on function public.staff_role(), public.is_staff(), public.is_admin(), public.today_pt() to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------- first admins ----------
insert into public.admins (email, role) values
  ('info@sbwpc.org', 'admin'),
  ('luke@coolhandlook.com', 'admin');
