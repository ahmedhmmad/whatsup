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
- [ ] Phase 3 — Evolution API instance provisioning + QR connect
- [ ] Phase 4 — Composer & targeting with live recipient count
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

## Local environment note

On Node 26 the `tsc` **CLI** exits silently without compiling, so `npm run build` and
`npm run typecheck` appear to succeed while doing nothing. The TypeScript compiler API,
`tsx`, `prisma` and `next build` are unaffected, as are Docker builds (Node 20) and CI.
If you hit it locally, run TypeScript under Node 20 (`nvm use 20`).
