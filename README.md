# ART Giants U10-3 – Version 1

Open `art-giants-u10-3.html` directly in a browser. Choose one of the three demo roles on the login screen to preview player/parent, trainer, and admin permissions.

## Included

- Mobile-first five-tab interface
- Training schedule before and after 6 October 2026
- Participation / cancellation flow
- Trainer confirmation, single-event editing, and series editing
- Venue list with Google Maps links
- Player profile with privacy-aware role views
- Admin account overview for at least 15 accounts
- Supabase-ready SQL schema with row-level security

## Supabase connection

1. Create a Supabase project and run `supabase-schema.sql` in its SQL editor.
2. Put the Project URL and Publishable/anon key into `config.js`.
3. Create users in Supabase Authentication. A normal parent profile is created automatically.
4. Promote the first admin in the SQL editor with `update public.profiles set role='admin' where id='AUTH_USER_UUID';`.
5. The sign-in and session restore flow is already connected in the HTML. Account invitations should later be handled by a protected Edge Function.

Never put the Supabase service-role key in the HTML. Use it only in a server-side Edge Function.

## Address note

CeC is mapped to Comenius-Gymnasium, Lütticher Straße 34, Düsseldorf. Addresses for A3, KC, Leibniz, WvS and KFS are intentionally left editable because their exact locations were not supplied.
