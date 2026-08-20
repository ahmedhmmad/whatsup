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
apps/worker       Queue worker process (placeholder until Phase 5)
apps/admin-web    Next.js admin console (org-type aware UI)
packages/shared   Org-type schemas, phone normalization, template rendering
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
| POST             | `/api/v1/webhooks/evolution/:instanceName`           | Evolution posts connection events here            |
| POST             | `/api/v1/campaigns/preview`           | Live recipient count + personalized preview                     |
| GET/POST         | `/api/v1/campaigns`                   | List / create a draft with its recipients resolved              |
| GET/PATCH/DELETE | `/api/v1/campaigns/:id`               | Detail with per-recipient rows; edits re-render prepared texts  |
| GET/POST         | `/api/v1/templates`                   | Message templates, placeholders, valid merge targets            |
| PATCH/DELETE     | `/api/v1/templates/:id`               |                                                                 |
| POST             | `/api/v1/templates/render`            | Renders a template body against a real contact                  |
| POST             | `/api/v1/uploads`                     | Attachment upload (images, PDF, Office, text)                   |
| GET              | `/api/v1/uploads/:orgId/:fileName`    | Tenant-checked attachment download                              |

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
- [ ] Phase 5 — BullMQ send queue with jitter, rate caps, backoff
- [ ] Phase 6 — Delivery webhooks, daily caps, audit log surfacing, monitoring

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

## Local environment note

On Node 26 the `tsc` **CLI** exits silently without compiling, so `npm run build` and
`npm run typecheck` appear to succeed while doing nothing. The TypeScript compiler API,
`tsx`, `prisma` and `next build` are unaffected, as are Docker builds (Node 20) and CI.
If you hit it locally, run TypeScript under Node 20 (`nvm use 20`).
