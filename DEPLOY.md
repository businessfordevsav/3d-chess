# Deploying 3D Chess

3D Chess runs on the shared VPS (`root@72.61.231.244`, Hostinger) next to Murmurline, shift and tradeflow.
The box's Traefik (`/docker/traefik`) sends your domain to the game and gets its HTTPS certificate from
Let's Encrypt; 3D Chess only adds labels to its own container, so Traefik and the other projects need no
changes. The game lives in `/opt/3d-chess` with its own container (`3d-chess`), Docker network and SQLite
database volume. It is capped at 512 MB and one CPU, like the other apps, and shares nothing with them.

## 1. DNS

At your domain registrar:

| Type | Name | Value |
|---|---|---|
| A | `@` | `72.61.231.244` |
| CNAME | `www` | your domain (redirected to the bare domain) |

Wait until `dig +short yourdomain.com` prints `72.61.231.244` before the first deploy: Let's Encrypt checks the
domain over HTTP when Traefik asks for the certificate. If you don't want `www`, delete the six `chess-www`
labels from `docker-compose.yml`.

## 2. Settings (once)

```sh
ssh root@72.61.231.244
mkdir -p /opt/3d-chess && cd /opt/3d-chess
nano .env      # paste .env.example from this repo and fill it in
chmod 600 .env
```

`DOMAIN` (e.g. `chess.example.com`) and `APP_URL` (`https://chess.example.com`) are required. The rest turn on
email, Google sign-in and ads, as explained in `.env.example` and below.

## 3. Deploy

From your computer, in this project:

```sh
./deploy/deploy.sh
```

It copies the code to `/opt/3d-chess` with rsync (never your local database or `.env`), builds the image there
and starts the container. Traefik notices it within seconds, and the first visit to `https://yourdomain.com`
gets the certificate. Run the same command for every update. Games in progress survive restarts, and players
reconnect automatically.

On the server, in `/opt/3d-chess`:

```sh
docker compose ps                      # "healthy" once it's up
docker compose logs -f app             # the game's log (and emails, if SMTP isn't set)
docker compose restart app             # after editing .env
docker logs traefik 2>&1 | grep -i acme | tail   # if the certificate doesn't arrive
```

### Deploy on release (GitHub Actions)

`.github/workflows/deploy.yml` deploys automatically when you **publish a release** on GitHub (Releases → Draft
a new release → pick or create a tag such as `v1.0.0` → Publish). It runs `npm test` first; only if the tests pass
does it run `deploy/deploy.sh` and wait for `https://<DOMAIN>/healthz` to answer `ok`. The Actions tab also has a
**Run workflow** button to redeploy `main` by hand. A failed run leaves the site on the previous version and
emails you.

One-time setup:

1. A key only for GitHub, on your computer: `ssh-keygen -t ed25519 -N "" -C github-deploy-3d-chess -f ~/.ssh/3d-chess-deploy`
2. Allow it on the server: `ssh-copy-id -i ~/.ssh/3d-chess-deploy.pub root@72.61.231.244`
3. In the GitHub repo, open **Settings → Secrets and variables → Actions** and add three repository secrets:

| Secret | Value |
|---|---|
| `SSH_KEY` | the whole private key: `cat ~/.ssh/3d-chess-deploy` |
| `SSH_KNOWN_HOSTS` | the server's host key: `ssh-keyscan -t ed25519 72.61.231.244` (should show fingerprint `SHA256:ErDV1Q+2JiCjtJA6qgm/TvRxJWeNYOpeI9KNkBqMV8E`) |
| `SSH_HOST` | `root@72.61.231.244` |

If the key ever leaks, delete its line (ending in `github-deploy-3d-chess`) from `/root/.ssh/authorized_keys` on the
server and make a new one.

## 4. Backups

The database (accounts, ratings, games) is one SQLite file in the `3d-chess_chess-data` volume. Back it up
nightly from root's crontab (`crontab -e` on the server):

```
45 3 * * * /opt/3d-chess/deploy/backup.sh >> /var/log/3d-chess-backup.log 2>&1
```

That keeps the last 14 days in `/opt/3d-chess-backups`, outside the folder a deploy syncs. Keep a copy off the
server too, for example from your computer: `rsync -az root@72.61.231.244:/opt/3d-chess-backups/ ./chess-backups/`.

To restore one:

```sh
cd /opt/3d-chess
docker compose stop app
docker compose cp /opt/3d-chess-backups/chess-2026-01-31.db app:/data/chess.db
docker compose run --rm --user root app rm -f /data/chess.db-wal /data/chess.db-shm
docker compose start app
```

## 5. Email

Account confirmation and password-reset emails need an SMTP service, such as Brevo, Postmark, Amazon SES,
Resend, or your domain's mail provider. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`.
Add the SPF and DKIM DNS records your provider gives you, or emails will land in spam.

## 6. Sign in with Google

In Google Cloud Console, open **APIs & Services → Credentials → Create credentials → OAuth client ID**:

- Application type: **Web application**
- Authorized redirect URI: `https://yourdomain.com/auth/google/callback`

Put the client ID and secret in `.env`. On the **OAuth consent screen**, add the app name, your privacy policy
(`https://yourdomain.com/privacy`) and terms (`https://yourdomain.com/terms`), then publish it.

## 7. After launch

- **Google Search Console**: add the domain, then submit `https://yourdomain.com/sitemap.xml`.
- **AdSense**: apply with the live site. Once approved, create two display ad units and set `ADSENSE_CLIENT`,
  `ADSENSE_SLOT_MENU` and `ADSENSE_SLOT_PAGE`. Then publish a **European regulations** message under
  **Privacy & messaging**; it's required for visitors from the EEA, UK and Switzerland. See the README.
- **Uptime monitoring**: point a free monitor (UptimeRobot, Better Stack) at `https://yourdomain.com/healthz`.
  It answers `ok` when the server and database are up.
- Read the privacy policy and terms once more, and make sure `CONTACT_EMAIL` reaches you.
