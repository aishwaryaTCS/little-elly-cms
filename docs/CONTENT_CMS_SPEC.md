# Little Elly CMS — Content, Blogs and SEO specification

**Version:** 1.0 (2026-11-07)
**Builds on:** [SPEC.md](SPEC.md) (Find a Centre). Nothing in that spec changes unless this document says so.
**Projects:**
- `little-elly-cms`: Express API + React admin. This document calls it **the CMS**.
- `little-elly-grow`: TanStack Start public website. This document calls it **the site**.

**Status:** to build. Local development first. Hosting is not decided, so nothing may depend on a specific host.

---

## 1. Goal

Admins manage the site's team, awards, programs, parent voices, news, blogs and SEO from the CMS. Published changes reach the site without a code change or redeploy. The site's existing look stays exactly as it is, except for the changes listed in §10.

## 2. Scope

### 2.1 In scope

| # | Area | Site location today |
| --- | --- | --- |
| 1 | Our Team (people + group photos) | `/about-us/` → `TeamSection` |
| 2 | Awards & recognition | `/about-us/` → `AwardsSection` |
| 3 | Programs (cards, carousel, new detail page) | Home `ProgramsSection`, `/our-programs/` |
| 4 | Parent voices | Home `VoicesSection` |
| 5 | News & events | Home `NewsSection` |
| 6 | Blog listing with "Show more" | `/blogs/` → `BlogsIndex` |
| 7 | Blog posts, categories, featured, trending, SEO, preview | `/blogs/`, `/blogs/{slug}` |
| 8 | SEO for every public page + global settings | All routes' `head()` |
| 9 | Image size rules for every upload slot | CMS uploads + site rendering |

### 2.2 Out of scope

- Any other section or page copy (hero, vision, philosophy, curriculum, franchise, careers, admissions forms, footer, navigation).
- Comments, likes, multi-author accounts, admin roles, scheduled publishing, revision history.
- S3, CDN or hosting setup. The code must stay ready for it (§12.5).
- Visual redesign of the site.

## 3. Actors

- **Admin**: the single CMS account from SPEC.md. Can do everything here.
- **Visitor**: reads published content on the site.
- **Search engine**: reads the site's HTML head, JSON-LD, robots and sitemap.

## 4. Data model (MongoDB Atlas)

Existing collections (`admin_users`, `centres`, `finder_settings`, `network_defaults`) stay unchanged.

Add exactly these 9 collections. Each document has `createdAt` and `updatedAt`. Every list collection has `status` (`draft` | `published`) and `sortOrder` (integer 0–9999), and an index on `{ status: 1, sortOrder: 1 }`.

### 4.1 Shared sub-documents (embedded, not collections)

**Image**: `{ storage, key, url, filename, contentType, width, height, alt }`. `alt` is required on save, 5–125 chars. `width` and `height` are the stored pixel size, set by the server.

**Seo**:

| Field | Rule |
| --- | --- |
| `metaTitle` | required, 10–60 chars |
| `metaDescription` | required, 50–160 chars |
| `keywords` | 0–10 strings, each 2–40 chars |
| `canonicalUrl` | optional. Absolute `https://` URL. Empty means the site uses `{SITE_ORIGIN}{path}`. |
| `robots` | `index,follow` (label "Show in search") or `noindex,nofollow` (label "Hide from search"). Default `index,follow`. |
| `ogImage` | optional Image, slot `share` (§6) |
| `schemaJsonLd` | optional. Must parse as a JSON object or array, max 10 KB, and must contain `@context` and `@type`. |

**Accent**: one of `coral`, `orange`, `yellow`, `turquoise`, `periwinkle`, `pink`, `cyan`. Stored as the name, rendered by the site as `var(--name)`. No free hex values.

### 4.2 Collections

