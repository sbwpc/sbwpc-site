-- SBWPC membership system: online checkout and payment recording.
-- Run once in the Supabase SQL editor, after 001_foundation.sql.

-- A checkout holds the form a visitor filled in while the payment is still on its way:
-- a few seconds for PayPal and Apple Pay, or days for a check in the mail.
-- Only the server (service role) creates these. Staff can read. The public cannot.
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dues', 'donation')),
  mode text not null check (mode in ('once', 'subscription', 'check')),
  amount_cents integer not null check (amount_cents > 0),
  payload jsonb not null,
  paypal_order_id text unique,
  paypal_subscription_id text unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index checkouts_created_idx on public.checkouts (created_at);
create index checkouts_waiting_idx on public.checkouts (mode, status);
create trigger checkouts_audit after update on public.checkouts for each row execute function public.write_audit();

-- Small key and value store for server settings such as PayPal plan IDs (never secrets)
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.checkouts enable row level security;
alter table public.settings enable row level security;
create policy staff_read on public.checkouts for select to authenticated using (public.is_staff());
create policy staff_read on public.settings for select to authenticated using (public.is_staff());
-- Admins may close a checkout: mark a check as received, or cancel one that never came
create policy admin_update on public.checkouts for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.checkouts, public.settings from anon, authenticated;
grant select, update on public.checkouts to authenticated;
grant select on public.settings to authenticated;
grant all on public.checkouts, public.settings to service_role;

