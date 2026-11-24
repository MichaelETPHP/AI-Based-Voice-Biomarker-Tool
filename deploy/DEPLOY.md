# Deploy to your VPS (Docker Compose + automatic HTTPS)

> **Using Coolify, Dokploy or another panel with its own proxy?** Use **`docker-compose.coolify.yml`**, not `docker-compose.yml`. The panel provides the domain and HTTPS, so Caddy and ports 80/443 must not be in the compose file.
> In Coolify: Build pack **Docker Compose**, Compose file **`/docker-compose.coolify.yml`**, then set the **app** service's domain (for example `https://voice.example.com`, or a free `https://voice.<your-ip>.sslip.io`) and deploy. The microphone needs **HTTPS**; a plain `http://IP:port` won't work on phones.

Phones only allow the microphone over **HTTPS**, so the stack includes **Caddy**, which gets and renews a free Let's Encrypt certificate automatically.

```
Internet ──443/80──▶ caddy (HTTPS) ──▶ app:8000 (FastAPI + DAM + Whisper-tiny, CPU)
                                         ▲
                     models volume ──────┘  (filled once by the "models" job, ~1.9 GB)
```

## 1. VPS requirements
| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU (x86_64) | 4 vCPU |
| RAM | 4 GB (the app uses about 1.6 GB) | 8 GB |
| Disk | 15 GB free | 25 GB |
| OS | Ubuntu 22.04/24.04 or Debian 12 | |

There is no GPU. One analysis takes about 5–15 s on 2–4 vCPU.

## 2. One-time server setup
```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Firewall: SSH + web only
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```
**DNS:** create an `A` record (and an `AAAA` record if you have IPv6) for your domain, for example `voice.example.com`, pointing to the VPS IP. Wait until `ping voice.example.com` shows the VPS IP.

## 3. Upload the project
Copy the project folder **without** `models/`, `.venv/` and `*.wav`. The server downloads the models itself.
```bash
# from your PC (Git Bash / WSL), in the project folder:
rsync -av --exclude models --exclude .venv --exclude '*.wav' --exclude __pycache__ ./ user@VPS_IP:~/voice-biomarker/
```
You can also `git clone` the project if it's in a repository.

## 4. Configure and start
```bash
cd ~/voice-biomarker
cp .env.example .env
nano .env          # set DOMAIN=voice.example.com and ACME_EMAIL=you@example.com
docker compose up -d --build
```
The first start takes about 5–10 minutes:
1. **build**: Python and CPU PyTorch image (~1.2 GB).
2. **models**: downloads DAM (736 MB), whisper-small.en and whisper-tiny into the `models` volume. This happens once only.
3. **app**: loads the models (~20 s) and turns *healthy*.
4. **caddy**: gets the HTTPS certificate and starts serving `https://voice.example.com`.

Check progress:
```bash
docker compose ps                 # app should show (healthy)
docker compose logs -f models     # first run only
docker compose logs -f app
curl https://voice.example.com/api/health   # {"status":"ok","model_loaded":true,...}
```

## 4b. Enable the public API (optional)
Other applications (MuleSoft, AWS, Salesforce, your own backend) call `/v1/*` with an API key. Developer docs are at `https://voice.example.com/developers/`.
```bash
openssl rand -hex 32            # one key per client
nano .env                       # API_KEYS=mulesoft:KEY1,aws:KEY2   (optional: CORS_ORIGINS, RATE_LIMIT_API_PER_HOUR)
docker compose up -d            # apply the change
curl -X POST https://voice.example.com/v1/analyze -H "Authorization: Bearer KEY1" \
     -H "Content-Type: audio/wav" --data-binary @recording.wav
```
To revoke a key, remove it from `API_KEYS` and run `docker compose up -d`. With no keys, the API returns `503 api_not_configured` and the web app keeps working.

## 5. Day-to-day
| Task | Command |
|---|---|
| Update the code | upload the changes, then `docker compose up -d --build` |
| Restart | `docker compose restart app` |
| Stop | `docker compose down` (the models volume is kept) |
| Logs | `docker compose logs -f app caddy` |
| Re-download models | `docker compose down && docker volume rm voice-biomarker_models && docker compose up -d` |

## 6. What's built in (production hardening)
- **Privacy:** audio is held only in a RAM-only `/tmp` (tmpfs) and deleted after each analysis. No database and no accounts. The language check runs in memory.
- **Container:** non-root user, read-only filesystem, all Linux capabilities dropped, `no-new-privileges`, and a memory limit (`APP_MEMORY_LIMIT`).
- **Network:** only Caddy is exposed (80/443). The app port is internal. HSTS, a strict Content-Security-Policy, a microphone-only Permissions-Policy, no-referrer, and anti-framing headers.
- **Abuse limits:** per-IP limits (`RATE_LIMIT_ANALYZE_PER_HOUR`, `RATE_LIMIT_LANGUAGE_PER_HOUR`), a bounded queue (`MAX_WAITING_ANALYSES`), and a 12 MB upload cap at the proxy.
- **Reliability:** health check (`/api/health`), `restart: unless-stopped`, log rotation, and API docs disabled in production.
- **Offline AI:** the app runs with `HF_HUB_OFFLINE=1`, so no calls go to Hugging Face or anyone else at runtime.

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| `required variable DOMAIN/ACME_EMAIL is missing` | Fill in `.env` |
| Caddy log: certificate / ACME errors | DNS doesn't point to the VPS yet, or ports 80/443 are blocked |
| App stays `starting` | First model load; check `docker compose logs app`. With less than 4 GB RAM it may be killed (OOM). |
| Mic does not work on a phone | It must be opened via `https://your-domain`, not the IP address |
| "Many people are using the tool right now" | Raise `MAX_WAITING_ANALYSES` or use more vCPUs |

Before a public launch, replace `[Add local clinic or helpline contact here]` in `frontend/app.js` with real, verified contacts, and read `NOTICE.md` (Kintsugi logo/trademark).