| Collection | Key | Fields |
| --- | --- | --- |
| `team_members` | `_id` | `kind` (`person` \| `group`), `name` 2–40, `role` 2–50 (person only, required), `note` 0–90 (person) or `line` 0–120 (group), `photo` Image (slot `teamPerson` or `teamGroup`), `status`, `sortOrder` |
| `awards` | `_id` | `issuer` 2–40, `line` 10–90, `image` Image (slot `award`), `year` optional 1990–current, `status`, `sortOrder` |
| `programs` | `slug` unique | `name` 2–30, `ageLabel` 2–20 (e.g. `3 years +`), `shortAge` 2–8 (e.g. `3y+`), `line` 10–60, `longDescription` 50–400, `learn` exactly 3 items each 5–50, `skills` 4–8 items each 3–40, `ratio` `{ adults 1–5, children 1–30 }`, `accent` (home carousel), `pageAgeLabel` 2–20, `pageLine` 10–60, `pageAccent` (programs page and program page), `cardPhoto` Image (slot `programCard`), `photo` Image (slot `programDetail`), `seo` Seo, `status`, `sortOrder` |
| `testimonials` | `_id` | `lead` 5–50 (default "I am glad I chose Little Elly because"), `highlight` 10–140, `quote` 50–600, `name` 2–50, `role` 2–60 (e.g. `Mother of Riaan, Nursery`), `photo` Image (slot `voice`), `status`, `sortOrder` |
| `news_items` | `_id` | `tag` 2–20, `title` 5–60, `line` 10–140, `accent`, `image` Image (slot `news`), `eventDate` optional, `link` optional (relative path or `https://` URL), `status`, `sortOrder` |
| `blog_categories` | `slug` unique | `name` 2–30, `accent`, `sortOrder` |
| `blog_posts` | `slug` unique | `title` 10–110, `excerpt` 50–200, `category` ObjectId → `blog_categories`, `author` 2–60, `publishedAt` date, `coverImage` Image (slot `blogCover`), `blocks` (§4.3), `featured` boolean, `trending` boolean, `trendingOrder` 1–6, `seo` Seo, `status` |
| `page_seo` | `pageKey` unique | `path` (read-only, §8.1), `seo` Seo, `sections` (headings for managed sections, §4.4) |
| `site_settings` | `key: "site"` | §8.2 |

Indexes: `blog_posts` on `{ status: 1, publishedAt: -1 }`, `{ status: 1, category: 1, publishedAt: -1 }`, `{ featured: 1 }` (unique where `featured: true`, so only one post can be featured), `{ trending: 1, trendingOrder: 1 }` (unique where `trending: true`, so no two posts share a place). Unique on every filled `slug` (drafts may be saved without one) and on `page_seo.pageKey`. The API syncs these indexes on start.

Slugs match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 120 chars. The CMS suggests a slug from the title. Changing the slug of a published post or program shows a warning that old links will break.

### 4.3 Blog content blocks

Same shapes the site already renders (`src/content/blog-articles.ts`), plus `h3`:

| Type | Fields | Rules |
| --- | --- | --- |
| `p` | `text` | 1–3000 chars |
| `h2`, `h3` | `text` | 2–120 chars, plain text |
| `ul`, `ol` | `items[]` | 1–30 items, each 1–1000 chars |
| `image` | Image (slot `blogInline`) | alt required |
| `table` | `head[]`, `rows[][]` | 2–6 columns, 1–40 rows, each cell ≤ 300 chars, every row has `head.length` cells |

A post has 1–200 blocks. Inline HTML is allowed only in `p`, list items and table cells. The server allows only `<strong> <em> <b> <i> <a href> <br>`. `href` must be `https://`, `mailto:`, `tel:` or a relative path. External links get `rel="noopener noreferrer"` and `target="_blank"`. The server strips everything else before saving.

### 4.4 Section headings

The kicker, headline and lead above each managed section move to `page_seo.sections`, so admins can edit them with the list:

| `pageKey` | Section key | Fields |
| --- | --- | --- |
| `about` | `team`, `awards` | `kicker` ≤ 30, `headline` [2 lines, each ≤ 30], `lead` ≤ 160 (awards only) |
| `home` | `programs`, `voices`, `news` | same. `news` also has `instagramHandle`, `instagramUrl` |
| `blogs` | `hero` | `kicker`, `headline`, `lead` ≤ 220, `pageSize` 3–24 (default 9) |

The second headline line is always the accented line (`accentIndex: 1`), as on the site today.

## 5. Behaviour rules

- **BR-1.** Only `published` items reach the site. Drafts never appear in a public response or the sitemap.
- **BR-2.** Lists are ordered by `sortOrder` ascending, then `createdAt`. The admin reorders with up/down buttons, and the CMS rewrites `sortOrder` in steps of 10.
- **BR-3.** Publishing requires every required field, including all images and their alt text. Drafts may be incomplete. The validation message names the missing field.
- **BR-4.** Minimum published counts so the site layout never breaks:

