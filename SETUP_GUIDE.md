# Telegram Online Tracker — Setup Guide

This guide covers everything you need to get the tracker and dashboard running cleanly using **Docker**. This is the recommended approach to keep your PC clean without installing Python libraries directly onto your system.

## 1. Configure the Environment
Before running anything, ensure your `.env` files are fully populated:

### `/.env` (Backend Tracker)
- **API_ID / API_HASH**: Grab these from [my.telegram.org](https://my.telegram.org).
- **TARGET_USERS**: A comma-separated list of targets (e.g., `+201015686607, +201099880388`).
- **SUPABASE_URL**: Your Supabase project URL.
- **SUPABASE_KEY**: Your Supabase **`service_role` secret key** (requires full write permissions).

### `/web/.env` (Frontend Dashboard)
- **VITE_SUPABASE_URL**: Your Supabase project URL.
- **VITE_SUPABASE_KEY**: Your Supabase **`anon` public key**.

---

## 2. Set Up the Database
You need to create the table that holds the status tracking data.
1. Log into your [Supabase](https://supabase.com) dashboard.
2. Go to the **SQL Editor** tab.
3. Open the `migrations/001_create_status_events.sql` file in this project, copy the contents, paste it into the editor, and hit **Run**.

---

## 3. First-Time Authentication (Interactive)
Telegram requires a one-time login (OTP) to generate an authentication token (`tracker_session.session`). 
Since Docker containers normally run in the background, we need to run an interactive temporary container just to do this login step.

Open your terminal in the `tele` folder and run this command:
```powershell
docker run -it --rm -v ${PWD}:/app -w /app python:3.11-slim bash -c "pip install -r requirements.txt && python tracker.py"
```

**What will happen:**
1. It will download Python in a temporary container.
2. It will ask for your phone number (the one hosting the account). Type it in with the country code.
3. Telegram will send an OTP code to your app. Type the OTP code in the terminal.
4. Once it logs in successfully and says "Listening for status updates", press `Ctrl+C` to stop it.

> **Result:** A new file called `tracker_session.session` will appear in your folder. This is your permanent login token!

---

## 4. Run the Tracker 24/7
Now that you have your `.session` file, you can start the official Docker container in the background. It will run silently and track the users.

```powershell
docker compose up -d --build
```
*(To check if it's working, you can view the logs anytime with `docker compose logs -f`)*

---

## 5. Run the Dashboard
To view the data, you need to run the Vite dashboard. Since it's just a Node.js frontend, it's very lightweight to run locally.

Open a new terminal window:
```powershell
cd web
npm install
npm run dev
```

Open the link provided (usually `http://localhost:5173` or `http://localhost:5555`) in your browser to see your tracking dashboard!



docker run -it --rm -v ${PWD}:/app -w /app python:3.11-slim bash -c "pip install -r requirements.txt && python tracker.py"

