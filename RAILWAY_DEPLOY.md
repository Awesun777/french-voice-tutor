# Deploying to Railway

This guide walks you through deploying the French Dictionary app on Railway with your own MySQL database.

---

## Prerequisites

- A [Railway](https://railway.app) account
- Your GitHub repo connected to Railway (Awesun777/french-dictionary)
- A MySQL database (Railway provides one — see Step 2)

---

## Step 1 — Create a new Railway project

1. Go to [railway.app/new](https://railway.app/new)
2. Choose **Deploy from GitHub repo** → select `Awesun777/french-dictionary`
3. Railway will detect the `railway.toml` and use it automatically

---

## Step 2 — Add a MySQL database

1. In your Railway project, click **+ New** → **Database** → **MySQL**
2. Once provisioned, click the MySQL service → **Variables** tab
3. Copy the `DATABASE_URL` value — you'll need it in Step 3

---

## Step 3 — Set environment variables

In your Railway web service, go to **Variables** and add each of the following:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | From the Railway MySQL service (Step 2) |
| `JWT_SECRET` | Any random 32+ character string (e.g. `openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same as above |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com) |
| `GOOGLE_AI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (optional — enables Gemini extraction) |
| `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys |
| `ELEVENLABS_ANNA_AGENT_ID` | From your ElevenLabs dashboard (the Anna agent ID) |

The following Manus-platform variables are **not needed** when self-hosting and can be left blank or omitted:
`BUILT_IN_FORGE_API_KEY`, `BUILT_IN_FORGE_API_URL`, `OAUTH_SERVER_URL`, `VITE_APP_ID`, `OWNER_OPEN_ID`, `VITE_FRONTEND_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_OAUTH_PORTAL_URL`

---

## Step 4 — Configure Google OAuth redirect URI

In [Google Cloud Console](https://console.cloud.google.com):

1. Go to **APIs & Services** → **Credentials** → your OAuth 2.0 Client
2. Under **Authorised redirect URIs**, add:
   ```
   https://YOUR_RAILWAY_DOMAIN/api/auth/google/callback
   ```
   Replace `YOUR_RAILWAY_DOMAIN` with the domain Railway assigns (e.g. `french-dictionary-production.up.railway.app`)

---

## Step 5 — Run database migrations

After the first deploy, run the schema migration once to create all tables:

```bash
# In Railway → your web service → Shell tab (or via railway CLI)
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Or apply the SQL from `drizzle/migrations/` directly to your MySQL database.

---

## Step 6 — S3 / File Storage

The app uses S3 for audio and file storage. On the Manus platform this is handled automatically. When self-hosting you have two options:

**Option A — AWS S3**
Add these variables:
```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

**Option B — Cloudflare R2** (S3-compatible, generous free tier)
Same variables as above, plus set the endpoint in `server/storage.ts`.

> If you skip S3 setup, voice recording uploads and file exports will fail, but the rest of the app (dictionary, quiz, flashcards, voice chat) will work fine.

---

## Build & Start commands (already in railway.toml)

```
build:  pnpm install --frozen-lockfile && pnpm run build
start:  node dist/index.js
```

---

## Health check

Railway will ping `GET /api/health` to verify the service is up. This endpoint is already implemented in the server.

---

## Estimated Railway cost

| Service | Plan | Cost |
|---|---|---|
| Web service | Hobby ($5/mo credit) | ~$0–5/mo |
| MySQL | Hobby | ~$5/mo |
| **Total** | | **~$5–10/mo** |