| Section | Min | Max | When below the minimum |
| --- | --- | --- | --- |
| Team people | 1 | 12 | Section hidden |
| Team groups | 0 | 4 | Group row hidden |
| Awards | 1 | 20 | Section hidden |
| Programs | 1 | 7 | Home section and programs list hidden |
| Parent voices | 1 | 12 | Section hidden |
| News & events | 1 | 6 (3-column grid, as today) | Section hidden |
| Trending posts | 0 | 6 | Aside shows the 6 newest posts |

Unpublishing or deleting the last published item asks for confirmation ("This hides the section on the website.").

- **BR-5.** Featured post: at most one. Setting a post as featured clears the flag on any other post in the same database transaction. With none set, the newest published post is featured. A featured post must be published.
- **BR-6.** Trending: up to 6 published posts with `trendingOrder` 1–6. A 7th is rejected with "Remove a trending post first." Unpublishing a post clears its featured and trending flags.
- **BR-7.** Categories: deleting a category that still has posts returns 409 "Move its posts to another category first." Renaming one updates every post on the next read because posts store the id.
- **BR-8.** Deleting any item retires its images with the existing `retireIfUnused` rule. `imageIsUsed` must check every collection in §4 that stores images.
- **BR-9.** Every delete asks for confirmation. Deleting a blog post or program requires typing its slug.

## 6. Image rules

Every image belongs to a **slot**. The slot fixes the aspect ratio so the site and the CMS show the same, uncropped image.

| Slot | Used for | Aspect | Min size (px) | Stored widths | Site display |
| --- | --- | --- | --- | --- | --- |
| `teamPerson` | Team person card | 3 : 4 | 768 × 1024 | 900, 450 | `object-cover`, ratio matches card |
| `teamGroup` | Team group photo | 16 : 10 | 1024 × 640 | 1600, 800 | `object-cover`, ratio matches card |
| `award` | Award image | free, 1 : 1.6 to 1.6 : 1 | long side ≥ 600 | 1200, 400 | `object-contain` (no crop by design) |
| `programCard` | Home carousel circle | 1 : 1 | 1000 × 1000 | 1000, 500 | circle mask (preview in CMS shows the mask) |
| `programDetail` | Programs page chapter + detail page | 4 : 3 | 1024 × 768 | 1600, 800 | `object-cover`, ratio matches frame |
| `voice` | Parent voice photo | 16 : 10 | 1024 × 640 | 1280, 640 | `object-cover`, ratio matches frame |
| `news` | News card | 16 : 9 | 1024 × 576 | 1280, 640 | `object-cover`, ratio matches card |
| `blogCover` | Blog card, featured, article top | 16 : 9 | 1024 × 576 | 1600, 800 | as today |
| `blogInline` | Image block in a post | free, ≤ 3 : 1 and ≥ 1 : 2 | width ≥ 1000 | 1600, 800 | natural ratio, never cropped |
| `share` | Open Graph / search share image | 1.91 : 1 | 1200 × 630 | 1200 | not shown on page |
| `logo` | Organisation logo (site settings) | free, 1 : 4 to 4 : 1 | long side ≥ 112 | 512 | search results only |

- **IMG-1.** `POST /api/admin/uploads` takes `slot` as a form field. Unknown slots return 400. An upload without `slot` keeps the Find a Centre behaviour from SPEC.md FR-24 (original file, 5 MB), so the centre screens work unchanged.
- **IMG-2.** Input: JPEG, PNG or WebP, sniffed by bytes, max 8 MB, max 40 megapixels.
- **IMG-3.** The server reads the real pixel size with `sharp`. When the ratio differs from the slot ratio by more than 1%, or the image is below the minimum, it returns 400 with the required size, e.g. "Use a 3:4 photo at least 900 × 1200 px. This one is 1200 × 900."
- **IMG-4.** Before upload, the CMS checks the file in the browser. When the ratio is wrong, the CMS opens a crop step locked to the slot ratio, and the admin chooses the framing. The server still validates (IMG-3).
- **IMG-5.** The server auto-rotates from EXIF, strips all metadata (including GPS; these are photos of children), and saves WebP at each stored width (quality 80). The largest width is the `url`. The `variants` list (`[{ width, url }]`) is returned for `srcset`.
- **IMG-6.** The site renders CMS images with `width`, `height`, `srcset`, `sizes`, and `loading="lazy"` below the fold, so there is no layout shift.
- **IMG-7.** Each upload field in the CMS shows its rule under the field, e.g. "3:4 portrait · min 900 × 1200 px · JPG, PNG or WebP · max 8 MB".

