\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
-- seed as service role
set role service_role;
insert into public.people (id, first_name, last_name, email) values ('00000000-0000-0000-0000-000000000001','Test','Member','t@example.com');
insert into public.memberships (person_id, level, state, starts_on, expires_on) values
 ('00000000-0000-0000-0000-000000000001','Advocate','active', public.today_pt()-200, public.today_pt()+165),
 ('00000000-0000-0000-0000-000000000001','Friend','active', public.today_pt()-350, public.today_pt()+15),
 ('00000000-0000-0000-0000-000000000001','Friend','active', public.today_pt()-400, public.today_pt()-35);
insert into public.payments (person_id, kind, amount_cents, method) values
 ('00000000-0000-0000-0000-000000000001','dues',4000,'paypal'),('00000000-0000-0000-0000-000000000001','donation',6000,'apple_pay');
reset role;

\echo '--- 1. anon: every table must be denied'
set role anon;
select 'people', count(*) from public.people;
select 'memberships', count(*) from public.memberships;
select 'payments', count(*) from public.payments;
select 'admins', count(*) from public.admins;
select 'audit', count(*) from public.audit_log;
select 'view', count(*) from public.membership_status;
insert into public.people (first_name) values ('x');
select public.is_staff();
reset role;

\echo '--- 2. signed-in stranger with 2FA (not on admin list): sees 0 rows, cannot write'
set role authenticated;
set request.jwt.claims = '{"email":"stranger@example.com","app_metadata":{"studio_login_at":9999999999},"sub":"11111111-1111-1111-1111-111111111111"}';
select 'people', count(*) from public.people;
select 'admins', count(*) from public.admins;
insert into public.people (first_name) values ('x');
update public.people set first_name='hacked' returning id;

\echo '--- 3a. admin with password only (no Studio sign-in mark): sees 0 rows, cannot write'
set request.jwt.claims = '{"email":"info@sbwpc.org","aal":"aal1","sub":"22222222-2222-2222-2222-222222222222"}';
select 'people', count(*) from public.people;
select 'payments', count(*) from public.payments;
insert into public.people (first_name) values ('x');

\echo '--- 3b. admin with an old two-factor session (aal2, no Studio mark): sees 0 rows'
set request.jwt.claims = '{"email":"info@sbwpc.org","aal":"aal2","sub":"22222222-2222-2222-2222-222222222222"}';
select 'people', count(*) from public.people;

\echo '--- 3c. admin whose Studio sign-in mark is 9 hours old: sees 0 rows'
select set_config('request.jwt.claims', json_build_object('email','info@sbwpc.org','app_metadata',json_build_object('studio_login_at', extract(epoch from now())::bigint - 9*3600))::text, false);
select 'people', count(*) from public.people;

\echo '--- 3d. admin whose Studio sign-in mark is 7 hours old: still sees rows'
select set_config('request.jwt.claims', json_build_object('email','info@sbwpc.org','app_metadata',json_build_object('studio_login_at', extract(epoch from now())::bigint - 7*3600))::text, false);
select 'people', count(*) from public.people;

\echo '--- 3e. a user cannot give themselves the mark through user_metadata'
set request.jwt.claims = '{"email":"info@sbwpc.org","user_metadata":{"studio_login_at":9999999999},"sub":"22222222-2222-2222-2222-222222222222"}';
select 'people', count(*) from public.people;

\echo '--- 4. admin signed in from the Studio: full access; email match is case-insensitive'
set request.jwt.claims = '{"email":"Luke@CoolHandLook.com","app_metadata":{"studio_login_at":9999999999},"sub":"33333333-3333-3333-3333-333333333333"}';
select 'people', count(*) from public.people;
select level, status, days_left from public.membership_status order by expires_on desc;
select year, total_cents, reportable from public.contributor_totals;
update public.people set phone='555' where email='t@example.com' returning phone;
insert into public.people (first_name, last_name) values ('Added','ByAdmin') returning first_name;
\echo '    admin cannot delete payments or edit the audit log or admin list:'
delete from public.payments;
delete from public.audit_log;
insert into public.admins (email) values ('evil@example.com');
update public.audit_log set actor='x';
select 'audit rows', count(*), string_agg(distinct actor, ',') from public.audit_log;
select 'token in audit?', count(*) from public.audit_log where after ? 'renew_token' or before ? 'renew_token';

\echo '--- 5. treasurer with 2FA: can read, cannot write'
reset role;
insert into public.admins (email, role) values ('treasurer@example.com','treasurer');
set role authenticated;
set request.jwt.claims = '{"email":"treasurer@example.com","app_metadata":{"studio_login_at":9999999999},"sub":"44444444-4444-4444-4444-444444444444"}';
select 'people', count(*) from public.people;
update public.people set phone='999' returning id;
insert into public.payments (person_id, kind, amount_cents, method) values ('00000000-0000-0000-0000-000000000001','dues',100,'cash');

\echo '--- 6. deactivated admin: locked out'
reset role;
update public.admins set active=false where email='luke@coolhandlook.com';
set role authenticated;
set request.jwt.claims = '{"email":"luke@coolhandlook.com","app_metadata":{"studio_login_at":9999999999},"sub":"33333333-3333-3333-3333-333333333333"}';
select 'people', count(*) from public.people;

\echo '--- 7. reminders go out once per cycle'
reset role; set role service_role;
insert into public.reminders (membership_id, kind, cycle_expires_on) select id, '30_day', expires_on from public.memberships limit 1;
insert into public.reminders (membership_id, kind, cycle_expires_on) select id, '30_day', expires_on from public.memberships limit 1;

\echo '--- 8. the private manage link on a plan: hidden from everyone signed in. An admin may queue the link email, not a cancellation notice'
reset role;
update public.admins set active=true where email='luke@coolhandlook.com';
insert into public.recurring_plans (person_id, kind, amount_cents, frequency, status) select id, 'donation', 2500, 'monthly', 'active' from public.people limit 1;
set role authenticated;
set request.jwt.claims = '{"email":"luke@coolhandlook.com","app_metadata":{"studio_login_at":9999999999},"sub":"33333333-3333-3333-3333-333333333333"}';
select 'admin sees the plan', count(*), min(status) from (select id, status, amount_cents, cancelled_on from public.recurring_plans) x;
\echo '    admin cannot read the manage link (two errors expected):'
select manage_token from public.recurring_plans;
select * from public.recurring_plans;
\echo '    admin can queue the link email, not a cancellation notice (one error expected):'
insert into public.outbox (kind, person_id, data) select 'plan_link', person_id, jsonb_build_object('plan_id', id) from (select id, person_id from public.recurring_plans limit 1) x;
insert into public.outbox (kind, person_id, data) select 'plan_stopped', person_id, jsonb_build_object('plan_id', id) from (select id, person_id from public.recurring_plans limit 1) x;
set request.jwt.claims = '{"email":"treasurer@example.com","app_metadata":{"studio_login_at":9999999999},"sub":"44444444-4444-4444-4444-444444444444"}';
\echo '    treasurer cannot read the link or queue an email (two errors expected):'
select manage_token from public.recurring_plans;
insert into public.outbox (kind, person_id, data) select 'plan_link', person_id, jsonb_build_object('plan_id', id) from (select id, person_id from public.recurring_plans limit 1) x;
reset role; set role service_role;
select 'server still reads the link', count(manage_token) from public.recurring_plans;
select 'queued by admin', count(*) from public.outbox where kind = 'plan_link';
