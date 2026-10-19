# Changelog

## 0.5.1 (19.10.2026)

- The default attribution text is "Powered by Argnode", with a capital A.
- README: why ACK, feature list, screenshots and a prompt that lets an AI assistant make your settings, cookie list and CSS.
- The repository is public at github.com/argnode/argnode-consent-kit.

## 0.5.0 (19.10.2026)

- `banner.exemptPaths`: pages that open without the banner when there is no consent yet, for example the cookie policy and privacy policy. Consent stays denied and nothing is stored. Path only, exact match.

## 0.4.0 (11.10.2026)

- No user ID or CRM code in the tool. A site connects its own systems with `window.ackOptions`, set before `ack.js` loads: `consent` (a preset choice, or a Promise for one), `consentTimeoutMs`, `hideCategories`, `beforeCategoryEvents(record)`.
- A first-party cookie is deleted only when no granted category lists it. This runs on every consent apply, page load included.
- The stored record carries `t`, a hash of the banner texts the visitor saw.
- External consent rewrites the cookie only when the choice changed.
- Texts: cookies hold information; we use them to count (EN, FI).

## 0.3.0

- Experimental extension loader and identity categories. Removed again in 0.4.0.

## 0.2.0

- Button order: the default action is always bottom right (Choose cookies; Reject all | Accept all; Save my choices).
- `banner.attribution`: `text` (default), `logo` or `none`. Wordmarks in `assets/`. No UTM tags on argnode.com itself.
- The banner widens when the categories are open. No focus ring on the title.

## 0.1.0

- First version: Google Consent Mode v2, GTM and gtag loader, bot skip, site file then sample file loading, consent version hash, external (dataLayer) consent, main-domain cookie, Cookie Information compatible category events (never twice per page view), withdrawal deletes first-party cookies, modal banner (Escape does nothing), policy renderer (`[data-ack-policy]`), `ack.*` API. Works under a strict CSP.