## 7. Blog requirements

### 7.1 Admin

- **BL-1.** List: search by title or slug, filter by status, category, featured, trending. 20 per page. Columns: cover thumbnail, title, category, status, published date, flags, updated.
- **BL-2.** Editor tabs: **Content** (title, slug, category, author, published date, excerpt, cover, blocks), **SEO** (§4.1 fields + search preview), **Visibility** (status, featured, trending + order).
- **BL-3.** The block editor adds, edits, reorders (up/down), duplicates and removes blocks. It has bold, italic and link for inline text, and checks link URLs before saving.
- **BL-4.** Search preview shows the Google result as it will look: title truncated at 60 chars, URL (`littleelly.com › blogs › slug`), and description truncated at 160. It updates while typing. Counters turn amber near the limit and red over it.
- **BL-5.** Empty SEO fields fall back on read: `metaTitle` ← title, `metaDescription` ← excerpt, `ogImage` ← cover. The SEO tab shows these fallbacks as placeholders. Publishing does not require separate SEO entry.
- **BL-6.** Schema markup: the site always outputs `BlogPosting` JSON-LD generated from the post (headline, description, image, author, datePublished, dateModified, mainEntityOfPage, publisher from site settings). `schemaJsonLd`, when set, is added as an extra script and does not replace it.
- **BL-7.** **Preview** is a screen inside the CMS at `/blogs/{id}/preview`, behind the admin sign-in. There is no shareable link and nothing on the public site. It shows the **last saved** post (draft or live) in the website's article layout: title, category, date, author, cover, blocks, Trending aside and related posts, built with the site's fonts, colours and spacing. A bar at the top reads "Only you can see this." with "Back to editor". With unsaved changes, the editor's Preview button shows "Save the draft to preview." instead of opening. Preview is offered in the editor and in the posts list once a post has been saved.
- **BL-8.** Categories screen: add, rename, set accent, reorder, delete (BR-7). The site's category filter tabs read from this list: "All" + categories with at least one published post.
- **BL-9.** Blog settings live in `page_seo` `blogs` (hero copy, `pageSize`).

### 7.2 Site

- **BL-10.** `/blogs/` shows the featured post (BR-5), then the first `pageSize` other posts, newest first. A "Show more" button below the grid adds the next `pageSize`. It disappears when nothing is left. It keeps the active category and search. Search covers all published posts, not only the loaded ones.
- **BL-11.** "Show more" uses the same button style as the site's existing pill buttons. Label "Show more stories". While loading, the button is disabled and shows "Loading…".
- **BL-12.** `/blogs/{slug}` renders title, category, date, author, cover, blocks, Trending aside (BR-6 order) and related posts (same category first, max 8), as today.
- **BL-13.** Unknown or draft slugs return the existing "We couldn't find that story." page with HTTP 404 and `noindex`.

## 8. Site SEO

### 8.1 Pages

`page_seo` holds one document per public route. The seed creates them from today's `head()` values:

| `pageKey` | Path | Default robots |
| --- | --- | --- |
| `home` | `/` | index |
| `about` | `/about-us/` | index |
| `programs` | `/our-programs/` | index |
| `curriculum` | `/curriculum/` | index |
| `admissions` | `/admissions/` | index |
| `franchise` | `/franchise/` | index |
| `careers` | `/careers` | index |
| `blogs` | `/blogs/` | index |
| `dubai` | `/dubai` | as today |
| `franchiseDeck` | `/franchise-deck` | as today |
| `privacy` | `/privacy-policy/` | index |
| `terms` | `/terms-conditions/` | index |
| `admissionsCampaign` | `/admissions-campaign/` | noindex |
| `franchiseCampaign` | `/franchise-campaign/` | noindex |
| `thankYou` | `/thank-you/` | noindex |

`/centres/` keeps its SEO in `finder_settings` (SPEC.md FR-15) and is not duplicated here. Program detail and blog pages use their own `seo`.

