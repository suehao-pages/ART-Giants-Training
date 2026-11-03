# ART Giants U10-3 – Version 1

Open `art-giants-u10-3.html` directly in a browser. Choose one of the three demo roles on the login screen to preview player/parent, trainer, and admin permissions.

## Included

- Mobile-first five-tab interface
- Training schedule before and after 6 October 2026
- Participation / cancellation flow
- Trainer confirmation, single-event editing, and series editing
- Venue list with Google Maps links
- Player profile with privacy-aware role views
- Admin/trainer approval flow for new parent registrations
- Supabase-ready SQL schema with row-level security

## Supabase connection

1. Create a Supabase project and run `supabase-schema.sql` in its SQL editor.
2. Put the Project URL and Publishable/anon key into `config.js`.
3. Run `self-registration-v24.sql` once. Parents can then register from the
   login screen; a parent profile is created automatically and stays pending
   until a trainer or administrator approves it. Trainers and administrators
   can review pending registrations from **Freigaben** on the Profile screen.
4. Promote the first admin in the SQL editor with `update public.profiles set role='admin' where id='AUTH_USER_UUID';`.
5. The sign-in, registration, approval and session restore flows are connected
   in the HTML. Existing users are preserved as approved accounts.

Never put the Supabase service-role key in the HTML. Use it only in a server-side Edge Function.

## Address note

CeC is mapped to Comenius-Gymnasium, Lütticher Straße 34, Düsseldorf. Addresses for A3, KC, Leibniz, WvS and KFS are intentionally left editable because their exact locations were not supplied.
