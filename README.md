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

This repo now includes GitHub Actions auto-deploy to Hostinger on every push to `main`.

### 1. Add GitHub repository secrets

In GitHub, open `Settings -> Secrets and variables -> Actions` and add:

- `HOSTINGER_HOST`: the FTP IP or SFTP host from Hostinger
  Use only the bare hostname or IP, for example `123.123.123.123`.
  Do not include `sftp://`, `ftp://`, a username prefix, port, or any path.
- `HOSTINGER_USERNAME`: your Hostinger FTP/SSH username
- `HOSTINGER_PASSWORD`: your Hostinger FTP/SSH password
- `HOSTINGER_SERVER_DIR`: optional remote folder, defaults to `public_html`
- `HOSTINGER_PROTOCOL`: optional, defaults to `sftp`
- `HOSTINGER_PORT`: optional, defaults to `65002` for `sftp`, otherwise `21`

`sftp` is the recommended protocol on Hostinger plans with SSH access.

### 2. Push to GitHub

The workflow at [.github/workflows/deploy-hostinger.yml](.github/workflows/deploy-hostinger.yml) will:

1. install dependencies with `npm ci`
2. build the Vite app
3. sync `dist/` to your Hostinger directory

### 3. First-time Hostinger setup

- Make sure the target site is a regular hosting target where file sync to `public_html` is expected.
- If you are publishing or reconnecting the GitHub repo in Hostinger, choose the `SaaS-Pretty-Projects` organization instead of `wysRocket`.
- If your site should deploy into a subfolder, set `HOSTINGER_SERVER_DIR` to that path.

### Notes

- The workflow is triggered by pushes to `main` and by manual runs from the Actions tab.
- The deploy step uses direct file sync rather than Hostinger's archive publish flow, which is more reliable for this kind of static Vite build.
