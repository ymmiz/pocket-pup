# Pocket Pup

A private, installable money tracker for irregular income, monthly reserves, expenses, and shared bills. Data is stored only in the browser using `localStorage`.

## Run locally

```bash
npm start
```

Open `http://localhost:4173`.

Offline PWA caching is automatically disabled on `localhost` and `127.0.0.1`, so code changes appear normally during local development. Offline caching remains enabled on the deployed HTTPS site.

If a browser previously loaded an older cached build, open `http://localhost:4173/?refresh=1` once. The query creates a fresh request, loads version 1.1.0, and removes only Pocket Pup's old caches. It does not erase transactions stored in `localStorage`.

## Install on iPhone

The site must be available over HTTPS. Open the deployed URL in Safari, tap **Share**, choose **Add to Home Screen**, then tap **Add**.

## Deploy for free

This is a static site: there is no server code and no database to configure.

### Recommended: Vercel Drop

1. Visit [Vercel Drop](https://vercel.com/drop).
2. Drag this entire project folder onto the page.
3. Choose a project name and select **Deploy**.
4. Open the generated HTTPS URL in Safari on your iPhone and add it to the Home Screen.

No framework preset, build command, output directory, environment variable, or `vercel.json` file is required for this project.

### Simple option: Netlify Drop

1. Visit [Netlify Drop](https://app.netlify.com/drop).
2. Drag this entire project folder onto the page.
3. Netlify gives you an HTTPS URL.
4. Open that URL in Safari on your iPhone and add it to the Home Screen.

### GitHub Pages

1. Create a GitHub repository and upload all files in this folder.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the `main` branch and `/ (root)`, then save.
5. Open the HTTPS address shown by GitHub Pages on your iPhone.

Keep the same deployed URL when updating the app. Browser data belongs to that URL, so moving to a different domain starts with a separate empty data store.

## Data storage

Transactions, reserves, settings, and friend balances are saved as JSON in the browser's `localStorage`, under the key `pocket-pup-state-v1`. Nothing is transmitted to a backend. Export a backup from **More → Export backup** before clearing Safari website data, changing phones, or moving the app to a different URL.

## Features

- Irregular income and personal expenses
- Monthly rent, medical, and food reserves
- Home-screen reserve editor for quickly setting rent, medical, and food amounts
- Automatic reserve matching when an expense category is Rent, Medical, or Food
- Direct category buttons that avoid native dropdown selection ambiguity
- Edit and delete controls for recorded transactions
- Safe-to-spend calculation
- Equal or custom shared-bill splits
- Friend repayment tracking
- Offline PWA support
- Local JSON backup and restore
- No account, analytics, or server database

## Test

```bash
npm test
```
