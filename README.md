# SendWhats — multi-tenant WhatsApp broadcast platform

A general-purpose SaaS for sending targeted WhatsApp messages to the people an
organization is responsible for. Schools are the first fully-specified vertical
(classes, guardian numbers, gender-filtered sending), but nothing is hardcoded to
"school": everything is **Organization → Group → Contact**, and an organization's `type`
only drives labels, custom fields and the default message template.

| Generic       | School                 | Clinic     |
| ------------- | ---------------------- | ---------- |
| Organization  | School                 | Clinic     |
| Group         | Class                  | Department |
| Contact       | Student                | Patient    |
| Custom fields | guardian_phone, gender | gender     |

## Repository layout

```
apps/api          Express + TypeScript REST API (auth, tenants, groups, contacts)
apps/worker       BullMQ send worker — paces every message per WhatsApp number
apps/admin-web    Next.js admin console (org-type aware UI)
packages/shared   Org-type schemas, phone normalization, template rendering
packages/core     Server-side shared code: Prisma, env, Evolution client, queue, sender
```

`packages/shared` is the single source of truth for what a vertical means — the API
validates against it, the worker will render templates with it, and the web UI labels
its screens from it. Adding a vertical is a config entry, not a code path.

## Quick start

```bash
cp .env.example .env          # set EVOLUTION_API_URL / EVOLUTION_API_KEY / JWT_SECRET
npm install
npm run build -w @sendwhats/shared
npx prisma generate --schema apps/api/prisma/schema.prisma

docker compose up -d postgres redis
npm run prisma:migrate -w @sendwhats/api    # apply the schema
npm run seed                                 # super admin + demo school + demo company

npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:3000
```

Full stack in containers (API + worker + Postgres + Redis; migrations run at boot):

```bash
docker compose up -d --build
curl http://localhost:4000/health
```

### Seeded logins

| Role        | Email                      | Password           |
| ----------- | -------------------------- | ------------------ |
| Super admin | `admin@sendwhats.local`    | `ChangeMe123!`     |
| School org  | `owner@demo-school.local`  | `DemoSchool123!`   |
| Generic org | `owner@demo-company.local` | `DemoCompany123!`  |

Set `SEED_DEMO=false` to seed only the super admin. Change these before any real
deployment — they exist for local development.

## API surface (v1)

