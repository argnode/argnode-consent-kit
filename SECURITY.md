# Security policy

## Report a vulnerability

Do not report a security problem in a public issue.

Send it by email to **robot@argnode.com**. You can also use GitHub's private report: open the **Security** tab of this repository and select **Report a vulnerability**. Only the maintainers see either one.

Tell us:

- What the problem is and what an attacker can do with it.
- The steps to reproduce it, and the version of ACK (the first line of `ack.js`).
- If the problem needs a special setting in `settings.json` or `cookies.json`.

We reply within 5 working days. When the fix is released, we credit you in the changelog, if you want.

## Supported versions

Only the latest release gets security fixes. Update with `git pull`.

## Scope

In scope: `ack.js`, `ack.css` and the default files in this repository. For example: a way to run script in the page through the banner or the policy, a way to set consent without a choice, or a tag that can run before consent.

Out of scope: your own `settings.json`, `cookies.json`, `custom.css` and texts, and the tags that your site loads after consent.