-- Record one payment and everything that follows from it, in a single step:
-- find or create the person, start or extend the membership, store the payment.
-- Used by the website (service role) and by admins recording a check or cash.
-- Runs with the caller's own rights, so the access rules above still apply.
create or replace function public.record_payment(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_kind text := p ->> 'kind';
  v_amount integer := (p ->> 'amount_cents')::integer;
  v_paid date := coalesce(nullif(p ->> 'paid_on', '')::date, public.today_pt());
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  v_capture text := nullif(p ->> 'paypal_capture_id', '');
  v_sub text := nullif(p ->> 'subscription_id', '');
  v_level text := nullif(p ->> 'level', '');
  v_source text := coalesce(nullif(p ->> 'source', ''), 'web');
  v_person uuid := nullif(p ->> 'person_id', '')::uuid;
  v_plan uuid;
  v_member public.memberships%rowtype;
  v_membership uuid;
  v_expires date;
  v_payment uuid;
  v_existing public.payments%rowtype;
  v_renewal boolean := false;
begin
  if v_kind not in ('dues', 'donation') then raise exception 'kind must be dues or donation'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'amount must be more than zero'; end if;
  if v_kind = 'dues' and v_level is null then raise exception 'a membership level is required for dues'; end if;

  -- The same PayPal payment is only ever recorded once
  if v_capture is not null then
    select * into v_existing from public.payments where paypal_capture_id = v_capture;
    if found then
      return jsonb_build_object('duplicate', true, 'payment_id', v_existing.id, 'person_id', v_existing.person_id,
        'membership_id', v_existing.membership_id,
        'expires_on', (select expires_on from public.memberships where id = v_existing.membership_id));
    end if;
  end if;

  -- Person: by id (admin), else by email, else new
  if v_person is null and v_email is not null then
    select id into v_person from public.people where lower(email::text) = v_email order by created_at limit 1;
  end if;
  if v_person is null then
    insert into public.people (first_name, last_name, email, phone, address1, address2, city, state, zip, occupation, employer, email_opt_in, source)
    values (coalesce(trim(p ->> 'first_name'), ''), coalesce(trim(p ->> 'last_name'), ''), v_email, nullif(trim(p ->> 'phone'), ''),
      nullif(trim(p ->> 'address1'), ''), nullif(trim(p ->> 'address2'), ''), nullif(trim(p ->> 'city'), ''), nullif(trim(p ->> 'state'), ''),
      nullif(trim(p ->> 'zip'), ''), nullif(trim(p ->> 'occupation'), ''), nullif(trim(p ->> 'employer'), ''),
      coalesce((p ->> 'email_opt_in')::boolean, false), v_source)
    returning id into v_person;
  elsif p ? 'first_name' then
    -- A returning person just gave us their current details: keep what they typed, leave blanks alone
    update public.people set
      first_name = coalesce(nullif(trim(p ->> 'first_name'), ''), first_name),
      last_name = coalesce(nullif(trim(p ->> 'last_name'), ''), last_name),
      phone = coalesce(nullif(trim(p ->> 'phone'), ''), phone),
      address1 = coalesce(nullif(trim(p ->> 'address1'), ''), address1),
      address2 = case when nullif(trim(p ->> 'address1'), '') is not null then nullif(trim(p ->> 'address2'), '') else address2 end,
      city = coalesce(nullif(trim(p ->> 'city'), ''), city),
      state = coalesce(nullif(trim(p ->> 'state'), ''), state),
      zip = coalesce(nullif(trim(p ->> 'zip'), ''), zip),
      occupation = coalesce(nullif(trim(p ->> 'occupation'), ''), occupation),
      employer = coalesce(nullif(trim(p ->> 'employer'), ''), employer),
      email_opt_in = case when p ? 'email_opt_in' then (p ->> 'email_opt_in')::boolean else email_opt_in end
    where id = v_person;
  end if;

  -- Recurring plan (PayPal subscription)
  if v_sub is not null then
    select id into v_plan from public.recurring_plans where paypal_subscription_id = v_sub;
    if v_plan is null then
      insert into public.recurring_plans (person_id, kind, amount_cents, frequency, status, paypal_subscription_id, started_on, next_charge_on)
      values (v_person, v_kind, v_amount, coalesce(nullif(p ->> 'frequency', ''), 'yearly'), 'active', v_sub, v_paid, nullif(p ->> 'next_charge_on', '')::date)
      returning id into v_plan;
    else
      update public.recurring_plans set status = 'active', amount_cents = v_amount,
        next_charge_on = coalesce(nullif(p ->> 'next_charge_on', '')::date, next_charge_on) where id = v_plan;
    end if;
  end if;

  -- Membership: extend the current one, or start a new one
  if v_kind = 'dues' then
    select * into v_member from public.memberships
      where person_id = v_person and state <> 'cancelled'
      order by expires_on desc nulls last, created_at desc limit 1 for update;
    if found then
      v_renewal := v_member.expires_on is not null;
      -- Early renewals keep their remaining time. A lapsed member starts again from the payment date.
      v_expires := (case when v_member.expires_on is not null and v_member.expires_on >= v_paid then v_member.expires_on else v_paid end + interval '1 year')::date;
      update public.memberships set
        level = v_level, state = 'active',
        starts_on = case when v_member.starts_on is null or v_member.expires_on is null or v_member.expires_on < v_paid then v_paid else starts_on end,
        expires_on = v_expires,
        auto_renew = case when v_plan is not null then true else auto_renew end,
        recurring_plan_id = coalesce(v_plan, recurring_plan_id),
        household_name = coalesce(nullif(trim(p ->> 'household_name'), ''), household_name),
        referred_by = coalesce(nullif(trim(p ->> 'referred_by'), ''), referred_by),
        committees = case when p ? 'committees' then array(select jsonb_array_elements_text(p -> 'committees')) else committees end
      where id = v_member.id;
      v_membership := v_member.id;
    else
      v_expires := (v_paid + interval '1 year')::date;
      insert into public.memberships (person_id, level, state, starts_on, expires_on, auto_renew, recurring_plan_id, household_name, committees, referred_by, source)
      values (v_person, v_level, 'active', v_paid, v_expires, v_plan is not null, v_plan, nullif(trim(p ->> 'household_name'), ''),
        coalesce(array(select jsonb_array_elements_text(p -> 'committees')), '{}'), nullif(trim(p ->> 'referred_by'), ''), v_source)
      returning id into v_membership;
    end if;
  end if;

  insert into public.payments (person_id, membership_id, recurring_plan_id, kind, amount_cents, paid_on, method, status,
    paypal_order_id, paypal_capture_id, in_honor_of, note, source, created_by)
  values (v_person, v_membership, v_plan, v_kind, v_amount, v_paid, coalesce(nullif(p ->> 'method', ''), 'paypal'), 'completed',
    nullif(p ->> 'paypal_order_id', ''), v_capture, nullif(trim(p ->> 'in_honor_of'), ''), nullif(trim(p ->> 'note'), ''), v_source,
    coalesce((select auth.jwt()) ->> 'email', nullif(p ->> 'created_by', ''), 'website'))
  returning id into v_payment;

  return jsonb_build_object('duplicate', false, 'payment_id', v_payment, 'person_id', v_person, 'membership_id', v_membership,
    'expires_on', v_expires, 'renewal', v_renewal, 'plan_id', v_plan);
end $$;

revoke all on function public.record_payment(jsonb) from public, anon;
grant execute on function public.record_payment(jsonb) to authenticated, service_role;

-- A check promised on the website has arrived. Record it and close the checkout, in one step.
-- p may carry: amount_cents (if the check differs from the pledge), paid_on, note.
create or replace function public.confirm_check(p_checkout uuid, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  c public.checkouts%rowtype;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'only an admin can confirm a check'; end if;
  select * into c from public.checkouts where id = p_checkout for update;
  if not found then raise exception 'checkout not found'; end if;
  if c.mode <> 'check' then raise exception 'this checkout is not a check'; end if;
  if c.status <> 'pending' then raise exception 'this check was already %', c.status; end if;
  r := public.record_payment(c.payload
    || jsonb_build_object('kind', c.kind, 'method', 'check', 'source', 'web',
      'amount_cents', coalesce(nullif(p ->> 'amount_cents', '')::integer, c.amount_cents),
      'paid_on', coalesce(nullif(p ->> 'paid_on', ''), public.today_pt()::text),
      'note', nullif(trim(p ->> 'note'), '')));
  update public.checkouts set status = 'completed', completed_at = now(), payment_id = (r ->> 'payment_id')::uuid where id = c.id;
  return r;
end $$;
revoke all on function public.confirm_check(uuid, jsonb) from public, anon;
grant execute on function public.confirm_check(uuid, jsonb) to authenticated;