| Method           | Path                                  | Notes                                                          |
| ---------------- | ------------------------------------- | -------------------------------------------------------------- |
| GET              | `/health`                             | Liveness + database check                                       |
| POST             | `/api/v1/auth/login`                  | Returns JWT + org context                                       |
| GET              | `/api/v1/auth/me`                     | Current user + org context                                      |
| POST             | `/api/v1/auth/change-password`        |                                                                 |
| GET              | `/api/v1/admin/org-types`             | Vertical definitions (super admin)                              |
| GET/POST         | `/api/v1/admin/organizations`         | List / onboard an organization                                  |
| GET/PATCH/DELETE | `/api/v1/admin/organizations/:id`     |                                                                 |
| POST             | `/api/v1/admin/organizations/:id/users` | Add an owner/staff user                                       |
| GET              | `/api/v1/org/context`                 | Labels, custom fields, counts, instance state, templates        |
| GET              | `/api/v1/org/users`                   |                                                                 |
| GET/POST         | `/api/v1/groups`                      | Classes / departments / groups                                  |
| PATCH/DELETE     | `/api/v1/groups/:id`                  | Contacts survive group deletion (they become ungrouped)         |
| GET/POST         | `/api/v1/contacts`                    | Filters: `search`, `groupId`, `cf.<field>` (e.g. `cf.gender=female`) |
| GET/PATCH/DELETE | `/api/v1/contacts/:id`                |                                                                 |
| POST             | `/api/v1/contacts/bulk`               | delete / activate / deactivate / move                           |
| GET              | `/api/v1/import/columns`              | Expected sheet columns for this org type                        |
| GET              | `/api/v1/import/template`             | Downloads the `.xlsx` template for this org type                |
| POST             | `/api/v1/import/preview`              | Uploads a sheet, validates it, stores a pending batch           |
| GET              | `/api/v1/import/batches/:id`          |                                                                 |
| POST             | `/api/v1/import/batches/:id/commit`   | Applies the previewed rows (`excludeRowNumbers` to skip some)   |
| POST             | `/api/v1/import/batches/:id/cancel`   |                                                                 |
| GET              | `/api/v1/instance`                    | Stored connection state (no call to Evolution)                  |
| GET              | `/api/v1/instance/status`             | Reconciles with Evolution, then returns state — polled by the UI |
| POST             | `/api/v1/instance/connect`            | Returns a QR image (and pairing code) to scan                   |
| POST             | `/api/v1/instance/logout`             | Ends the WhatsApp session, keeps the instance                   |
| POST             | `/api/v1/instance/replace-number`     | Logout + fresh QR, for a banned or rotated number               |
| POST             | `/api/v1/instance/provision`          | Retries provisioning if onboarding happened while Evolution was down |
| PATCH            | `/api/v1/instance/limits`             | Per-instance messages/minute and /day caps                      |
| POST             | `/api/v1/admin/organizations/:id/instance/provision` | Super admin, `?force=true` to recreate           |
| GET              | `/api/v1/admin/organizations/:id/instance/status`    | Super admin                                       |
| DELETE           | `/api/v1/admin/organizations/:id/instance`           | Deletes the instance on the Evolution server      |
| POST             | `/api/v1/webhooks/evolution/:instanceName`           | Evolution posts connection + delivery events here |
| GET              | `/api/v1/ops/audit`                   | Who did what, filterable, tenant-scoped                         |
| GET              | `/api/v1/ops/alerts`                  | Things to act on: disconnects, stalled sends, missing consent   |
| GET              | `/api/v1/ops/analytics`               | Sending performance over `?days=` (default 30)                  |
| POST             | `/api/v1/campaigns/:id/schedule`      | Sends the prepared messages at a future time                    |
| POST             | `/api/v1/campaigns/:id/unschedule`    | Cancels the schedule, back to draft                             |
| POST/PATCH/DELETE | `/api/v1/org/users`, `/org/users/:id` | Owner-managed team; last active owner is protected             |
| POST             | `/api/v1/campaigns/preview`           | Live recipient count + personalized preview                     |
| GET/POST         | `/api/v1/campaigns`                   | List / create a draft with its recipients resolved              |
| GET/PATCH/DELETE | `/api/v1/campaigns/:id`               | Detail with per-recipient rows; edits re-render prepared texts  |
| GET/POST         | `/api/v1/templates`                   | Message templates, placeholders, valid merge targets            |
| PATCH/DELETE     | `/api/v1/templates/:id`               |                                                                 |
| POST             | `/api/v1/templates/render`            | Renders a template body against a real contact                  |
| POST             | `/api/v1/uploads`                     | Attachment upload (images, PDF, Office, text)                   |
| GET              | `/api/v1/uploads/:orgId/:fileName`    | Tenant-checked attachment download                              |
| POST             | `/api/v1/campaigns/:id/send`          | Hands the prepared messages to the queue                        |
| POST             | `/api/v1/campaigns/:id/pause`         | Stops sending; queued messages are kept                         |
| POST             | `/api/v1/campaigns/:id/resume`        | Re-queues what is left                                          |
| POST             | `/api/v1/campaigns/:id/cancel`        | Marks unsent messages cancelled                                 |
| GET              | `/api/v1/campaigns/:id/progress`      | Small polling payload for the live dashboard                    |

### Tenant isolation

Every org-scoped route runs through `requireOrg`, which pins org users to their own
`organizationId` — an explicit `orgId` query param or `X-Org-Id` header that isn't theirs
is rejected — while a `super_admin` must name the organization it is acting on. Contact
and group queries are built by `buildContactWhere`, which always applies
`organizationId`, so no caller can widen a query past its tenant.

## Phase status

- [x] **Phase 0** — monorepo, Docker Compose (Postgres/Redis/API/worker), CI, `/health`
- [x] **Phase 1** — Prisma schema, JWT auth + roles, tenant scoping, super-admin console,
      group/contact CRUD with org-type-aware fields *(end-to-end API smoke test still pending)*
- [x] **Phase 2** — Excel template generation, upload validation, preview/diff, commit
- [x] **Phase 3** — Evolution API client, auto-provisioning, QR connect, reconnect/logout
- [x] **Phase 4** — Composer, targeting, live recipient count, draft with resolved recipients
- [x] **Phase 5** — BullMQ send queue with jitter, rate caps, backoff, pause/cancel
- [x] **Phase 6** — Delivery receipts, org daily caps, alerts, activity log, backups, monitoring
- [x] **Phase 7** — Scheduled campaigns, owner/staff permissions, template management,
      per-organization field schemas, analytics. Billing left out (it is conditional
      on commercialising); recurring campaigns are the one remaining item.

## Bulk import

Admins download a template generated from their organization type's field schema
(school sheets carry Guardian phone / Gender / Class; generic sheets carry name and
phone), fill it in, and upload it. The upload is parsed and validated but **not**
written: it becomes a pending `ImportBatch` whose rows each carry the action they
would take — create, update, duplicate-skip, or error with per-field messages. The
admin reviews that preview, unticks anything they don't want, and confirms.

- Phone numbers are accepted in local (`01001234567`) or international
  (`+201001234567`) form and stored normalized.