- **SEO-1.** Every page outputs: `<title>`, meta description, meta keywords (only when set), robots, canonical, `og:title`, `og:description`, `og:image` (absolute URL), `og:url`, `og:type`, `twitter:card summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
- **SEO-2.** The title is `metaTitle` as entered. The site does not add a suffix twice.
- **SEO-3.** JSON-LD is written with `<`, `>` and `&` escaped as `<`, `>` and `&`, so stored text cannot close the script tag.
- **SEO-4.** The sitemap includes every `index,follow` page, published program and published post, with `lastmod` = `updatedAt`. It leaves out `noindex` items. `robots.txt` stays as it is.
- **SEO-5.** The CMS shows SEO health per page and post: missing description, title over 60, description over 160, missing share image, duplicate title across pages/posts.

### 8.2 Site settings (`site_settings`)

| Field | Rule |
| --- | --- |
| `siteName` | "Little Elly", 2–40 |
| `siteOrigin` | `https://littleelly.com`, absolute https URL. Builds canonicals. |
| `defaultShareImage` | Image, slot `share` |
| `organization` | `legalName`, `logo` (Image), `phone`, `email`, `sameAs` (0–8 https profile URLs) → `Organization` / `Preschool` JSON-LD on `/` |
| `googleSiteVerification` | optional, ≤ 100 chars, `[A-Za-z0-9_-]` only |

## 9. API

All admin routes need the `le_cms` cookie and follow SPEC.md's origin, rate-limit, 400/413 and redaction rules. Request bodies are validated with zod, using the same limits as §4.

### 9.1 Admin (CRUD pattern)

For each resource `R` in `team`, `awards`, `programs`, `testimonials`, `news`, `blog-categories`, `blog-posts`:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/admin/{R}` | list (blog-posts: paged + filters) |
| GET | `/api/admin/{R}/:id` | one |
| POST | `/api/admin/{R}` | 201, created as draft |
| PUT | `/api/admin/{R}/:id` | replace |
| PATCH | `/api/admin/{R}/:id/status` | `{ status }`, runs publish validation |
| POST | `/api/admin/{R}/reorder` | `{ ids: [] }` in new order |
| DELETE | `/api/admin/{R}/:id` | delete + retire images |

Plus:

| Method | Path | Result |
| --- | --- | --- |
| PATCH | `/api/admin/blog-posts/:id/flags` | `{ featured?, trending?, trendingOrder? }` (BR-5, BR-6) |
| GET | `/api/admin/blog-posts/:id/preview` | `{ post, related, trending, status }` in the public article shape, any status (BL-7) |
| GET / PUT | `/api/admin/page-seo/:pageKey` | one page's SEO + sections |
| PATCH | `/api/admin/page-seo/:pageKey/sections/:section` | one section heading (§4.4), checked on its own so long legacy SEO text cannot block it |
| GET | `/api/admin/image-slots` | size rules and help text per image slot (IMG-4, IMG-7) |
| GET | `/api/admin/page-seo` | all pages with health flags |
| GET / PUT | `/api/admin/site-settings` | settings |
| POST | `/api/admin/uploads` | multipart `file` + `slot` (§6) |

PUT bodies must not contain `_id`, `createdAt`, `updatedAt`, `status`, `sortOrder` or flags. Those are changed only through their own routes. A PUT on a published item is checked with the publish rules. Team items cannot change `kind`.

Confirmations:
- BR-4 last live item: `PATCH …/status` with `{ status: "draft", hideSection: true }`, or `DELETE …?hideSection=true`. Without it, the API answers 409 `{ error: "This hides the section on the website.", needsConfirm: true }`.
- BR-9 typed slug: `DELETE /api/admin/programs/:id?confirm={slug}` and the same for blog posts.

`GET /api/admin/content-stats` returns the dashboard counts and the 5 most recent items (UI-9). Blog posts are ordered by date and have no reorder route.

### 9.2 Public (no auth, published only, 120/min/IP)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/public/site` | site settings + every `page_seo` doc (noindex pages included, so the site can send their `robots` tag) |
| GET | `/api/public/about` | team people, team groups, awards, about sections |
| GET | `/api/public/home` | programs (card fields), testimonials, news, home sections |
| GET | `/api/public/programs` | all published programs (full) |
| GET | `/api/public/programs/:slug` | one program, 404 `{ error: "Program not found." }` |
| GET | `/api/public/blogs?category=&q=&page=&limit=` | `{ featured, posts, total, page, pageSize, categories, trending }`. `limit` ≤ 24. `q` ≤ 80 chars, regex-escaped. |
| GET | `/api/public/blogs/:slug` | post + related + trending, 404 `{ error: "Story not found." }` |
| GET | `/api/public/sitemap` | `[{ path, lastmod }]` for SEO-4 |

