# Little Elly CMS — Find a Centre specification

**Product:** little-elly-cms  
**Scope:** the Find a Centre admin and its public read API  
**Status:** built and seeded (182 published centres, finder settings, network defaults)  
**Storage:** local files. S3 is installed and unused.

## 1. Purpose

Editors manage preschool centres, the finder page copy, and the shared centre-page copy. A published change is available to the public website on the next request. Drafts stay invisible to the public.

The CMS does not render the public site. The public site reads two unauthenticated JSON endpoints and applies its own layout.

## 2. In scope

- One admin account, session cookie, password change.
- Centre create, edit, publish, unpublish, and delete.
- Finder page copy, search labels, aliases, and city coordinates.
- Network defaults: page templates, strengths, facilities, programs, hours, and day schedule.
- One hero image per centre, stored locally.
- Public JSON for the finder list and one published centre.
- Seed from the existing centre directory.

## 3. Out of scope

- Franchise, blog, curriculum, about, and careers.
- Public-site navigation, home hero, and the closing Visit section.
- Turning on S3 or adding AWS keys.
- Multiple admin roles.
- A page at `GET /` on the API. The API is JSON only in development. The admin UI is a separate app.

## 4. System context

| Piece | Address | Role |
| --- | --- | --- |
| API | `http://localhost:3001` | Express. MongoDB Atlas. Cookies and uploads. |
| Admin | `http://localhost:5173` | Vite + React. Proxies `/api` and `/media` to port 3001. |
| Public site | `http://localhost:5174` | Separate project. Reads the public API. Must be listed in `CLIENT_ORIGINS` for admin actions from that origin. Image requests to `/media/{uuid}.jpg\|png\|webp` may go directly to port 3001. |

Both processes must be running. The admin login fails with "something went wrong" when port 3001 is down (`ECONNREFUSED`).

`GET /` on port 3001 returns `Cannot GET /`. Health is `GET /api/health`.

## 5. Actors

- **Admin.** Signs in, edits centres, finder, and defaults, uploads photos, changes password.
- **Public reader.** No login. Receives published centres and shared copy only.
- **Seed.** One-time load of the directory, finder defaults, network defaults, and the first admin user.

## 6. Functional requirements

### 6.1 Access

- **FR-1.** Login accepts email and password and sets an httpOnly cookie named `le_cms`. Wrong email or password returns 401 with the same message.
- **FR-2.** `GET /api/auth/me` returns the signed-in admin. A missing or revoked cookie is rejected.
- **FR-3.** Logout increments `tokenVersion` and clears the cookie. Older cookies stop working.
- **FR-4.** Password change requires the current password. The new password is 10–72 characters and contains a letter and a number. It must differ from the current password. Success issues a new cookie.
- **FR-5.** Login and password change share a limit of 8 attempts per 15 minutes per IP. Other admin API calls share 300 per 15 minutes. Public reads are 120 per minute.
- **FR-6.** State-changing `/api` requests must come from an allowed origin (`CLIENT_ORIGINS`) or the same host. Public GETs do not need that check.

### 6.2 Centres

- **FR-7.** A new centre is a draft until the editor sets it to published.
- **FR-8.** Required fields: slug, name, area, city, state, address. Slug matches `^[a-z0-9]+(?:[-_][a-z0-9]+)*$` and is unique.
- **FR-9.** Optional: phone, email, map URL, sort order, head name, role, since, quote, notes, hero image, and hero alt text.
- **FR-10.** `useNetworkDefaults` defaults to true. Strengths, facilities, programs, and hours then come from network defaults. When it is false and the centre has its own list, that list is used.
- **FR-11.** The admin list supports search, status, state, city, and pages of 20. Search covers name, area, city, state, address, and slug.
- **FR-12.** Delete removes the centre. The editor must type the slug to confirm. An unused hero file is retired. A file still referenced elsewhere returns 409.
- **FR-13.** Replacing a hero retires the previous file when nothing else uses it.

### 6.3 Finder

