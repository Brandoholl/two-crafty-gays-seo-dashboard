# Search Studio — Indexing Health update

Upload these three items to the ROOT of your existing GitHub repository, preserving folder paths:

1. `index.html` (replace the existing file)
2. `functions/api/admin/indexing.js` (create this new file)
3. `package.json` (new file; Cloudflare Pages installs `fflate` during build)

Keep your existing `functions/api/admin/reports.js`, `data/`, GitHub Actions, and all other files unchanged.

Cloudflare Pages remains connected to the repository and deploys automatically after the commit. If the build reports that it cannot resolve `fflate`, use a Pages build command of `npm install` and keep the build output directory `.`.

Cloudflare Pages production must have `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and the R2 binding `SEO_REPORTS` configured. The existing Cloudflare Access application must protect `/api/admin/*` and allow your account.

Visit the dashboard, sign in through Cloudflare Access using `/api/admin/reports`, then open the Indexing Health tab and click **Refresh indexing**. The latest `.xlsx` under `reports/indexing/` is parsed privately on the server. Each new Page Indexing Excel upload automatically refreshes the indexing chart after upload; reloading the dashboard also checks the latest file.

The 404 URL-type breakdown remains a separate historical drill-down snapshot. Indexing data is only shown to signed-in viewers and is not published in static JSON.
