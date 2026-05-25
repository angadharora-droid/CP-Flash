# DailyFlash Security

## Threat model

We protect against:
- **MongoDB Atlas dump leak** (compromised credentials, misconfigured network access, Atlas-side incident)
- **Render host compromise** (someone reading the backend disk or env vars off the running container)
- **Vercel preview deployment exposure** (preview URLs unintentionally reachable)
- **Brute-force PIN attempts** against `/api/login`
- **Sensitive headers / data leaking in transit**

The core defense is **application-level encryption at rest**: the backend encrypts every report payload with AES-256-GCM before writing it to MongoDB or to disk. The encryption key lives only in the `ENCRYPTION_KEY` env var. A leaked DB dump or disk image is opaque ciphertext without that key.

## Encryption details

- Algorithm: `aes-256-gcm` (authenticated — tamper-evident)
- Key: 32 raw bytes encoded as base64, supplied in `ENCRYPTION_KEY`
- Per-record random 12-byte IV
- Envelope format: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`
- Decryption auto-detects legacy plaintext records (starts with `{`) so the migration is non-breaking. The first write of any record converts it to ciphertext.

What is encrypted:
- `reports` collection — every daily payload (KPIs, revenue, P&L, settlement, bank position, attachment previews)
- `authLockouts` collection — failed-login tracking
- `backend/data/YYYY-MM-DD.json` — local file fallback
- `backend/data/auth-lockout.json`

Not yet encrypted (lower priority — flag if you want these too):
- Email attachments downloaded under `backend/data/attachments/` (raw XLS/HTML files)
- Server logs (avoid logging KPI values)

## Generating keys

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # JWT_SECRET
```

Store both in a password manager (1Password, Bitwarden). **Losing `ENCRYPTION_KEY` makes the data unrecoverable.**

## Migrating existing plaintext data

After setting `ENCRYPTION_KEY` for the first time, encrypt any data already written before the upgrade:

```bash
cd backend
ENCRYPTION_KEY=<your-key> MONGODB_URI=<your-uri> npm run migrate:encrypt
```

The script is idempotent — already-encrypted records are skipped.

## Render hardening checklist

1. **Set required env vars** in the Render service dashboard (Environment → Add Environment Variable):
   - `ENCRYPTION_KEY` (mandatory — server refuses to start in production without it)
   - `JWT_SECRET` (mandatory, >= 32 chars)
   - `DAILYFLASH_PIN` (strong, non-guessable)
   - `ALLOWED_ORIGINS` = your Vercel production URL (no preview URLs)
   - `NODE_ENV` = `production`
2. **Never commit `.env` or paste credentials in code.** `.env` is already in `.gitignore`.
3. **Restrict the Render dashboard** to people who need it. Enable 2FA on every member's account.
4. **Use the Render shell only when necessary.** Anything you run there has access to env vars.
5. **Rotate `JWT_SECRET` and `DAILYFLASH_PIN` if anyone with dashboard access leaves.** Rotating `JWT_SECRET` invalidates all sessions.

## Vercel hardening checklist

1. **Lock down preview deployments.** Project Settings → Deployment Protection → enable **Vercel Authentication** for Preview environments. Production stays public-with-PIN.
2. **Set `VITE_API_BASE_URL`** to the Render URL — do not bake API URLs into the bundle by hand.
3. **Enable Trusted Domains** for the project if available on your plan.
4. **Disable indexing for preview URLs** (Vercel does this by default — verify).
5. **Add the production Vercel origin to `ALLOWED_ORIGINS`** on Render. Without it, CORS will block the frontend in production.

## MongoDB Atlas hardening checklist

1. **IP Access List**: restrict to Render's outbound IPs only. From Atlas → Network Access, remove `0.0.0.0/0`. Get Render's static outbound IPs from your service's Settings → Outbound IPs and add only those.
2. **Database User**: use a dedicated user for this app, with `readWrite` on the `dailyflash` database only — not `atlasAdmin`.
3. **Strong password** for the DB user (32+ chars). Rotate the existing `angadharora_db_user` password — it has appeared in `.env` files and should be considered compromised.
4. **Enable Atlas auditing** on Atlas dashboard (M10+ tier).
5. **Encrypted backups**: Atlas backups are encrypted at rest by Atlas, AND now our payload is encrypted at the application layer, so a leaked Atlas backup is still opaque.

## Login hardening

The PIN login route enforces:
- **3 wrong PINs → 5-hour account-wide lockout** (existing)
- **10 requests per minute per IP → 429** (new — slows automated guessing)
- **Constant-time PIN comparison** so attackers cannot infer the PIN via response timing
- **`trust proxy` enabled** so the rate limiter sees the real client IP behind Render's edge
- **Audit log lines** (`login.ok`, `login.fail`, `login.blocked.lockout`) — viewable in Render logs

For stronger access control, future options:
- Replace shared PIN with per-user accounts (bcrypt-hashed passwords, individual sessions)
- Add WebAuthn / passkey
- Restrict /api to a Cloudflare Access policy or Render IP allow-list

## Transport / browser hardening

The server sets these headers:
- `Strict-Transport-Security` (in production) — forces HTTPS for 2 years
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — prevents the dashboard being embedded in attacker iframes
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

CORS:
- In production, requests are rejected unless `Origin` is in `ALLOWED_ORIGINS`
- In dev (`NODE_ENV` unset) any origin is allowed for local testing

## Incident response

If you suspect a credential leak:
1. **Rotate `DAILYFLASH_PIN` and `JWT_SECRET`** in Render. All sessions invalidate immediately.
2. **Rotate the MongoDB Atlas user password** and update `MONGODB_URI` in Render.
3. **Rotate `REPORT_EMAIL_PASSWORD`** on Rediffmail and update Render.
4. **DO NOT rotate `ENCRYPTION_KEY` unless absolutely necessary.** Rotating it makes all historical data unreadable until you re-encrypt with the new key. Process to rotate safely:
   - Decrypt all records with the old key
   - Re-encrypt with the new key
   - This requires a custom one-off script — ask before doing it.

If a leak already happened with the old (plaintext) records:
- Anything written before the migration ran was plaintext on disk/in Mongo. Assume it was readable.
- Going forward, every write is encrypted.
