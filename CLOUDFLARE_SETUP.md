# Search Studio — Cloudflare private report uploads

## What is included
- Existing dashboard design and Google Search Console JSON workflow retained.
- New **Upload Reports** tab accepts CSV, XLSX and XLS files (10 MB maximum).
- Cloudflare Pages Function at `/api/admin/reports` saves raw uploads to private R2 and lists historical uploads.
- Server verifies Cloudflare Access JWT cryptographically, including issuer, signature, expiration and application AUD.
- **This first version stores files and lists upload history. It does not yet parse reports or update indexing/product charts.**

## Cloudflare setup
1. R2 bucket `two-crafty-gays-seo-reports` must have public access disabled.
2. Pages production R2 binding must be `SEO_REPORTS` -> `two-crafty-gays-seo-reports`.
3. Cloudflare Access self-hosted application must protect `two-crafty-gays-seo-dashboard.pages.dev/api/admin/*` and restrict users to your approved email(s).
4. In Cloudflare Pages project **Settings → Variables and Secrets**, add production text variables:
   - `ACCESS_TEAM_DOMAIN`: your Cloudflare Access team hostname, e.g. `your-team.cloudflareaccess.com` (get exact hostname from Zero Trust settings).
   - `ACCESS_AUD`: the **Application Audience (AUD) Tag** from the Access application's overview/details (not the policy ID).
5. Redeploy the Pages project after adding these variables and the binding.
6. Open your Cloudflare Pages dashboard, select **Upload Reports**, and sign in through Access when prompted. You may need to open `https://two-crafty-gays-seo-dashboard.pages.dev/api/admin/reports` directly first to establish a login session.

## Deployment
Extract the ZIP and upload its contents to your existing GitHub repository's `main` branch, retaining `.github`, `data`, `scripts`, `functions`, and `index.html`. Cloudflare Pages automatically deploys commits. Do not create a second Pages project.

## Security and behavior
- No R2 keys or credentials are exposed in the browser.
- R2 files remain private and are not accessible via public URLs.
- A signed Cloudflare Access token is verified again server-side.
- Only report metadata (name, size, upload date) is listed in the authenticated admin interface.
- CSV/XLS/XLSX file extensions are checked, but file contents are not yet parsed or virus scanned; only trusted administrators should upload files.
- Existing indexing and product-feed charts remain historical until the next parsing/integration phase.
- The `data/search_console.json` file in this public GitHub repository is still publicly accessible.
