\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
set role service_role;
\echo '--- 1. new member joins online'
select public.record_payment('{"kind":"dues","level":"Advocate","amount_cents":4000,"first_name":"Ana","last_name":"Test","email":"Ana@Example.com","address1":"1 Main St","city":"Goleta","state":"CA","zip":"93117","occupation":"Teacher","employer":"GUSD","email_opt_in":true,"committees":["Media"],"paypal_capture_id":"CAP1","paid_on":"2026-11-12"}'::jsonb) ->> 'expires_on';
\echo '--- 2. the same PayPal payment sent twice is recorded once'
select public.record_payment('{"kind":"dues","level":"Advocate","amount_cents":4000,"email":"ana@example.com","paypal_capture_id":"CAP1"}'::jsonb) ->> 'duplicate';
select 'payments', count(*) from public.payments;
\echo '--- 3. early renewal (30 days before expiry) keeps the remaining time, no duplicate person'
select public.record_payment('{"kind":"dues","level":"Access","amount_cents":12500,"first_name":"Ana","last_name":"Test","email":"ana@example.com","address1":"9 New Rd","city":"Goleta","state":"CA","zip":"93117","paypal_capture_id":"CAP2","paid_on":"2027-10-13"}'::jsonb) ->> 'expires_on';
select 'people', count(*), 'memberships', (select count(*) from public.memberships) from public.people;
select level, starts_on, expires_on, address1 from public.memberships m join public.people p on p.id = m.person_id;
\echo '--- 4. lapsed member renews: new term starts from the payment date'
select public.record_payment('{"kind":"dues","level":"Friend","amount_cents":1600,"email":"ana@example.com","paypal_capture_id":"CAP3","paid_on":"2029-03-01"}'::jsonb) ->> 'expires_on';
select level, starts_on, expires_on from public.memberships;
\echo '--- 5. donation from the same person, then from a new person, with a subscription'
select (public.record_payment('{"kind":"donation","amount_cents":5000,"email":"ANA@example.com","paypal_capture_id":"CAP4","in_honor_of":"Someone","paid_on":"2029-03-02"}'::jsonb) ->> 'membership_id') is null;
select (public.record_payment('{"kind":"donation","amount_cents":2500,"first_name":"Bo","last_name":"Giver","email":"bo@example.com","paypal_capture_id":"CAP5","subscription_id":"I-SUB1","frequency":"monthly","paid_on":"2029-03-02"}'::jsonb) ->> 'plan_id') is not null;
select (public.record_payment('{"kind":"donation","amount_cents":2500,"email":"bo@example.com","paypal_capture_id":"CAP6","subscription_id":"I-SUB1","frequency":"monthly","paid_on":"2029-04-02"}'::jsonb) ->> 'duplicate');
select 'plans', count(*), 'people', (select count(*) from public.people), 'payments', (select count(*) from public.payments) from public.recurring_plans;
\echo '--- 6. bad input is refused'
select public.record_payment('{"kind":"dues","amount_cents":4000,"email":"x@example.com"}'::jsonb);
select public.record_payment('{"kind":"dues","level":"Gold","amount_cents":4000,"email":"x@example.com"}'::jsonb);
select public.record_payment('{"kind":"donation","amount_cents":0,"email":"x@example.com"}'::jsonb);
reset role;
\echo '--- 7. the public and non-admins cannot record payments or read checkouts'
set role anon;
select public.record_payment('{"kind":"donation","amount_cents":100,"email":"x@example.com"}'::jsonb);
select count(*) from public.checkouts;
reset role; set role authenticated;
set request.jwt.claims = '{"email":"stranger@example.com","aal":"aal2"}';
select public.record_payment('{"kind":"donation","amount_cents":100,"email":"x@example.com"}'::jsonb);
\echo '--- 8. an admin records a check for an existing person'
set request.jwt.claims = '{"email":"luke@coolhandlook.com","aal":"aal2"}';
select public.record_payment(jsonb_build_object('kind','dues','level','Voice','amount_cents',30000,'method','check','source','manual','note','Check 1042','paid_on','2029-06-01','person_id',(select id from public.people where email = 'bo@example.com'))) ->> 'expires_on';
select method, created_by, note from public.payments where method = 'check';

\echo '--- 9. a check promised on the website: nothing is recorded until an admin confirms it'
reset role; set role service_role;
insert into public.checkouts (id, kind, mode, amount_cents, payload) values ('00000000-0000-0000-0000-0000000000c1', 'dues', 'check', 6000,
  '{"level":"Feminist Household","first_name":"Cy","last_name":"Mailer","email":"cy@example.com","address1":"5 Oak","city":"Carpinteria","state":"CA","zip":"93013","household_name":"Dee Mailer","committees":["Membership"]}');
insert into public.checkouts (id, kind, mode, amount_cents, payload) values ('00000000-0000-0000-0000-0000000000c2', 'donation', 'check', 2500, '{"first_name":"No","last_name":"Show","email":"ns@example.com"}');
select 'people before', count(*) from public.people where email = 'cy@example.com';
reset role; set role authenticated;
set request.jwt.claims = '{"email":"treasurer@example.com","aal":"aal2"}';
select public.confirm_check('00000000-0000-0000-0000-0000000000c1');
set request.jwt.claims = '{"email":"luke@coolhandlook.com","aal":"aal1"}';
select public.confirm_check('00000000-0000-0000-0000-0000000000c1');
set request.jwt.claims = '{"email":"luke@coolhandlook.com","aal":"aal2"}';
select public.confirm_check('00000000-0000-0000-0000-0000000000c1', '{"paid_on":"2029-07-04","note":"Check 221"}') ->> 'expires_on';
select public.confirm_check('00000000-0000-0000-0000-0000000000c1');
select p.first_name, m.level, m.household_name, m.committees, y.method, y.amount_cents, y.note, y.created_by, c.status
  from public.people p join public.memberships m on m.person_id = p.id join public.payments y on y.person_id = p.id join public.checkouts c on c.payment_id = y.id where p.email = 'cy@example.com';
update public.checkouts set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000c2' returning status;
select public.confirm_check('00000000-0000-0000-0000-0000000000c2');
select 'audit rows for checkouts', count(*) from public.audit_log where table_name = 'checkouts';
reset role; set role anon;
select public.confirm_check('00000000-0000-0000-0000-0000000000c2');
update public.checkouts set status = 'completed';