Public responses never include `_id` of admin users, drafts, internal storage keys or any field not used by the site. They send `Cache-Control: no-store` (SPEC.md FR-36).

Response details:
- Images are `{ url, width, height, alt, variants: [{ width, url }] }`. Local URLs are relative (`/media/…`); the site prefixes `CMS_MEDIA_URL` (SC-4).
- SEO is resolved: empty title, description and share image fall back (BL-5; programs use name, line and photo). An empty canonical becomes `{siteOrigin}{path}`. `schemaJsonLd` is a parsed object or `null`.
- `sections` is `null` until the page has headings saved. The site then keeps its bundled copy (SC-2).
- `/blogs` also returns `hasMore` and `sections`. Without `q`, the featured post is left out of `posts`. With `q`, every post is searched, including the featured one, matching title, excerpt or category name.
- Blog image blocks use the site's existing shape `{ type: "image", src, alt, width, height, variants }`.
- The public API has no preview route. Drafts are reachable only through the admin preview (BL-7), which sends `X-Robots-Tag: noindex, nofollow`.

## 10. Site changes (`little-elly-grow`)

Only these changes are allowed on the site. Everything else, including markup, classes, animations and copy, stays the same.

- **SC-1.** Add `src/lib/cms.server.ts`, a server-only client used from route loaders (`createServerFn`). It reads `CMS_API_URL` and `CMS_MEDIA_URL` from env. Request timeout 3 s.
- **SC-2.** Resilience: keep the last good response per endpoint in memory for 60 s, and serve it while fresh. When the CMS fails, serve the last good response. When there is none, serve today's bundled content in `src/content/*`. A CMS outage never breaks a page.
- **SC-3.** Components keep their markup. They take data as props instead of importing `src/content/*`: `TeamSection`, `AwardsSection`, `ProgramsSection`, `ProgramChaptersPhoto`, `ProgramsHero` (steps), `VoicesSection`, `NewsSection`, `BlogsIndex`, `BlogArticle`, and each route's `head()`.
- **SC-4.** CMS image URLs are made absolute with `CMS_MEDIA_URL`. They must not collide with the site's own `/media/photos/*` files.
- **SC-5.** Programs:
  - Home rail label width becomes `100% / count` instead of `w-1/5`.
  - "Explore all five programs" becomes "Explore all programs".
  - The carousel's active program gets a "View program" text link (same style as the existing arrow link) to `/our-programs/{slug}/`.
  - On `/our-programs/`, each chapter gets the same link. The chapter photo frame changes from fixed heights (`h-[340px] sm:h-[420px]`) to `aspect-[4/3]`, to match slot `programDetail`.
  - The hero steps list comes from the published programs.
- **SC-6.** New route `/our-programs/$slug/`. It is built only from existing site components and styles: SiteNav, a hero with accent, age chip, name, line and `programDetail` photo; the ratio chip; long description; "What they learn" (`learn`, check-list style from the home carousel); "Skills" (`skills`); the existing `VisitSection`; SiteFooter. It has its own SEO (§4.1) plus `BreadcrumbList` JSON-LD. Unknown or draft slugs return 404.
- **SC-7.** News card image container changes from `h-52` to `aspect-[16/9]` (slot `news`, same height at desktop width). The card uses the item's own image instead of the fixed `NEWS_PHOTOS`. A card with `link` becomes a link.
- **SC-8.** `BlogsIndex` gets "Show more" (BL-10, BL-11). Categories come from the CMS.
- **SC-10.** Sitemap merges `/api/public/sitemap` into the existing generator (SEO-4).
- **SC-11.** Env additions in `.env.example`: `CMS_API_URL=http://localhost:3001`, `CMS_MEDIA_URL=http://localhost:3001`.

