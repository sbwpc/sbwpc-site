-- SBWPC membership system: sign in from the Sanity Studio instead of password plus two-factor.
-- Replaces the access check in staff_role(). Run once in the Supabase SQL editor,
-- AFTER the studio-login function and the new /admin page are live.
--
-- Old rule: signed in, on the admin list, and passed two-factor (aal2).
-- New rule: signed in, on the admin list, and the sign-in came through the Studio.
--   The studio-login server function checks the person's Sanity session, then writes
--   app_metadata.studio_login_at (seconds since 1970) on their account before it
--   issues the sign-in. Only the server can write app_metadata, so a password alone
--   (or an email link) cannot open the member data. The mark counts for 8 hours.
--
-- Two-factor devices already set up are left alone and simply no longer used.

create or replace function public.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select a.role
  from public.admins a
  where a.active
    and lower(a.email::text) = lower((select auth.jwt()) ->> 'email')
    and coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'studio_login_at')::bigint, 0)
        > extract(epoch from now())::bigint - 8 * 3600
$$;
