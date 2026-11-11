# Exam Classroom Allocation — Development Tracker

> Update this file as you build. Tick boxes when a task is done and add a line to the Log.

## Goal
Students enter their register / admission number and see their exam classroom.
The exam controller uploads the allocation data. Must handle 100+ student lookups per minute.

## Architecture
| Layer | File(s) | Responsibility |
|---|---|---|
| Entry | `server.js` | Express setup, middleware, routes, static files |
| Config | `src/config.js` | Env vars, limits |
| DB | `src/db.js` | SQLite connection (WAL mode), schema |
| Repository | `src/repositories/allocationRepository.js` | All SQL, prepared statements |
| Services | `src/services/allocationService.js`, `csvService.js` | Business logic, CSV parsing/validation |
| Middleware | `src/middleware/auth.js`, `rateLimit.js` | Admin session, rate limiting |
| Routes | `src/routes/studentRoutes.js`, `adminRoutes.js` | HTTP endpoints |
| Utils | `src/utils/registerNo.js` | Register number normalisation |
| Frontend | `public/` | Student page, admin page, CSS, JS |

## Why it handles 100+ requests/min
- 100/min is under 2 requests/sec; SQLite with WAL and a primary-key lookup serves thousands/sec.
- Prepared statements, no per-request parsing or file I/O.
- Gzip compression, static files cached.
- Rate limit is per IP and set high (600/min) because a college WiFi may share one IP.

