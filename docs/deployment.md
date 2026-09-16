# Deployment

The site is a static Astro build published to GitHub Pages.

| | |
|---|---|
| Repository | `ZiqianZheng/ziqianzheng.com` (public) |
| Build | `.github/workflows/deploy.yml` — runs on every push to `main` |
| Source | GitHub Pages "build type: workflow" (an Actions artifact, not a branch) |
| Custom domain | `www.ziqianzheng.com`, also written to `public/CNAME` |
| Registrar / DNS | GoDaddy (`ns11/ns12.domaincontrol.com`) |

Publishing is just `git push`. There is no manual upload step and no separate
`gh-pages` branch — `dist/` is gitignored and only ever exists as a build artifact.

## DNS

The apex must use A records: GoDaddy does not support ALIAS/ANAME at the apex, and
CNAME is illegal there. `www` is the canonical host; GitHub redirects the apex to it
because `www.ziqianzheng.com` is set as the Pages custom domain.

| Type | Name | Value | Purpose |
|---|---|---|---|
| CNAME | `www` | `ziqianzheng.github.io` | serves the site |
| A | `@` | `185.199.108.153` | apex → redirects to www |
| A | `@` | `185.199.109.153` | |
| A | `@` | `185.199.110.153` | |
| A | `@` | `185.199.111.153` | |

Optional IPv6 (AAAA on `@`): `2606:50c0:8000::153`, `2606:50c0:8001::153`,
`2606:50c0:8002::153`, `2606:50c0:8003::153`.

The CNAME target is the **user** host `ziqianzheng.github.io` — not the repository
name. That is correct and deliberate; GitHub routes to the right repo using the
custom domain recorded in the repo's Pages settings.

Replaced on cutover: `www` previously pointed at `ghs.googlehosted.com` (Google
Sites). Two stale `google-site-verification` TXT records remain on the apex; they
are harmless and can be deleted once Google Sites is retired for good.

## Domain verification — do not skip

GitHub Pages is vulnerable to **domain takeover** when DNS is left pointing at
GitHub but no repository claims the domain. If this repo were deleted, renamed, or
made private, or the custom domain removed — while `www` still resolved to
`ziqianzheng.github.io` — anyone could create a repository, claim
`www.ziqianzheng.com` as *their* Pages custom domain, and serve whatever they liked
on it. That is a live risk for any dangling DNS record, not a hypothetical one.

**Verifying the domain fixes this permanently.** Once verified, only this GitHub
account can attach `ziqianzheng.com` or its subdomains to Pages, regardless of what
happens to the repository.

To verify: <https://github.com/settings/pages> → *Add a domain* → enter
`ziqianzheng.com` → GitHub issues a TXT record named
`_github-pages-challenge-ziqianzheng` → add it at GoDaddy → *Verify*. There is no
REST API for this on personal accounts; it is a UI-only flow.

Check it took:

```sh
dig +short @1.1.1.1 _github-pages-challenge-ziqianzheng.ziqianzheng.com TXT
```

## HTTPS

Live, via Let's Encrypt, covering both `www.ziqianzheng.com` and the apex. GitHub
renews it automatically. `https_enforced` is on, so `http://` 301s to `https://`
and the apex 301s to `www`.

### If a certificate ever fails to appear — read this first

**GitHub requests a certificate only when the custom domain is saved *and*
validates at that moment, and it never retries on its own.**

That is a trap when DNS and the domain are configured close together: if the
domain is saved before DNS has propagated to GitHub's own resolvers, validation
fails, no certificate is requested, and the situation never repairs itself — even
once DNS becomes correct and GitHub's health check goes fully green. It cost
about five hours here.

The symptom is specific: `gh api repos/.../pages` shows **no `https_certificate`
key at all** — not pending, not errored, absent — while
`gh api repos/.../pages/health` reports `is_valid: true` and
`is_https_eligible: true`. Eligible but never requested.

Neither of these re-triggers it, so don't bother:

- re-`PUT`ting the same `cname` (no change, so nothing happens);
- a fresh deployment, even though the artifact contains `CNAME`.

What works is genuinely removing and re-adding the domain, easiest in the UI at
*Settings → Pages → Custom domain*: clear the field, **Save**, re-enter it,
**Save**. The certificate appeared within a minute.

Then enforce HTTPS:

```sh
gh api -X PUT repos/ZiqianZheng/ziqianzheng.com/pages -F https_enforced=true
```

## Checking a deploy

```sh
gh run list --limit 5                  # recent builds
gh run watch                           # follow the current one
gh api repos/ZiqianZheng/ziqianzheng.com/pages \
  --jq '{cname, status, https_enforced}'
```

To roll back, revert the offending commit and push — the workflow redeploys from
whatever `main` currently is. There is no separate rollback mechanism.

## Access control

Anyone who can push to `main` can change the live site, and anyone who controls the
GoDaddy account can repoint the domain. So the site is exactly as secure as those
two accounts:

- Two-factor authentication on **both** GitHub and GoDaddy.
- Keep the registrar lock enabled at GoDaddy (blocks unauthorised transfers).
- Add no collaborators to the repository. Public visibility means anyone can *read*
  the code — that is required for Pages on a free plan — but only the owner can push.
- Consider a branch protection rule on `main` if collaborators are ever added.

## Known warnings

Workflow runs show a Node 20 deprecation notice for `actions/checkout@v4`,
`setup-node@v4`, `upload-artifact@v4` and `deploy-pages@v4`. GitHub already forces
those onto Node 24 and the builds succeed; it clears itself when those actions
publish v5. No action needed.