- Rows matching an existing contact by External ID, or by name + destination number,
  update it instead of creating a duplicate — so re-uploading a corrected sheet is safe.
- Duplicates *within* the file are flagged against the row they repeat.
- Classes named in the sheet that don't exist yet are created on commit (optional).
- Columns the platform doesn't recognize are reported and ignored, not rejected.

## WhatsApp connection

Evolution API is self-hosted by the platform operator; organizations never touch it.
Creating an organization provisions an instance on the Evolution server and registers
a webhook against it. The org's own admin then opens **WhatsApp**, presses Connect,
and scans the QR — the screen polls until the pairing lands and then shows the linked
number.

- Evolution returns either a rendered QR image or a raw payload depending on version;
  the API normalizes both to a data URI so the UI only ever handles an image.
- `GET /api/v1/instance/status` reconciles our record against the live server, so a
  number that drops is visible; the webhook receiver reports the same change without
  anyone having the screen open.
- An instance deleted on the Evolution server reports `not_provisioned` with the reason
  rather than a stale "connected", and can be re-provisioned from the UI.
- Provisioning never blocks onboarding: if Evolution is unreachable the organization is
  still created, the failure is recorded, and provisioning can be retried later.
- The instance's API key is stored server-side and never sent to the browser.

Verified end to end against a mock Evolution server built from its v2 API docs
(provision → QR → scan → connected → disconnect → logout → replace number, plus the
outage and deleted-instance paths). **Not yet exercised against a real Evolution
server** — that needs `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` pointing at a live
deployment.

## Composing and targeting

The campaign wizard runs Target → Compose → Review, with the recipient count visible
at every step. Targeting covers the whole organization, selected groups, groups
narrowed by a custom field (gender for schools), or hand-picked contacts with search.

`resolveAudience` is the single resolver behind the live count, the preview and the
saved draft, so the number an admin approves is the number prepared — and Phase 5's
queue will read the same rows.

- Exclusions are always reported, never silent: a contact with no destination number,
  or without confirmed consent, is listed with the reason.
- Schools address the guardian number; siblings who share one are both kept (each
  message names a different student) and the overlap is reported, with an opt-in
  dedupe if the admin would rather send once per number.
- An explicit but empty selection resolves to nobody, never everybody.
- Saving a draft materializes one `MessageJob` per recipient with the resolved number
  and rendered text. Editing the message re-renders them, so the stored messages and
  the reviewed text can never disagree. **Nothing sends** — Phase 5 dispatches them.

## Safe sending

Sending is a queue, never a loop. Dispatch pushes the campaign's already-prepared
`MessageJob` rows onto BullMQ; `apps/worker` consumes them and decides, per message,
whether to send now, wait, retry or stop.

Every send must pass one atomic gate (`packages/core/src/rateLimit.ts`):

- a **randomized gap** between messages (6–20s by default, never a fixed interval),
- a **per-minute** and **per-day cap** for that number, editable per instance,
- a **batch cooldown** every N messages so a whole-organization send arrives in
  batches rather than one long machine-paced stream,
- an optional **business-hours window** per organization.

The check and the reservation happen in a single Lua script. A plain check-then-act
gate would let every concurrent worker read "clear" before any of them recorded a
send — which is exactly the burst that gets a number banned.

When a gate is closed the message is **rescheduled, not failed** — a paused campaign,
a hit daily cap or a closed window holds the queue and the dashboard explains why.
A mid-campaign disconnect pauses the campaign and names the reason instead of
burning messages against a dead number; WhatsApp rate-limit responses back the whole
number off. Transport errors retry with backoff up to `SEND_MAX_ATTEMPTS`; a rejected
recipient fails immediately with Evolution's response kept for debugging.

The campaign screen polls while a send is running, showing queued/sent/failed counts,
a per-recipient log with timestamps and attempt counts, and pause/resume/cancel.

Verified end to end against a mock Evolution server: a six-recipient class send
completes unattended and paced, pause stops it mid-flight with the rest still queued,
resume finishes them, cancel abandons them, a disconnect mid-campaign pauses with the
reason shown, and a 2/minute cap holds the queue instead of failing it.

## Operating it

**Delivery status.** Evolution posts receipts to the webhook registered at
provisioning, and messages advance `sent → delivered → read` on their own. Receipts
are read permissively — the ack arrives as a string on some builds and as a Baileys
number on others — and a message never walks backwards, so a late `SERVER_ACK`
cannot undo a `READ`. Receipts for messages this platform did not send (chats typed
on the phone) are ignored.

**Alerts.** Every console screen carries a banner fed by `/api/v1/ops/alerts`: a
number that is not connected, campaigns stopped mid-send, a number that dropped
repeatedly in the last 48 hours (the signature of a rate limit or a block), and
contacts excluded from every send for missing consent.