Build notes (phase 6):
- The site runs locally on port 5174 (`npm run dev -- --port 5174`).
- SC-2 also waits 30 s after a failed call before trying the CMS again, so an outage does not slow every page by the 3 s timeout.
- BL-10 is done in the browser: the site loads every live card (no story text) once, and "Show more stories" reveals `pageSize` more. Search and category tabs stay instant and cover all posts.
- Blog pages keep the site's title format "{title} — Little Elly" until an admin sets a search title.
- Other public pages take their SEO from `page_seo` with their old head values as the fallback. `/careers`, `/dubai` and `/franchise-deck` have no trailing slash, matching their real addresses.
- The sitemap index adds `cms-sitemap.xml`; the existing sitemap files are unchanged.

## 11. Admin UI (`little-elly-cms/admin`)

- **UI-1.** Visual language matches the site: Fredoka for headings, Poppins for body, tokens `--coral #e85253`, `--ink #09094d`, `--cream #fff8f3`, `--turquoise #09bab7`, `--periwinkle #a6a5fe`, `--yellow #ffd541`, `--orange #ff9008`, `--pink #ed9fb6`, `--cyan #42c4e1`. Rounded cards and pill buttons as on the site. Browser tab title "Little Elly CMS".
- **UI-2.** Navigation:
  - Dashboard
  - Website: Team, Awards, Programs, Parent voices, News & events
  - Blogs: Posts, Categories, Blog page
  - Centres: existing screens
  - SEO: Pages, Site settings
  - Account
- **UI-3.** Every list shows thumbnail, main text, status chip, up/down order buttons, Edit, Publish/Unpublish and Delete. Empty state: one short line + "Add {item}".
- **UI-4.** Every form shows a live **card preview** that uses the site's card layout and the slot ratio, so the admin sees exactly what the site will show.
- **UI-5.** Character counters on every limited field. Inline errors under the field. Save button disabled while saving. Success toast "Saved." / "Published." Leaving a form with unsaved changes asks for confirmation.
- **UI-6.** Text in the CMS is short and plain: labels ≤ 3 words, help text ≤ 1 sentence, errors say what to do ("Add alt text for the photo.").
- **UI-7.** Accessibility: every control has a label, focus is visible, keyboard works everywhere including reorder and crop, colour contrast ≥ 4.5 : 1, and dialogs trap focus and close on Esc.
- **UI-8.** Responsive from 360 px wide to desktop with no horizontal scroll.
- **UI-9.** Dashboard adds counts per content type (published / drafts) and the 5 most recently updated items across all types.

## 12. Non-functional

### 12.1 Security

- **SEC-1.** Every change in SPEC.md §11 still applies to new routes.
- **SEC-2.** All input is validated with zod (strict objects; unknown keys rejected). ObjectIds are validated before queries. Queries never use raw user objects (no operator injection). Search text is regex-escaped.
- **SEC-3.** HTML sanitising follows §4.3, with an allow-list library (`sanitize-html`) on the server. The site renders only sanitised HTML.
- **SEC-4.** URLs (`link`, `canonicalUrl`, `sameAs`, inline `href`) reject `javascript:`, `data:` and `vbscript:`.
- **SEC-5.** JSON-LD is validated on save and escaped on output (SEO-3).
- **SEC-6.** Uploads are re-encoded by `sharp` (IMG-5). The original bytes are never served.
- **SEC-7.** Preview is admin-only (session cookie) and read-only. Drafts are never served by a public route.
- **SEC-8.** No secrets in the site bundle. `CMS_API_URL` is used only server-side.
- **SEC-9.** `npm audit` reports no high or critical issues in either project.

### 12.2 Performance

- **PERF-1.** Lighthouse mobile on `/`, `/about-us/`, `/our-programs/`, a program page, `/blogs/` and a blog post: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO = 100. Measured on a production build (`vite build` + `vite preview`), not dev.
- **PERF-2.** CMS admin Lighthouse (desktop): Accessibility ≥ 95, Best Practices ≥ 95.
- **PERF-3.** Public API p95 < 150 ms locally against Atlas with seeded data. Lean queries, projections and indexes from §4.
- **PERF-4.** No layout shift from CMS images (IMG-6). CLS < 0.1.
- **PERF-5.** The blog list API returns only card fields, never `blocks`.

### 12.3 Storage

- **ST-1.** All content lives in Atlas. Images live in `uploads/` locally (`STORAGE_DRIVER=local`).
- **ST-2.** The S3 key prefix becomes `media/{slot}/` (was `centres/`). Existing centre images keep working.

### 12.4 Seed / migration