- **FR-14.** There is one finder document, key `finder`.
- **FR-15.** Editable groups: SEO title and description; hero kicker, headlines, lead, and four stat labels. Stat 1 and stat 4 values are editable text (for example `172+` and `20+`). City and state counts are not stored there.
- **FR-16.** Search copy includes placeholder, Near me, All states, results line, empty state, show more, see-all label and href, disclaimer, home result cap (1–24), and listing page size (1–60).
- **FR-17.** Location messages cover unavailable, searching, success, and denied.
- **FR-18.** Card labels cover view, call, directions, head prefix, call-popup kicker, popup button, and close.
- **FR-19.** Aliases map a typed token to a canonical token. City coordinates are name, latitude, and longitude. A published city with no coordinates still exists; Near me sorts it last. The website does that sort, not the API.

### 6.4 Network defaults

- **FR-20.** There is one defaults document, key `defaults`.
- **FR-21.** Page templates may contain `{area}`, `{city}`, `{state}`, `{headFirstName}`, and `{year}`. The website fills them. Year is `head.since`.
- **FR-22.** Shared lists: strengths (label + line), facilities, programs, hours (label + value), and the day schedule (time, title, optional photo).
- **FR-23.** `nearbyCount` is 1–12. The website picks nearby centres: same city first, then same state, then slices to that count.

### 6.5 Images

- **FR-24.** Upload is one file, field name `file`, maximum 5 MB. Accepted types are JPEG, PNG, and WebP, checked by file bytes, not the extension alone.
- **FR-25.** With `STORAGE_DRIVER=local`, the file is stored under `uploads/` and served at `GET /media/{uuid}.jpg|png|webp`.
- **FR-26.** Media responses allow cross-origin display (`Cross-Origin-Resource-Policy: cross-origin`) and are cacheable for a year.
- **FR-27.** S3 is a future driver. It stays off until `STORAGE_DRIVER=s3` and the AWS settings are all present.

### 6.6 Public read

- **FR-28.** `GET /api/public/finder` returns finder settings, counts, and published cards only. Cards include slug, name, area, city, state, address, phone, map URL, head name, and sort order. Cards omit email.
- **FR-29.** Counts are computed: number of published centres, distinct cities, distinct states. They are not the editable stat strings.
- **FR-30.** `GET /api/public/centres/:slug` returns the published centre, page templates, and day schedule. The detail includes email. An unknown slug and a draft both return 404 `{ "error": "Centre not found." }`.
- **FR-31.** Head is null when the name is empty. The public site hides the whole head block. The API does not invent a person.
- **FR-32.** When a name is set, an empty role becomes `Centre Head`, and empty since, quote, or notes become an em dash.
- **FR-33.** `head.firstName` strips a leading Ms, Mr, Mrs, or Dr, then takes the first remaining word.
- **FR-34.** Resolved strengths are at most 3. Facilities are at most 6.
- **FR-35.** An empty phone stays empty so the site can hide Call. An empty map URL stays empty so the site can fall back to a Google search of the name and address.
- **FR-36.** Public responses are `Cache-Control: no-store`.

## 7. Data collections

| Collection | Identity | Contents |
| --- | --- | --- |
| `admin_users` | email | name, role `admin`, password hash, `tokenVersion` |
| `centres` | slug | location, contact, status, head, hero, lists, `useNetworkDefaults` |
| `finder_settings` | key `finder` | SEO, hero, search, location, card, aliases, cities |
| `network_defaults` | key `defaults` | page templates, lists, day steps |

Centre status is `draft` or `published`. Sort order is 0–99999.

An image object is `{ storage, key, url, filename, contentType }`. For local storage, `key` equals `filename` and `url` is `/media/{filename}`.

## 8. API