**Activity log.** `/audit` records who did what, including who dispatched which
campaign and to how many recipients — the record you need when a parent asks.

**Send caps layer**, narrowest first: the instance's own caps, then the
organization's `settings.sendLimits`, then the platform defaults. An operator can
hold a whole organization down without touching its instance.

**Monitoring.** `/health` covers the whole send path, not just the API: database,
Redis, queue depth, and whether the worker is still writing its heartbeat. A dead
worker reports `degraded` — the failure most likely to go unnoticed, since the UI
keeps working while nothing sends. The API container has a matching healthcheck.

**Backups.** The `backup` service dumps Postgres on an interval (daily by default),
keeps `BACKUP_RETENTION_DAYS` of history in the `backups` volume, and only names a
dump once it completes so a crashed run never leaves a file that looks restorable.
Restore with `scripts/restore.sh`.

## Scheduling, roles and templates

**Scheduled campaigns.** A reviewed draft can be sent later. The recipient list was
already frozen when the draft was created, so a campaign scheduled for Sunday reaches
the people the admin reviewed — not whoever matches the filter by then. The delay
lives on the queue jobs, so a scheduled send passes exactly the same pacing, rate caps
and connection checks as an immediate one. `POST /campaigns/:id/unschedule` pulls it
back to draft and removes the pending jobs.

**Owner vs staff.** Staff run the day-to-day: contacts, imports, composing and sending
campaigns, editing templates. Reserved to the owner are the actions that can break the
workspace for everyone else — managing users, unlinking or replacing the WhatsApp
number, provisioning, and changing the send limits that protect that number from a ban.
The API enforces this with `requireOwner`; the UI only hides what the API already
refuses. An organization can never be left without an active owner.

**Templates.** A screen over the template API with placeholder insertion and a live
preview rendered against a real contact, so an admin can see the actual message before
saving. Merge targets are restricted to phone-typed fields for the vertical.

## Defining a vertical without a code change

`packages/shared` holds the built-in verticals, but an organization can override any
of it through `PATCH /api/v1/admin/organizations/:id` with a `fieldSchema`: the
labels (Groups → "Branches", Contacts → "Members"), the custom fields that vertical
needs, which of them messages are addressed to, and the default template. Anything
left unset falls back to the built-in type, and `fieldSchema: null` clears the
override entirely.

`resolveOrgConfig(org)` is the only way the vertical is read, so a custom schema
reaches the contact form, its validation, the generated import sheet, template merge
targets and placeholders, campaign targeting and rendering — all at once. Redefining
a vertical also re-points the organization's default template, unless someone has
edited it, in which case it is left alone and reported back.

## Analytics

`/analytics` reports what was sent, what arrived, what failed and when, over 7/30/90
days, plus a per-campaign table and the most common failure reasons.

Delivery and read rates come from Evolution's receipts, which only arrive once this
platform is reachable from the Evolution server. Until then they read "—", not 0%:
a school seeing "0% delivered" would reasonably conclude nothing arrived, which is
not what the data says. "Reached WhatsApp" is the honest measure in the meantime.

Still open from Phase 7: recurring campaigns. Billing is left out — the brief makes
it conditional on commercialising.

## Arabic and right-to-left

The console runs in English or Arabic, switched from the header and remembered per
browser. Direction is applied by an inline script before first paint, so an Arabic
user never watches the layout flip after load.

- **UI text** comes from `packages/shared/src/i18n.ts`. Adding a locale is a column
  in `DICTIONARY`; a missing translation falls back to English, then to the key.
- **Vertical labels** translate too — Classes/Students become الفصول/الطلاب, and
  custom fields carry `labelAr`. A custom vertical's renamed labels apply to both
  locales, since there is no built-in Arabic for words an operator just invented.
- **API messages** are translated at the response boundary from
  `packages/shared/src/serverMessages.ts`, keyed by the English text — the gettext
  approach. The console sends `Accept-Language`; `?locale=ar` overrides it. An
  untranslated message still reaches the user in English rather than as a raw key,
  and an unsupported language falls back rather than failing the request.
- **Layout** uses logical properties (`ms-`, `me-`, `ps-`, `pe-`, `text-start`), so
  new screens mirror correctly without anyone remembering to add `rtl:` variants.

Not translated, by design: organization-authored content (contact names, campaign
text, template bodies) and raw provider errors from WhatsApp, which arrive in
English from Evolution.

## Local environment note

On Node 26 the `tsc` **CLI** exits silently without compiling, so `npm run build` and
`npm run typecheck` appear to succeed while doing nothing. The TypeScript compiler API,
`tsx`, `prisma` and `next build` are unaffected, as are Docker builds (Node 20) and CI.
If you hit it locally, run TypeScript under Node 20 (`nvm use 20`).
