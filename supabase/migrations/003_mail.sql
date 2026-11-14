-- SBWPC membership system: email. Receipts, renewal reminders and notices to the SBWPC inbox.
-- Run once in the Supabase SQL editor, after 002_checkout.sql.

-- Every email the system sends, or decided not to send, is one row here. It is both the queue and the record.
-- The website and the nightly reminder job add rows. A mail job sends them through Google and marks the result.
create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('receipt', 'check_instructions', 'staff_notice', 'reminder')),
  person_id uuid references public.people (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,
  membership_id uuid references public.memberships (id) on delete cascade,
  checkout_id uuid references public.checkouts (id) on delete set null,
  data jsonb not null default '{}',
  -- Set for automatic reminders so the same one can never be queued twice for one membership year
  dedupe text unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  to_email text,
  subject text,
  error text,
  created_by text not null default coalesce(auth.jwt() ->> 'email', 'system'),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_queue_idx on public.outbox (status, created_at);
create index outbox_person_idx on public.outbox (person_id, created_at desc);

alter table public.outbox enable row level security;
create policy staff_read on public.outbox for select to authenticated using (public.is_staff());
-- Admins may queue a receipt or a reminder (for example by recording a check). They cannot edit or remove the record.
create policy admin_insert on public.outbox for insert to authenticated
  with check (public.is_admin() and kind in ('receipt', 'reminder') and status = 'queued' and attempts = 0 and to_email is null);
revoke all on public.outbox from anon, authenticated;
grant select, insert on public.outbox to authenticated;
grant all on public.outbox to service_role;

-- Same function as before, now also queueing the receipt and the notice to the SBWPC inbox,
-- and issuing a fresh renew link each time dues are paid.
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
  v_receipt boolean := coalesce(nullif(p ->> 'send_receipt', '')::boolean, true);
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
        renew_token = gen_random_uuid(),
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

  -- Queue the emails. They are sent a moment later by the mail queue, so a mail problem can never block a payment.
  if v_source <> 'import' then
    if v_receipt and exists (select 1 from public.people where id = v_person and email is not null) then
      insert into public.outbox (kind, person_id, payment_id, membership_id, data)
      values ('receipt', v_person, v_payment, v_membership, jsonb_build_object('renewal', v_renewal));
    end if;
    -- Tell the SBWPC inbox about website payments. Not needed when a signed-in admin is the one recording it.
    if v_source = 'web' and coalesce(auth.jwt() ->> 'email', '') = '' then
      insert into public.outbox (kind, person_id, payment_id, membership_id, data)
      values ('staff_notice', v_person, v_payment, v_membership, jsonb_build_object('event', case when v_kind = 'donation' then 'donation' when v_renewal then 'renewal' else 'new_member' end));
    end if;
  end if;

  return jsonb_build_object('duplicate', false, 'payment_id', v_payment, 'person_id', v_person, 'membership_id', v_membership,
    'expires_on', v_expires, 'renewal', v_renewal, 'plan_id', v_plan);
end $$;

revoke all on function public.record_payment(jsonb) from public, anon;
grant execute on function public.record_payment(jsonb) to authenticated, service_role;

-- The renew link in a reminder email carries a private token. This returns only what the Join form needs to
-- greet the member and preselect their level. The server calls it, never the browser directly.
create or replace function public.renewal_prefill(p_token uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'level', m.level, 'expires_on', m.expires_on)
  from public.memberships m join public.people p on p.id = m.person_id
  where m.renew_token = p_token and m.state <> 'cancelled'
$$;
revoke all on function public.renewal_prefill(uuid) from public, anon, authenticated;
grant execute on function public.renewal_prefill(uuid) to service_role;
