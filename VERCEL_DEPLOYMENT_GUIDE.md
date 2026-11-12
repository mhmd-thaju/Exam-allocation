# Vercel Free-Tier Deployment & Cloud Database Guide

This guide explains how to deploy the **Exam Classroom Allocation** application to **Vercel** with a **100% free cloud database** that never incurs any cost.

---

## 1. Why Vercel Needs an External Database

Vercel is a **serverless platform**:
1. **Stateless / Ephemeral Filesystem**: Each incoming request runs in a temporary container (AWS Lambda function). Any local SQLite file written to `data/allocations.db` is destroyed when the function finishes or spins down.
2. **Native C++ Addons**: The local `better-sqlite3` driver requires native C++ compilation (`node-gyp`), which often encounters build issues in serverless Linux environments.

Therefore, running on Vercel requires an external, cloud-hosted database.

---

## 2. Comparison of Free Cloud Databases

| Database | Free Tier Allowance | Cold Start / Inactivity | Best Fit For |
|---|---|---|---|
| **Turso (libSQL / Cloud SQLite)** ⭐ **Recommended** | **1 Billion row reads/mo**, 25M writes/mo, 9 GB storage, 500 databases | **None** (Always active, instant sub-50ms queries) | **Matches current project 100%** (zero SQL query rewrites) |
| **Neon / Vercel Postgres** | 0.5 GB storage, autoscaling compute | Compute sleeps after 5 min of inactivity (1–3s wake-up delay) | Good if you prefer PostgreSQL |
| **Supabase (PostgreSQL)** | 500 MB database, 50,000 monthly active users | **Pauses after 7 days of inactivity** (requires manual unpause) | General apps, but risk of auto-pausing between exams |

### Why Turso is the Best Choice for this Project:
1. **$0 Cost Forever (No Credit Card Required)**: The 1 Billion reads/month free tier is vastly larger than an entire university’s peak traffic.
2. **100% SQLite Compatible**: Turso is built on libSQL (open-source SQLite). All our existing `allocations` table schema, indices, queries, and CSV columns work without changing SQL syntax.
3. **No Inactivity Sleep**: Unlike Supabase (which pauses after 7 days) or Neon (which suspends compute), Turso never goes to sleep. When students open their phones at 8:30 AM before an exam, it responds instantly with zero cold-start delay.
4. **Pure JavaScript Driver**: Uses `@libsql/client`, which runs natively on Vercel Serverless without native compilation issues.

---

## 3. Step-by-Step Setup Guide

