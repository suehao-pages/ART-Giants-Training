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

## Install and update

- Android: open the site in Chrome and choose **App installieren**.
- iPhone: open the site in Safari, tap **Teilen**, then
  **Zum Home-Bildschirm** and enable **Als Web-App öffnen**.
- iOS caches home-screen icons separately from Safari. After deploying v8,
  delete the existing home-screen app and add it again. The new
  `apple-touch-icon-v8.png` filename forces iOS to request the corrected icon.
- When `service-worker.js` changes later, increment `CACHE_NAME` so old static
  assets are removed on activation.
