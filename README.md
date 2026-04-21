<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0e73c385-eb8b-44ad-8d0b-940e22df006d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Auto Deploy To Hostinger

The repo deploys to Hostinger from GitHub Actions on pushes to `main`.

Add these GitHub Actions secrets in `Settings -> Secrets and variables -> Actions`:

- `HOSTINGER_HOST`: only the bare FTP/SFTP hostname or IP
- `HOSTINGER_USERNAME`: your Hostinger FTP or SSH username
- `HOSTINGER_PASSWORD`: your Hostinger FTP or SSH password
- `HOSTINGER_SERVER_DIR`: optional, defaults to `public_html`
- `HOSTINGER_PROTOCOL`: optional, defaults to `sftp`
- `HOSTINGER_PORT`: optional, defaults to `65002` for `sftp` and `21` for `ftp`

The workflow:

1. builds the Vite app
2. writes a Hostinger-compatible SPA `.htaccess` fallback
3. removes files from the previous deployed build via a manifest
4. uploads the new `dist/` contents

If you reconnect or publish this repository through a GitHub dialog, switch the target organization from `wysRocket` to `SaaS-Pretty-Projects`.