- **SD-1.** `npm run seed:content` loads today's site content from `src/seed/content/site-content.json` (a snapshot of `little-elly-grow/src/content` and each route's `head()`): 4 people, 2 groups, 5 awards, 5 programs, 4 voices, 3 news, 3 categories, all 29 posts with articles (26 on the blog index, live; the 3 from `extra-articles.ts` are not on today's blog page, so they are seeded as drafts and their links stay off until an admin publishes them), the site's first post as featured, 15 `page_seo` docs (with section headings) and site settings (name, origin, logo, footer phone/email, social profiles).
  - Posts with no author get "Little Elly Team". `<strong>` inside headings is removed; a "heading" over 120 characters is stored as a paragraph. Same-day posts keep the site's order.
  - Programs take name, age, line, learn points and accent from the home carousel; the programs-page age wording, line and colour (`pageAgeLabel`, `pageLine`, `pageAccent`), description, skills and ratio from the programs page. SEO is generated: "{name} Program ({age}) | Little Elly" and the description cut at a sentence.
  - An item that fails a publish rule is saved as a draft and listed.
  - Page SEO is copied exactly, even when it is over the limits; SEO health lists it for an admin to shorten.
- **SD-2.** It copies the matching photos from `SITE_PUBLIC_DIR` (default `../little-elly-grow/public`) through the same image pipeline (§6). A photo below its slot's size or shape is still copied, as WebP with metadata removed, and marked `needsReplacing: true` (never sent to the public site). The console lists each one with the size it needs. Photos copied for items that were not saved are removed again.
- **SD-3.** Safe to run again. A content type is loaded only while its collection is empty, and no photo is copied for a type that is skipped. Page SEO and site settings are added only where missing. Admin edits are never overwritten, and items an admin deleted do not come back.

### 12.5 Environments

- **ENV-1.** No hard-coded host. Every origin comes from env: CMS `CLIENT_ORIGINS`; site `CMS_API_URL`, `CMS_MEDIA_URL`.
- **ENV-2.** `.env.example` in both projects lists every variable with a safe placeholder.
- **ENV-3.** Local run: CMS API `:3001`, admin `:5173`, site `:5174` (or the site's own Vite port, added to `CLIENT_ORIGINS`).

## 13. Acceptance criteria

Each line is checked by hand and, where marked **[T]**, by an automated test in `tests/`.

1. Adding a published team person shows a new card on `/about-us/` after a reload. As a draft, it does not. **[T]**
2. Reordering awards changes the carousel order and the "Award 01 of NN" count.
3. Adding a 6th program shows six rail stops with readable labels on mobile (360 px) and desktop. "View program" opens `/our-programs/{slug}/` with every field shown. A draft program's URL returns 404. **[T]**
4. A new parent voice joins the auto-rotating carousel and its dot.
5. A news item with a 16:9 image shows uncropped. A link item opens its link.
6. With 30 posts and `pageSize` 9, `/blogs/` shows the featured post + 9 cards. "Show more" adds 9 more until all appear, then hides. Category filter + Show more stay consistent. **[T]**
7. Setting post B as featured clears post A in one step. A 7th trending post is rejected. **[T]**
8. Post SEO: title, description, keywords, canonical, robots, OG image and JSON-LD appear in the page HTML source (view-source, not devtools). "Hide from search" outputs `noindex,nofollow` and drops the post from the sitemap. **[T]**
9. A stored `</script><script>alert(1)</script>` in any text or JSON-LD field renders as text, and no script runs. A `javascript:` link is rejected on save. **[T]**
10. Uploading a 4:3 photo to a 3:4 slot opens the crop step. Sending it directly to the API returns 400 with the size message. The stored file is WebP with no EXIF/GPS. **[T]**
11. Deleting an item removes its unused image files. Deleting a category with posts returns 409. **[T]**
12. In the CMS, Preview shows the last saved draft in the article layout with "Only you can see this." Signed out, it returns to sign-in. With unsaved changes, it shows "Save the draft to preview." There is no public URL for a draft. **[T]**
13. With the CMS stopped, every site page still renders (last good or bundled content).
14. Lighthouse targets in PERF-1 and PERF-2 are met.
15. Visual check: apart from §10, every site page looks identical before and after, at 360, 768 and 1440 px.
16. All existing tests in `tests/boundaries.test.js` still pass.