### Step 1: Create a Free Turso Database (2 minutes)
1. Go to **[turso.tech](https://turso.tech)** and click **Sign Up** (Sign in with your GitHub account). No credit card required.
2. You can create a database using the **Turso Web Dashboard** or the **Turso CLI**:
   - **Via Web Dashboard**:
     1. Click **Create Database**.
     2. Name it `exam-allocation`.
     3. Select the region closest to your college (e.g., `BOM` for Mumbai / India, or your nearest regional location).
     4. Click **Create**.
   - **Via CLI (Alternative)**:
     ```bash
     npm install -g turso
     turso auth login
     turso db create exam-allocation --location bom
     ```
3. Copy the two credentials provided:
   - **Database URL**: e.g., `libsql://exam-allocation-yourname.turso.io`
   - **Auth Token**: Click **Create Token** (or run `turso db tokens create exam-allocation`) and copy the long token string.

---

### Step 2: Initialize the Database Schema in Turso
In the Turso Web Console (SQL Editor) or via CLI, run this schema script:

```sql
CREATE TABLE IF NOT EXISTS allocations (
  register_no TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  room        TEXT NOT NULL,
  seat_no     TEXT NOT NULL DEFAULT '',
  exam_name   TEXT NOT NULL DEFAULT '',
  exam_date   TEXT NOT NULL DEFAULT '',
  session     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (register_no, exam_date, session)
);

CREATE INDEX IF NOT EXISTS idx_allocations_room ON allocations(room, exam_date, session);
CREATE INDEX IF NOT EXISTS idx_allocations_date ON allocations(exam_date);
```

---

### Step 3: Add Vercel Serverless Configuration

The project uses `server.js` as its Express entry point. The Vercel function must point to that file:

```json
{
  "version": 2,
  "installCommand": "npm install --omit=dev",
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ]
}
```

`server.js` exports the Express app for Vercel and starts the HTTP listener only when run locally.
`better-sqlite3` is a development-only dependency for local SQLite. The install command excludes it from Vercel builds; deployed requests use Turso instead.
The project pins Node.js to 22.x so local SQLite tooling and deployment use a supported Node runtime rather than Node 26.

---

### Step 4: Install the Turso Database Client

In your terminal:
```bash
npm install @libsql/client
```

---

### Step 5: Universal Database Adapter (`src/db.js`)

Update [`src/db.js`](file:///T:/Project/exam-allocation/exam-allocation/src/db.js) so it supports **both** local SQLite (when developing offline on your laptop) and **Turso Cloud** (when deployed on Vercel):

```javascript
const { createClient } = require('@libsql/client');
const config = require('./config');

let db;

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  // Production on Vercel with Turso Cloud Database
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  console.log('Connected to Turso Cloud Database');
} else {
  // Local development fallback using better-sqlite3
  const Database = require('better-sqlite3');
  const localDb = new Database(config.dbPath);
  localDb.pragma('journal_mode = WAL');
  localDb.pragma('synchronous = NORMAL');
  
  // Wrap local SQLite with an async interface matching @libsql/client
  db = {
    execute: async ({ sql, args }) => {
      const stmt = localDb.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const rows = Array.isArray(args) ? stmt.all(...args) : stmt.all(args || {});
        return { rows };
      }
      const info = Array.isArray(args) ? stmt.run(...args) : stmt.run(args || {});
      return { rowsAffected: info.changes };
    },
    batch: async (statements) => {
      const tx = localDb.transaction((stmts) => {
        for (const s of stmts) {
          const stmt = localDb.prepare(s.sql);
          if (Array.isArray(s.args)) stmt.run(...s.args);
          else stmt.run(s.args || {});
        }
      });
      tx(statements);
    }
  };
  console.log('Connected to Local SQLite Database');
}

module.exports = db;
```

---

### Step 6: Deploy to Vercel (Free Hobby Tier)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Configure Vercel and Turso deployment"
   git push origin main
   ```

2. **Import into Vercel**:
   - Go to **[vercel.com](https://vercel.com)** and sign in with GitHub.
   - Click **Add New...** → **Project**.
   - Select your `exam-allocation` repository and click **Import**.

3. **Configure Environment Variables in Vercel**:
   Under **Project → Settings → Environment Variables**, add:
   
   | Variable Name | Value | Purpose |
   |---|---|---|
   | `ADMIN_USERS` | JSON array of individual username/salt/passwordHash records | Allowlist of authorized controllers |
   | `SESSION_SECRET` | Output of `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` | HMAC cookie signing secret; use a unique value at least 32 bytes long |
   | `TURSO_DATABASE_URL` | `libsql://exam-allocation-xxx.turso.io` | Turso DB endpoint |
   | `TURSO_AUTH_TOKEN` | `eyJh...` | Turso authentication token |

   Create a separate credential record for each authorized person. In a terminal at the project root, run:
   ```bash
   node scripts/create-admin-user.js controller1
   ```
   Enter a unique password of at least 14 characters when prompted. The script prints one JSON record; combine the records into a JSON array and set that entire array as `ADMIN_USERS`. Only its salted scrypt hash is stored in Vercel, not the password. Remove the old `ADMIN_PASSWORD` variable. To revoke access for one person, remove their record from `ADMIN_USERS` and redeploy; their existing session is then rejected.

   Vercel environment variable changes do not alter an already-created deployment. After changing credentials or the session secret, redeploy so the new values take effect. Failed and successful sign-in attempts are limited per client IP using Turso-backed counters on Vercel, so the limit is shared across serverless instances.

4. **Click Deploy**:
   - Vercel will build your project in ~30 seconds.
   - You will receive a live URL: `https://exam-allocation-yourname.vercel.app`.

### Admin Activity Audit Log

The application creates `admin_audit_log` and its indexes automatically in the configured Turso database. It records successful and failed sign-ins, sign-in throttling, blocked cross-origin requests, and authenticated admin reads and changes. Events include the acting username (or `anonymous` for unauthenticated attempts), action, target when applicable, outcome, HTTP status, and limited non-secret metadata. Passwords, session cookies, and uploaded CSV contents are never written to the audit log.

An authenticated controller can review recent events with `GET /api/admin/audit?limit=100&offset=0`. The endpoint returns at most 200 events per request. Audit events are recorded before protected actions begin and finalized with the response status; an event left as `pending` indicates the request did not complete or the final audit update failed. The same records can be queried directly in Turso's SQL editor:

```sql
SELECT occurred_at, completed_at, actor, action, target, outcome, status_code, details
FROM admin_audit_log
ORDER BY occurred_at DESC
LIMIT 100;
```

Audit history is stored in the same Turso database as allocations. Restrict access to the Turso account/token, and establish a retention policy if the log grows beyond the database plan's storage allowance.

---

### Step 7: Connect Your Custom Domain on Vercel
1. Go to your project on **Vercel** → **Settings** → **Domains**.
2. Enter your custom domain or subdomain (e.g. `exams.yourcollege.edu` or `seating.yourdomain.com`).
3. Add the DNS records provided by Vercel (`CNAME` pointing to `cname.vercel-dns.com`) at your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.).
4. Vercel automatically generates and renews a free **SSL / HTTPS certificate**.

---

## 4. Cost Verification (100% Free Breakdown)

| Resource | Service | Free Tier Limit | Expected Exam Traffic | Cost |
|---|---|---|---|---|
| **Hosting & SSL** | Vercel Hobby | 100 GB bandwidth, unlimited deployments | ~2 to 5 GB during exam week | **$0.00** |
| **Database Storage** | Turso Free | 9 GB storage | ~20 MB (10,000 students = ~2 MB) | **$0.00** |
| **Database Reads** | Turso Free | **1,000,000,000 (1 Billion) reads/month** | ~50,000 lookups per exam | **$0.00** |
| **Database Writes** | Turso Free | 25,000,000 writes/month | ~10,000 row imports | **$0.00** |
| **Total Monthly Cost** | — | — | — | **$0.00 / Free Forever** |

---

## 5. Summary Checklist Before Exam Day

- [ ] Turso database created and credentials added to Vercel environment variables.
- [ ] `ADMIN_USERS` contains only individually authorized personnel; no shared/default admin password is configured.
- [ ] A unique `SESSION_SECRET` of at least 32 bytes is configured in Vercel.
- [ ] Admin dashboard redirects unauthenticated visitors to the sign-in page; admin API requests require an authenticated session.
- [ ] Admin login uses HTTPS-only, HttpOnly session cookies and cross-origin admin requests are rejected.
- [ ] Uploaded allocation CSV via the Admin Portal (`/admin.html`).
- [ ] Verified student lookup from mobile phone on the live Vercel domain.
- [ ] Tested the **Print Seating Arrangement** page for door sheets.
