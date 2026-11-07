# Implementation prompt — Little Elly content CMS

Copy everything below the line into a new Claude Code session opened at `D:\TCS_Internship\TCS\Clients\Little_elly` (the parent folder, so both projects are reachable).

---

You are a senior full-stack engineer, a senior UI/UX designer and a senior QA engineer working as one. Build the feature set in `little-elly-cms/docs/CONTENT_CMS_SPEC.md` exactly as written.

## Projects

- `little-elly-cms`: Express 5 + Mongoose 9 API (`src/`) and Vite + React 19 admin (`admin/`). Read `docs/SPEC.md` first. It describes the existing Find a Centre CMS, and its patterns are the patterns to follow (zod validation, `asyncHandler`, `requireAdmin`, origin check, rate limits, redaction, `storeImage`, `retireIfUnused`).
- `little-elly-grow`: TanStack Start (React 19, Tailwind 4) public site. Content is in `src/content/*` today. Components are in `src/components/site/*`.

## Rules

1. **The spec is the contract.** Build every numbered requirement (BR, IMG, BL, SEO, SC, UI, SEC, PERF, ST, SD, ENV). Add nothing the spec does not ask for. If the spec is ambiguous or conflicts with the code, stop and ask me. Do not guess.
2. **Public site UI is frozen.** Change only what spec §10 lists. Keep every class, animation, copy line and layout. Components switch from importing `src/content/*` to receiving props; their markup stays the same.
3. **Data:** all content in MongoDB Atlas (`MONGODB_URI` in `.env`). Exactly the 9 new collections in spec §4, with the listed fields, limits and indexes. Images on local disk (`STORAGE_DRIVER=local`).
4. **Security first:** zod strict schemas mirroring spec limits, server-side HTML allow-list sanitising, URL scheme checks, escaped JSON-LD, re-encoded images with metadata stripped, admin-only draft preview. Never log or return secrets. Never commit `.env`.
5. **No hard-coded hosts.** Everything from env (spec §12.5). It must work locally now and after hosting later without code changes.
6. **Copy:** short, plain, friendly. Labels ≤ 3 words, help ≤ 1 sentence, errors say what to do.
7. **Dependencies:** add only `sharp` and `sanitize-html` to the CMS. Pin exact versions. Add nothing to the site unless a spec item cannot be met without it, and ask first.

## Order of work

Work in these phases. At the end of each phase, run its checks, show me the result, and wait for my OK before the next phase.

1. **Models + validation + image pipeline**: spec §4, §6 (`sharp`, slots, variants, EXIF strip), and `imageIsUsed` across all collections. Tests for limits, slot rejection and sanitising.
2. **Admin API**: spec §9.1, BR-1 to BR-9 (featured transaction, trending cap, category 409, reorder). Tests for each BR.
3. **Public API + CMS preview data**: spec §9.2, BL-7. Tests: drafts never leak, 404s, preview is admin-only, response field allow-lists.
4. **Seed**: SD-1 to SD-3. Run it against Atlas. Report counts and any image warnings.
5. **Admin UI**: spec §11 (brand match, live card previews, crop step, counters, search preview, SEO health, accessibility). Check every screen in the browser at 360 px and 1440 px.
6. **Site integration**: spec §10 (SC-1 to SC-11), with the CMS stopped and started to prove SC-2 fallback. Before/after screenshots of every changed page at 360, 768 and 1440 px.
7. **Verification**: every acceptance criterion in spec §13, with automated tests where marked [T]. Lighthouse on production builds (PERF-1, PERF-2). `npm audit` in both projects. Report each criterion as pass or fail with evidence. Fix failures before reporting done.

## Definition of done

- All spec §13 criteria pass, with evidence (test output, screenshots, Lighthouse scores).
- `npm test` passes in the CMS, and `npm run build` and `npm run lint` pass in the site.
- `docs/SPEC.md` gets a short pointer to `CONTENT_CMS_SPEC.md`, and `.env.example` files are updated in both projects.
- A short summary of files changed per project, and anything left open.
