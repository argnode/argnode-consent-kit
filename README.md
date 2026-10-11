# argnode Consent Kit

Free, open-source, self-hosted consent management platform (CMP) with native Google Consent Mode v2.

Made by [Argnode Oy](https://www.argnode.com).

Status: version 0.2. The design is in [docs/DESIGN.md](docs/DESIGN.md).

## What it does

- Shows a cookie banner with three equal choices: **Accept all**, **Reject all**, **Choose cookies**.
- Sends Google Consent Mode v2 signals. All non-necessary signals are `denied` until the visitor chooses.
- Loads Google Tag Manager or the Google tag itself, after the consent default. So no Google tag can run before consent.
- Pushes one dataLayer event for each allowed category, on every page load: `cookie_cat_functional`, `cookie_cat_statistic`, `cookie_cat_marketing`, `cookie_cat_unclassified`. These are the Cookie Information event names, so an existing GTM container works without changes. An event is never pushed twice on one page view.
- Prints your cookie policy from the same file that drives the banner.
- Asks again when your cookie list changes, and after 12 months.

## Install

1. Clone this repository into your web root:

   ```bash
   cd public_html
   git clone <repository URL> cmp
   ```

2. Block web access to the `cmp/.git/` folder. On Apache, the `.htaccess` in this repository does it. On nginx, add this to your server block:

   ```nginx
   location ~ /\.git { deny all; }
   ```

3. Copy the sample files and edit the copies:

   ```bash
   cp cmp/settings.sample.json cmp/settings.json
   cp cmp/cookies.sample.json cmp/cookies.json
   ```

   - In `settings.json`, set `loader.mode` (`gtm`, `gtag` or `none`) and your GTM or GA4 ID. Set `banner.policyUrl` to your cookie policy page.
   - In `cookies.json`, list every cookie your site uses. Change `updated` to today's date (`dd.mm.yyyy`).

4. **Remove your own GTM or Google tag snippet from your pages.** The tool loads it. If both exist, your snippet can run before the consent default.

5. Add this one line to every page, as early as possible in `<head>`:

   ```html
   <script async src="/cmp/ack.js"></script>
   ```

   The script is `async`, so the page does not wait for it. The script loads its own stylesheet. It finds its other files relative to its own address, so the folder can have any name.

6. Add a link to reopen the banner, for example in your footer:

   ```html
   <a href="#" data-ack-open>Cookie settings</a>
   ```

7. On your cookie policy page, add this element. The tool fills it with the cookie list:

   ```html
   <div data-ack-policy></div>
   ```

No inline script is necessary, so the tool works with a strict Content Security Policy (`script-src 'self'`). For GTM or GA4, add the Google hosts to your policy. Read "Content Security Policy" below.

## Update

```bash
cd public_html/cmp
git pull
```

A pull never changes your own files: `settings.json`, `cookies.json`, `custom.css` and `i18n/custom/`. They are in `.gitignore`.

If you do nothing after the clone, the tool uses the sample files. The banner works, but the cookie list is not your real list. The browser console shows a warning. Make your own `cookies.json` to be compliant.

## Keep old versions of cookies.json

**This is a compliance requirement.** Each stored consent contains a hash of the cookie list that the visitor saw. The hash is proof only if you still have the file that made it.

- Keep every version of `cookies.json`, for example in your site's own version control. Record the date each version went live.
- Keep each version for at least the date it was replaced plus `storage.maxAgeDays` (default 365 days). We recommend that you keep them always. The files contain no personal data.

This is not legal advice. Your own legal adviser sets the final period.

## Change the look

The banner works without any CSS of yours. To change it, set `"customCss": true` in `settings.json` and make `custom.css` in the same folder. Override the variables:

```css
.ack-banner, .ack-policy {
  --ack-bg: #14191b;
  --ack-fg: #edf1f1;
  --ack-button-bg: #00e676;
  --ack-button-fg: #06210f;
}
```

Accept and Reject use the same variables by default. Equal prominence is a compliance requirement. If you change one, change both.

All classes start with `ack-`. Nothing in `ack.css` targets elements outside `.ack-banner` and `.ack-policy`.

## Attribution

`settings.json` → `banner.attribution`:

| Value | Effect |
|---|---|
| `text` | A small "Powered by argnode" link under the buttons. This is the default. |
| `logo` | The argnode wordmark in the top-right corner of the banner. It is hidden on small screens. Set `attributionLogo` to `on-light` for a light banner or `on-dark` for a dark banner. |
| `none` | No attribution. |

## User ID (optional)

You can send a pseudonymous user ID (for example a CRM user ID) to Google Analytics 4 as `user_id`. The tool stores it only if the visitor allows statistics.

1. Set `"identity": { "enabled": true }` in `settings.json`.
2. List `ack_uid` in the `statistic` category of `cookies.json`.
3. To read the ID from links such as `?uid=<id>`, add `data-identity-param="uid"` to the script tag. The tool removes the parameter from the address bar before analytics loads.
4. In GTM, make a Data Layer Variable `user_id`. Set it as the `user_id` parameter of your Google tag.

Only IDs that match `identity.pattern` (default: a UUID) are used. Do not use an email address or a name as the ID. Read section B6.1 of the [design](docs/DESIGN.md) for the limits.

## Change the texts

Default texts are in `i18n/<language>.json`. Do not edit them, because a pull overwrites them. Put only the keys that you change in `i18n/custom/<language>.json`, and add the language to `customTexts` in `settings.json`:

```json
{ "customTexts": ["fi"] }
```

## Content Security Policy

For Google Analytics 4 or GTM, add these hosts to your policy:

```
script-src  'self' https://www.googletagmanager.com
connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com
img-src     'self' https://*.google-analytics.com https://www.googletagmanager.com
```

Do not add `'unsafe-inline'`. The tool does not need it.

## For developers

| Call | Effect |
|---|---|
| `ack.open()` | Open the banner with the current choices. |
| `ack.getConsent()` | Return the current consent record, or `null`. |
| `ack.on('consent', fn)` | Run `fn(record)` when the consent is set or changed. |
| `ack.renderPolicy(selector)` | Render the cookie policy into the element. |
| `ack.reset()` | Delete the consent and show the banner again. For testing. |
| `ack.version` | Hash of the current cookie list. |

When the consent is set or changed, the tool also pushes `{ event: 'ack_consent_update', ack: { v, ts, c, src } }` to the dataLayer and dispatches the DOM event `ack:consent`. Use it to store consents in your own system, for example a CRM. The tool itself has no server and no database.

To give a consent from your own system (for example a CRM for a known user), push it before `ack.js` runs:

```js
dataLayer.push({ event: 'ack_external_consent',
  ack: { v: '<hash>', c: { statistic: true, marketing: false }, ts: 1760000000 } });
```

The tool uses it only if `v` is the current hash.

Demo pages are in [examples/](examples/). Serve the repository folder with any web server and open `examples/index.html`.

## Licence

This project uses the [Mozilla Public License 2.0](LICENSE) (MPL-2.0).

- You can use, copy and change this software. You can also use it commercially. This includes setting it up for your clients.
- If you change files of this project and distribute them, you must make the changed files available under MPL-2.0.
- Do not remove the copyright and licence notices from the files.
- You can combine this software with your own code. Your own separate files can use a different licence.

The licence does not give you rights to the argnode name or logo. Read [TRADEMARKS.md](TRADEMARKS.md).

For a commercial licence without the MPL-2.0 obligations, contact Argnode Oy: https://www.argnode.com

## Disclaimer

This software is provided "as is", without warranty of any kind. It is a best-effort tool. Argnode Oy is not liable for any damage that comes from its use. This includes lost data, lost tracking data, wrong attribution, wrong ad spend and lost revenue. Read sections 6 and 7 of the [licence](LICENSE).

This software and its documentation are not legal advice. Compliance statements in this project are design goals, not guarantees. You are responsible for the legal compliance of your website, your cookie definitions, your texts and your tracking setup. Speak to a legal professional if you are not sure.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). You must accept the [Contributor License Agreement](CLA.md) before we can merge your contribution.
