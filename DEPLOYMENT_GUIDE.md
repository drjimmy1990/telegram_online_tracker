# TeleTracker — VPS Deployment Guide (aaPanel)

This guide deploys both the **Python tracker** (via Docker) and the **web dashboard** (static site via Nginx) on your aaPanel VPS.

---

## Architecture on VPS

```
VPS (aaPanel)
├── Docker → telegram-tracker (Python, runs 24/7)
└── Nginx → tracker.yourdomain.com (serves built dashboard)
```

---

## Prerequisites

- aaPanel installed on your VPS
- Docker installed (aaPanel → App Store → Docker Manager)
- Node.js 18+ installed (aaPanel → App Store → Node.js Version Manager)
- A domain/subdomain pointed to your VPS IP (e.g., `tracker.yourdomain.com`)

---

## Step 1: Upload the Project

SSH into your VPS and clone or upload the project:

```bash
cd /www/wwwroot
git clone https://github.com/drjimmy1990/telegram_online_tracker.git tele
# OR upload the folder via aaPanel File Manager
```

---

## Step 2: Configure Environment Variables

### Tracker `.env` (backend)

```bash
cd /www/wwwroot/tele
cp .env.example .env   # or create manually
nano .env
```

Fill in:
```env
API_ID=33102488
API_HASH=5eef893c2b9469e748aeb6ef82cdfcab
TARGET_USERS=+201015686607, +201099880388
SUPABASE_URL=https://tblsqaiweagshhwrfuyb.supabase.co
SUPABASE_KEY=your_service_role_key_here
WEBHOOK_URL=
```

### Dashboard `web/.env` (frontend)

```bash
nano web/.env
```

Fill in:
```env
VITE_SUPABASE_URL=https://tblsqaiweagshhwrfuyb.supabase.co
VITE_SUPABASE_KEY=your_anon_key_here
VITE_DASHBOARD_PASSWORD=tele2026
```

---

## Step 3: Authenticate with Telegram (One-Time)

You must generate the `.session` file before Docker can run autonomously.

```bash
cd /www/wwwroot/tele
docker run -it --rm -v $(pwd):/app -w /app python:3.11-slim \
  bash -c "pip install -r requirements.txt && python tracker.py"
```

- Enter your phone number when prompted
- Enter the OTP code from Telegram
- Once you see "Listening for status updates", press `Ctrl+C`
- Verify the session file exists: `ls tracker_session.session`

---

## Step 4: Start the Tracker (Docker)

```bash
cd /www/wwwroot/tele
docker compose up -d --build
```

Verify it's running:
```bash
docker compose logs -f
```

You should see:
```
[TeleTracker] Resolved 2 targets. Listening for status updates...
```

**The tracker is now running 24/7 and will auto-restart on reboot.**

---

## Step 5: Build the Dashboard

```bash
cd /www/wwwroot/tele/web
npm install
npm run build
```

This creates the `web/dist/` folder containing the production-ready static files.

---

## Step 6: Create Website in aaPanel

1. Open **aaPanel** → **Website** → **Add Site**
2. Set:
   - **Domain**: `tracker.yourdomain.com` (or your subdomain)
   - **Root Directory**: `/www/wwwroot/tele/web/dist`
   - **PHP Version**: Static (no PHP needed)
3. Click **Submit**

---

## Step 7: Configure Nginx (SPA Routing)

In aaPanel, click your new site → **Config** (or **Nginx Config**), and add this inside the `server {}` block:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

This ensures the single-page app loads correctly on all routes.

Click **Save** and **Restart Nginx**.

---

## Step 8: Enable SSL (Optional but Recommended)

1. In aaPanel → your site → **SSL**
2. Click **Let's Encrypt** → select domain → **Apply**
3. Enable **Force HTTPS**

---

## Verification Checklist

- [ ] `docker ps` shows `telegram-tracker` running
- [ ] `docker compose logs -f` shows "Listening for status updates"
- [ ] `https://tracker.yourdomain.com` shows the login screen
- [ ] Password `tele2026` unlocks the dashboard
- [ ] Events appear in the dashboard when tracked users go online/offline

---

## Updating the Application

When new features are pushed to GitHub, follow these steps to update your VPS:

1. **Pull the latest code:**
   ```bash
   cd /www/wwwroot/tele
   git pull origin main
   ```

2. **Update the Tracker (Backend):**
   ```bash
   docker compose up -d --build
   ```

3. **Update the Dashboard (Frontend):**
   ```bash
   cd web
   npm install
   npm run build
   ```
   *(No need to restart Nginx, it automatically serves the new files from `web/dist`)*

---

## Maintenance Commands

```bash
# View tracker logs
cd /www/wwwroot/tele
docker compose logs -f --tail 100

# Restart the tracker
docker compose restart

# Stop the tracker
docker compose down

# Rebuild after code update
cd /www/wwwroot/tele
git pull
docker compose up -d --build

# Rebuild dashboard after code update
cd /www/wwwroot/tele/web
npm run build
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Docker not found | Install via aaPanel → App Store → Docker Manager |
| `tracker_session.session` missing | Re-run Step 3 (interactive auth) |
| Dashboard shows blank | Check `web/.env` has correct Supabase keys |
| Events not appearing | Check `docker compose logs -f` for errors |
| SSL not working | Re-apply in aaPanel → SSL → Let's Encrypt |
| Tracker stops after VPS reboot | `docker compose` has `restart: unless-stopped`, should auto-start. If not: `cd /www/wwwroot/tele && docker compose up -d` |
| Build fails `.user.ini` | Run `chattr -i /www/wwwroot/tele/web/dist/.user.ini && rm -f /www/wwwroot/tele/web/dist/.user.ini` then rebuild |


cd /www/wwwroot/tele
git pull origin main
chattr -i web/dist/.user.ini; rm -f web/dist/.user.ini
cd web && npm run build