Admin routes require the cookie. Bodies that fail validation return 400. JSON bodies over 1 MB return 413. Unknown `/api` paths return 404.

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/health` | no | `{ status: "CMS backend is running" }` |
| GET | `/api/db-health` | no | database connected or 503 |
| POST | `/api/auth/login` | no | sets cookie, returns admin |
| POST | `/api/auth/logout` | yes | clears cookie |
| GET | `/api/auth/me` | yes | current admin |
| PATCH | `/api/auth/password` | yes | replaces password |
| GET | `/api/admin/centres` | yes | paged list, filters `q`, `status`, `state`, `city` |
| GET | `/api/admin/centres/stats` | yes | published, drafts, city count, state count, 6 recent |
| POST | `/api/admin/centres` | yes | 201, creates a centre |
| GET | `/api/admin/centres/:id` | yes | one centre by Mongo id |
| PUT | `/api/admin/centres/:id` | yes | replaces the centre. Client omits `id` and `updatedAt` |
| DELETE | `/api/admin/centres/:id` | yes | deletes the centre |
| GET | `/api/admin/finder` | yes | finder document |
| PUT | `/api/admin/finder` | yes | replaces finder. Client omits `updatedAt` |
| GET | `/api/admin/defaults` | yes | defaults document |
| PUT | `/api/admin/defaults` | yes | replaces defaults |
| POST | `/api/admin/uploads` | yes | multipart `file`, 201 `{ image }` |
| DELETE | `/api/admin/uploads/:filename` | yes | 409 if the file is in use |
| GET | `/api/public/finder` | no | finder, counts, published cards |
| GET | `/api/public/centres/:slug` | no | resolved centre, page, day |
| GET | `/media/:filename` | no | image bytes, or 404 |

## 9. Admin screens

| Route | Screen |
| --- | --- |
| `/login` | Email and password. Signed-in users go to the dashboard. |
| `/` | Counts and recently updated centres. |
| `/centres` | Search, filters, list, link to edit, delete with slug confirmation. |
| `/centres/new` | Create. Status starts as draft. |
| `/centres/:id` | Edit every centre field, upload hero, publish or unpublish. |
| `/finder` | SEO, hero, search, location, card, aliases, cities. Save message: "Finder page saved." |
| `/defaults` | Page templates and shared lists. |
| `/account` | Change password, then sign out. |

Unknown admin paths return to the dashboard.

## 10. Seed

`npm run seed` loads centres, the finder document, network defaults, and the admin user from `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`.

HSR Layout head data is stored only on slug `hsr-layout-2`: Ms. Manasa Gowda, since 2013. Other centres keep an empty head unless an editor fills it.

## 11. Security

- Passwords are bcrypt hashes. The hash and `tokenVersion` are not returned to the client.
- The JWT secret must be at least 32 characters. Cookie is httpOnly. `Secure` follows `COOKIE_SECURE`, or production when that is unset.
- Helmet sets a content security policy. API responses send `X-Robots-Tag: noindex, nofollow`.
- Error text is redacted so the MongoDB URI, JWT secret, admin password, and AWS keys are not printed.
- The process refuses to start when `MONGODB_URI` or `JWT_SECRET` is missing. Atlas also refuses the connection when this computer’s public IP is not on the cluster Network Access list. That entry is added once per IP and kept until the IP changes or the entry expires.

## 12. Local run

From the CMS folder, in two terminals:

1. `npm run dev` — wait for `Connected to MongoDB Atlas` and `CMS running at http://localhost:3001`.
2. `npm run dev:admin` — open `http://localhost:5173`.

`STORAGE_DRIVER` stays `local`. `CLIENT_ORIGINS` includes `http://localhost:5173` and `http://localhost:5174`.

## 13. Acceptance

- A draft is absent from `GET /api/public/finder` and `GET /api/public/centres/:slug` returns 404. After publish, the card and the detail appear. After it is set back to draft or deleted, a refresh removes it.
- Changing a published phone is visible on the next public read of that centre.
- An empty head name produces `head: null`.
- Finder placeholder and other labels change on the next public finder read.
- An uploaded hero is reachable at `http://localhost:3001/media/{filename}` and can be shown on another local origin.
- Login with a bad password does not reveal which field was wrong. Nine login attempts inside 15 minutes are limited.
- Logout makes the previous cookie fail on `/api/auth/me`.