## API
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/allocation/:registerNo` | No | Student lookup (today's exams) |
| POST | `/api/admin/login` | No | Controller login |
| POST | `/api/admin/logout` | Yes | Logout |
| GET | `/api/admin/stats` | Yes | Counts |
| GET | `/api/admin/allocations` | Yes | List / search allocations for spreadsheet view |
| POST | `/api/admin/records` | Yes | Add / update record manually (in-built excel feature) |
| DELETE | `/api/admin/record` | Yes | Delete a single record |
| GET | `/api/admin/export` | Yes | Export all allocations as CSV |
| GET | `/api/admin/rooms` | Yes | Distinct classes/rooms, dates, and sessions |
| GET | `/api/admin/seating` | Yes | Class / room-wise seating arrangement for printing |
| POST | `/api/admin/upload` | Yes | CSV upload (`mode=replace|append`) |
| DELETE | `/api/admin/allocations` | Yes | Delete all |

## CSV format
`register_no,name,room,seat_no,exam_name,exam_date,session` — only `register_no` and `room` are required.
Header aliases accepted: admission_id, reg_no, class, classroom, hall, etc.
One student can have several rows (different date/session).

## Task checklist
### v1 (Initial build)
- [x] Project structure, modular layers
- [x] SQLite storage with WAL
- [x] Student lookup API + page
- [x] Admin login (password, signed cookie)
- [x] CSV upload (replace / append) with row-level error report
- [x] Rate limiting, helmet, compression
- [ ] Change `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env`
- [ ] Load test with real-sized data (see below)
- [ ] Deploy on the college server / LAN

### v2 Enhancements (Completed)
- [x] **Today's Exam Arrangement Only**: Restrict student lookup to current date's examinations with helpful status messages
- [x] **In-built Excel / Spreadsheet**: Admin editable grid to view, search, add, edit, and delete records manually without CSV
- [x] **CSV Export**: Download current allocations as CSV from admin panel
- [x] **Print Class / Room Seating Arrangement**: Generate and print classroom seating arrangement chart with print-friendly layout

### v3 Mobile-Friendly & Simplified UI (Completed)
- [x] **Cross-Device Mobile Support**: Optimize for iOS (Safari safe areas, prevent auto-zoom on input focus with 16px inputs, tap delay elimination) and Android (touch targets, modern Roboto/System typography)
- [x] **Simplified Student Portal**: Distraction-free, high-contrast room display with big touch targets, quick input clear button, and instant feedback
- [x] **Mobile-Responsive Admin Dashboard**: Horizontally scrollable touch-friendly tab bar, collapsible manual entry form, touch-friendly edit modal, and dual desktop table / mobile card view
- [x] **Mobile Print & PDF Export**: Streamlined seating sheet generator compatible with mobile AirPrint and Android Save-as-PDF

### v4 Device Recognition & Adaptive Layouts (Completed)
- [x] **Smart Device Detection**: Automatically detect whether client is a mobile device (Android, iOS) or a laptop/desktop computer (`public/js/deviceDetector.js`)
- [x] **Laptop View Preservation**: For laptop/desktop (`lap`), keep the classic manual allocation entry bar open and prominent above the table, with inline spreadsheet row editing
- [x] **Mobile Adaptive View**: For phones and tablets, retain the compact drawer entry and mobile cards with touch-friendly edit modal
- [x] **Manual Device Override**: Provide a quick toggle indicator (`💻 Laptop Mode` / `📱 Mobile Mode`) allowing users to switch views if desired

### Cloud Deployment (Vercel + Turso Free Tier)
- [x] Evaluated zero-cost cloud database options for Vercel Serverless
- [x] Selected **Turso (libSQL)** as the top choice (1 Billion reads/month, 9GB storage, zero cold starts, 100% SQLite query syntax compatible)
- [x] Authored complete step-by-step deployment guide in [VERCEL_DEPLOYMENT_GUIDE.md](file:///T:/Project/exam-allocation/exam-allocation/VERCEL_DEPLOYMENT_GUIDE.md)

### Later ideas
- [ ] Multiple exam-controller accounts
- [ ] HTTPS via nginx reverse proxy

## Load test (optional)
```
npx autocannon -c 50 -d 20 http://localhost:3000/api/allocation/BCA2301
```
Goal: no errors, p99 latency well under 200 ms.

## Log
- 2026-11-09: v1 designed and written (backend modules, student page, admin page).
- 2026-11-10: Started v2 enhancements.
- 2026-11-10: Implemented Stage 2: Date-restricted student lookup (today only) with date normalizer (`src/utils/dateUtils.js`), updated repository query with SQLite indices, and student UI showing today's date banner and room allocation.
- 2026-11-10: Implemented Stage 3: In-built Excel spreadsheet view for administrators with interactive data grid, search, filter, inline edit, delete, and manual single/multi record addition, along with CSV export.
- 2026-11-10: Implemented Stage 4: Printable Class / Room seating arrangement sheets with room & date filtering, candidate signature columns, invigilator sign-off sections, and clean `@media print` layout.
- 2026-11-10: Implemented v3 Mobile-Friendly & Simplified UI overhaul: responsive layout for Android & iOS (preventing Safari auto-zoom, safe area insets, touch-friendly 44px+ hit areas), high-contrast student room card with instant clear button, collapsible manual entry drawer, touch-friendly edit modal, and adaptive card/table view for admin.
- 2026-11-10: Implemented v4 Device Recognition & Adaptive Layouts: `deviceDetector.js` recognizes device type (iOS, Android, Laptop/PC). For laptop, the manual allocation entry is kept in its classic open horizontal Excel grid format with in-place spreadsheet row editing; for mobile, it uses the space-saving drawer and touch cards, with an instant device mode toggle.
- 2026-11-10: Authored `VERCEL_DEPLOYMENT_GUIDE.md` detailing the zero-cost architecture using Vercel Free Tier + Turso (libSQL Cloud SQLite), including setup steps, environment variables, and zero-cost breakdown.
- 2026-11-11: Fixed mobile LAN / Wi-Fi styling issue: Removed `upgrade-insecure-requests` and `HSTS` from Helmet when running on local HTTP, allowing mobile browsers (Chrome/Safari) to load CSS/JS over Wi-Fi without attempting an SSL handshake on plain HTTP.
- 2026-11-11: Fixed admin login authentication for mobile / LAN IP access: Added dual-token support (HTTP cookie + Bearer token in sessionStorage), changed cookie to `SameSite=Lax`, added `credentials: 'include'` to fetch requests, and set `skipSuccessfulRequests: true` in rate limiter to prevent lockouts.
