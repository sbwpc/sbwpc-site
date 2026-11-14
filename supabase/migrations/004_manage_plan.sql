-- SBWPC membership system: members can see and cancel their own automatic payments.
-- Run once in the Supabase SQL editor, after 003_mail.sql.
--
-- The page a member uses is reached by a private link (the plan's manage_token, which has existed since
-- 001_foundation.sql). The website looks the plan up and cancels it with PayPal on the server.
-- All this file adds is two kinds of email:
--   plan_link     the private link, sent when a member asks for it or an admin sends it
--   plan_stopped  the confirmation after a member cancels on the website

alter table public.outbox drop constraint outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check
  check (kind in ('receipt', 'check_instructions', 'staff_notice', 'reminder', 'plan_link', 'plan_stopped'));

-- Admins may also queue the manage link for a member who asks for help. Nothing else changes.
drop policy admin_insert on public.outbox;
create policy admin_insert on public.outbox for insert to authenticated
  with check (public.is_admin() and kind in ('receipt', 'reminder', 'plan_link') and status = 'queued' and attempts = 0 and to_email is null);

-- The manage link can now cancel a plan, so it is no longer shown to anyone signed in to the admin.
-- Staff still see every other detail of a plan. The website's server and the backup still see all of it.
revoke select on public.recurring_plans from authenticated;
grant select (id, person_id, kind, amount_cents, frequency, status, paypal_subscription_id, started_on, next_charge_on, cancelled_on, created_at, updated_at)
  on public.recurring_plans to authenticated;
