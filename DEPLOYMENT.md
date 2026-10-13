# ART Giants PWA – deployment checklist

## Upload to GitHub

Upload the contents of this folder to the root of the `ART-Giants-Training`
repository. Keep `config.js` in the root. The final structure must be:

```text
index.html
config.js
manifest.webmanifest
service-worker.js
team-member-permissions.sql
training-schedule-v15.sql
training-profile-v16.sql
training-controls-v17.sql
game-stats-v19.sql
game-rsvp-v20.sql
apple-touch-icon.png
apple-touch-icon-precomposed.png
apple-touch-icon-v8.png
assets/
  art-giants-logo.png
  favicon-32.png
  apple-touch-icon.png
  art-giants-icon-192.png
  art-giants-icon-512.png
  art-giants-maskable-512.png
  basketball-admin-v9.png
  basketball-trainer-v9.png
  basketball-parent-v9.png
```

In GitHub, open **Settings → Pages** and use **Deploy from a branch**, branch
`main`, folder `/ (root)`. After deployment, make sure **Enforce HTTPS** is on.

## Configure Supabase Auth

In **Authentication → URL Configuration** set the production Site URL to:

```text
https://suehao-pages.github.io/ART-Giants-Training/
```

Add these Redirect URLs:

```text
https://suehao-pages.github.io/ART-Giants-Training/
https://suehao-pages.github.io/ART-Giants-Training/index.html
```

If a custom domain is added later, also add its exact HTTPS URL, for example:

```text
https://app.vereinflow.de/
```

## Activate the real Team & Spieler list

In **Supabase → SQL Editor**, open `team-member-permissions.sql` from this
package and run it once. The database enforces the visibility rules:

- Admin: all registered accounts
- Trainer: parent/player accounts only; no admins or other trainers
- Parent/player: no access to the list

The web app also hides the menu item for parent/player accounts, but the SQL
function is the authoritative security boundary.

## Activate editable training schedules

In **Supabase → SQL Editor**, open `training-schedule-v15.sql` from this
package and run the complete file once. It enables the date-range input,
stores generated practices in Supabase, assigns the editing account as coach,
and installs the official NRW school-holiday breaks used to skip practices.

After that, run `training-profile-v16.sql` once. It adds confirmed bulk
corrections, safe player profile cards, shared profile photos and the contact
privacy boundary. Input mode then creates only missing dates; existing dates
can be changed only through the correction workflow and its confirmation.

Finally, run `training-controls-v17.sql` once. It installs the protected
clear-all function used by the schedule manager. The database checks the
signed-in role itself, so only trainer and admin accounts can delete the U10-3
practice schedule and its linked attendance records.

Then run `game-stats-v19.sql` once. It adds shot attempts and made shots to
the existing game-statistics table and installs the protected game-attendance
directory used for synchronized player photos. The directory exposes only the
player name, photo and response; contact information continues to be returned
only by the existing trainer/admin privacy function.

Finally, run `game-rsvp-v20.sql` once. It removes the Maybe response from the
new game workflow and returns absence reasons only to trainer/admin accounts.
Parent and player accounts receive no absence-reason field from the database.

## Install and update

- Android: open the site in Chrome and choose **App installieren**.
- iPhone: open the site in Safari, tap **Teilen**, then
  **Zum Home-Bildschirm** and enable **Als Web-App öffnen**.
- iOS caches home-screen icons separately from Safari. After deploying v8,
  delete the existing home-screen app and add it again. The new
  `apple-touch-icon-v8.png` filename forces iOS to request the corrected icon.
- v10 adds adaptive iOS top/bottom safe-area handling for notched and
  Dynamic Island iPhones, in both portrait and landscape.
- v11 extends the Statistik header colour behind the iOS status bar, fills the
  bottom safe-area behind the navigation, and updates the Spiele controls and
  result icons.
- v12 fixes the iOS bottom navigation on unusual logical viewport widths: the
  desktop offset now applies only to mouse devices, the duplicate standalone
  safe-area layer is removed, and WebKit standalone mode is pinned to the
  visible screen while preserving the Home Indicator inset.
- v13 replaces model-specific viewport workarounds with one responsive mobile
  layout. Touch devices always use the full available width, the document owns
  vertical scrolling, and the navigation is fixed only to the real viewport.
  Desktop centring is now limited to devices with a precise mouse pointer.
- v14 makes the practice calendar fully dynamic: the collapsed view follows
  the current Berlin week, the expanded header is correctly aligned, month
  navigation works in both directions, and practice dates open their matching
  detail screen.
- v15 adds real single-practice editing and date-range schedule input for
  coaches/admins. Generated practices are saved as drafts, appear immediately
  in the calendar and home list, and registered NRW school holidays are
  skipped automatically.
- v16 separates schedule input from schedule correction, requires a warning
  confirmation before corrections, limits the home list to the current week,
  removes separate holiday notice cards, and adds clickable privacy-aware
  player cards with synchronized profile photos and age calculated from date
  of birth.
- v17 removes operating-system-localized date controls, adds a protected
  clear-all schedule action with a destructive confirmation, uses role-based
  home messages, removes the old subtitle, and slightly enlarges bottom
  navigation icons and labels.
- v18 shortens status and action labels, removes preloaded training examples,
  disables edit/delete actions when no practice records exist, and formats
  date fields automatically while the user enters digits.
- v19 replaces the old withdrawal wording with Cancel/Stornieren, shows
  clickable synchronized player photos in game attendance, refreshes the
  profile header, and adds dropdown-based click entry for points, shots,
  shooting percentage, assists and blocks with per-game average comparisons.
- v20 restores native root-page scrolling for Xiaomi/Android browsers, uses
  two dot-based game responses, requires a private reason when a player cannot
  attend, adds address-copy controls, and labels every route action Google Maps.
- v21 targets Chrome-installed Android apps specifically: the installed app
  gets one explicit full-height vertical scroll container, while ordinary
  Chrome tabs and iOS keep their existing document-scrolling behavior.
- When `service-worker.js` changes later, increment `CACHE_NAME` so old static
  assets are removed on activation.
