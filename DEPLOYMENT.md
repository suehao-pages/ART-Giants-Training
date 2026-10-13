# ART Giants PWA – deployment checklist

## Upload to GitHub

Upload the contents of this folder to the root of the `ART-Giants-Training`
repository. Keep `config.js` in the root. The final structure must be:

```text
index.html
config.js
manifest.webmanifest
service-worker.js
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

No database, Storage or RLS change is required merely to enable the PWA.

## Install and update

- Android: open the site in Chrome and choose **App installieren**.
- iPhone: open the site in Safari, tap **Teilen**, then
  **Zum Home-Bildschirm** and enable **Als Web-App öffnen**.
- When `service-worker.js` changes later, increment `CACHE_NAME` so old static
  assets are removed on activation.
