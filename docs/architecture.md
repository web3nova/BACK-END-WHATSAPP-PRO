# Backend Architecture & Contributor Guide

AI-powered, multi-tenant B2B commerce platform (WhatsApp AI agent + website builder).
This doc is the map for the 4 backend owners — **where your domain lives and where to start.**

---

## Request flow (server side)

```
WhatsApp Cloud API ──webhook──> Express (src/app.js)
        │                           │
        │                     src/routes/index.js   (API gateway — every module mounts here)
        │                           │
        ▼                           ▼
  BullMQ queue  ──>  Node worker  ──>  AI service (Claude/OpenAI + tool-calling)
  (src/jobs)         (src/jobs)        (src/modules/ai)
                                          │  tools
                                          ▼
                     Postgres + Prisma (catalog/orders/JSONB)  •  Qdrant (RAG)  •  Redis (memory)
```

## Layer → module map (from the product diagram)

| Diagram layer | Code | Owner |
|---|---|---|
| Gateway (Express webhook receiver) | `src/modules/whatsapp`, `src/app.js`, `src/routes` | Dev 4 / shared |
| Queue & workers (Redis, BullMQ) | `src/jobs` | shared |
| Intelligence (Claude/OpenAI, tool-calling) | `src/modules/ai` | **Dev 3 ✅** |
| Knowledge / RAG (Qdrant) | `src/modules/knowledge` | **Dev 3 ✅** |
| Multi-tenant vault (Postgres + Prisma) | `prisma/schema.prisma` | Dev 1/2 |
| JSONB catalogs | `src/modules/catalog` | Dev 2 |
| Settlement (fiat gateway) | `src/modules/payments` | Dev 4 |
| Platform (auth/RBAC/tenancy/billing) | `src/modules/{auth,users,rbac,tenants,billing,superadmin}` | Dev 1 |

✅ = implemented and mounted. Everything else is a **router stub** (`export default Router()`),
already wired into `src/routes/index.js`, so the app boots — you just fill in the logic.

---

## The module pattern (copy this)

Dev 3's modules are the worked reference. Each domain follows the same shape:

```
modules/<domain>/
  <domain>.routes.js       Router + @openapi JSDoc, mounts controller handlers
  <domain>.controller.js   validate (zod) -> call service -> ok()/created()
  <domain>.service.js      business logic, talks to Prisma/Redis/etc.
  <domain>.validation.js   zod schemas (optional)
```

**Working examples to read before you start:**
- HTTP + validation + response envelope → `src/modules/ai/ai.controller.js`
- Service logic + Prisma → `src/modules/knowledge/knowledge.service.js`
- Router + Swagger docs → `src/modules/knowledge/knowledge.routes.js`

### Conventions (please follow)
- **Tenant scoping:** every query filters by `tenantId`. Read it via `req.tenant.id`
  (a temporary `x-tenant-id` header fallback exists until Dev 1's `tenant.middleware` lands).
- **Responses:** use `common/utils/apiResponse.js` → `ok(res, data)` / `created(res, data)`.
- **Errors:** throw `common/errors` (`BadRequestError`, `NotFoundError`, …); wrap async
  handlers with `common/utils/asyncHandler.js`. The central handler is `middleware/error.middleware.js`.
- **Money:** store minor units (`priceMinor`, integer), currency code alongside.
- **Money/Prisma fields:** if you rename `Product/Catalog/Order/Quote` fields, tell Dev 3 —
  the AI tools in `src/modules/ai/tools` read/write them.

---

## START HERE — per owner

### Dev 1 — Platform & Tenant
1. Implement `tenant.middleware.js` (resolve tenant → `req.tenant`) and `auth.middleware.js`.
2. Build `auth` (register/login/refresh), `users`, `rbac`, `tenants`, `billing`, `superadmin`.
3. Seed roles/permissions + super admin in `scripts/seed.js` / `scripts/createSuperAdmin.js`.
> Entry files: `src/modules/auth/*`, `src/middleware/*`.

### Dev 2 — Business, Catalog, Website
1. `business`, `products`, `inventory` CRUD.
2. `catalog` — CSV/Form → JSONB ingest into the `Catalog` model (the AI's `fetch_catalog` reads it).
3. `website` CMS + public storefront endpoints.
> Entry files: `src/modules/{business,products,catalog,website}/*`.

### Dev 3 — AI & Knowledge ✅ (done)
- `POST /ai/chat`, `DELETE /ai/memory/:id`, `POST /knowledge/upload`, `GET /knowledge/search`.
- Pluggable providers, RAG pipeline, Redis memory, tool-calling. See `src/modules/ai`, `src/modules/knowledge`.

### Dev 4 — Conversation, Orders, Payments
1. `whatsapp` — webhook verify/receive + Cloud API send + Meta embedded signup.
2. `conversations` — persist messages, then call **Dev 3's** `aiService.chat()` (or enqueue an
   `aiReply` job) and reply via WhatsApp. Escalation → staff.
3. `orders`, `quotes`, `payments` (fiat gateway), `notifications`.
> Entry files: `src/modules/{whatsapp,conversations,orders,quotes,payments,notifications}/*`.
> Wire `src/jobs/queue.js` + `src/jobs/worker.js` (embedding processor already exists at
> `src/jobs/processors/embedding.job.js`).

---

## Run locally
```bash
cp .env.example .env        # fill ANTHROPIC_API_KEY / OPENAI_API_KEY / QDRANT_* etc.
docker compose up -d        # postgres, redis, qdrant
npm install
npm run prisma:migrate
npm run dev                 # API on http://localhost:4000/api/v1  (GET /health)
npm run worker              # background jobs (separate process)
```
