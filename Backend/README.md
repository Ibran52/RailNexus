# RailNexus Backend — Railway Maintenance Decision-Support Platform

RailNexus Backend is the high-integrity Node.js / TypeScript microservice coordinating railway track maintenance work requests, persistent planning state versioning, controller decision workflows, and integration with the deterministic Python Brain cascade simulation engine.

---

## Architecture Overview

```
                      +-----------------------------+
                      |     Client Web / Mobile     |
                      +--------------+--------------+
                                     |
                          HTTPS / REST / SSE
                                     |
                                     v
+--------------------------------------------------------------------------+
|                          RailNexus Node Backend                          |
|                                                                          |
|  [Security & Auth]  Helmet • Rate Limiter • JWT • RBAC • NoSQL Sanitizer  |
|  [Orchestration]    Planning Version Monotonic Counter • Lifecycle Engine|
|  [Audit & Events]   Immutable Audit Trail • SSE Real-Time Event Bus       |
|  [Persistence]      MongoDB Atlas (Mongoose)                             |
+------------------------------------+-------------------------------------+
                                     |
                        HTTP / JSON (Section 43 Contract)
                                     |
                                     v
                      +-----------------------------+
                      |     RailNexus Python Brain  |
                      |  (Cascade & Impact Engine)  |
                      +-----------------------------+
```

### Core Separation of Concerns
1. **Node Backend**: Owns user authentication (JWT/bcrypt), role-based authorization (RBAC), maintenance request persistence, monotonically incremented global `planningVersion`, controller approval/rejection/modification workflows, immutable audit logging, and Server-Sent Events (SSE).
2. **Python Brain**: Microservice (FastAPI/Python) that owns all railway scheduling simulations, conflict detection, cascade delay calculation, train priority resolution, and multi-factor impact scoring.
3. **No Fallback Fabrication**: If the Python Brain is unreachable or returns an error, the backend fails fast and exposes a standardized error (`BRAIN_UNAVAILABLE` / 503). It **never** fabricates fake recommendation windows.

---

## Roles & Departments

| Role | Department | Description |
| :--- | :--- | :--- |
| `MAINTENANCE_ENGINEERING` | `ENGINEERING` | Permanent Way / Track maintenance engineers (creates track tamping, rail renewal, turnout work) |
| `MAINTENANCE_SNT` | `SNT` | Signal & Telecommunication engineers (signal overhaul, point machine maintenance) |
| `MAINTENANCE_OHE` | `OHE` | Overhead Equipment / Traction engineers (catenary inspection, mast repair) |
| `CONTROLLER` | `CONTROLLER` | Section / Chief Controllers (reviews, approves, modifies with Brain replan, rejects) |
| `ADMIN` | `CONTROLLER` | System administrator (full system visibility, audit trail review) |

---

## API Endpoints Reference

All endpoints are prefixed with `/api/v1`.

### 1. Authentication (`/api/v1/auth`)
- `POST /register`: Registers department engineers or controllers.
- `POST /login`: Authenticates with email and password, returning JWT bearer token.
- `GET /me`: Returns currently authenticated user profile and roles.
- `POST /logout`: Invalidates client session.

### 2. Maintenance Operations (`/api/v1/maintenance`)
- `POST /requests` (alias `/`): Submits maintenance work request. Automatically increments `planningVersion`, sets status to `ANALYZING`, calls Python Brain, saves `BrainRun`, and transitions status to `RECOMMENDED`.
  - Supports `Idempotency-Key` header for safe retries.
- `GET /requests` (alias `/`): Lists maintenance requests (filtered by authenticated user's department for engineers; all requests for controllers).
- `GET /requests/:requestId`: Detailed view of a specific request.
- `GET /requests/:requestId/analysis`: Detailed view of the latest Brain run and impact breakdown.

### 3. Controller Decision Operations (`/api/v1/controller`)
- `GET /requests`: Lists all active, pending, approved, and rejected requests.
- `POST /requests/:requestId/approve` (alias `/approve`): Approves recommended window, locks schedule, creates immutable `ControllerDecision`, emits SSE event.
- `POST /requests/:requestId/modify` (alias `/modify`): Modifies window constraints or duration, increments `planningVersion`, triggers Brain re-simulation, and transitions request back to `RECOMMENDED`.
- `POST /requests/:requestId/reject` (alias `/reject`): Rejects request with mandatory operational justification.
- `POST /what-if` (alias `/whatif`): Runs exploratory "what-if" cascade simulations with modified parameters without mutating database state.
- `GET /history`: Returns chronological log of controller decisions and plan versions.
- `GET /events`: Server-Sent Events (SSE) stream for real-time controller updates.

### 4. Operational Audit (`/api/v1/audit`)
- `GET /`: Queries immutable operational audit trail (requires `CONTROLLER` or `ADMIN`).

---

## Request Lifecycle State Machine

```
[POST /maintenance]
         │
         ▼
     [PENDING]
         │ (planningVersion incremented, PlanningState built)
         ▼
    [ANALYZING] ──(Brain Failure)──► [ANALYZING] (Retry-Safe)
         │
         │ (Brain Success: BrainRun persisted)
         ▼
   [RECOMMENDED] ◄──────────────┐
     │         │                │
(APPROVE)   (MODIFY)      (Brain Replan)
     │         │                │
     │         ▼                │
     │    [MODIFIED] ──► [ANALYZING]
     │         
     ▼         
 [APPROVED] ──► [SCHEDULED]
 
 (Or from RECOMMENDED: REJECT ──► [REJECTED])
```

---

## Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | Description | Default |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | Runtime environment (`development`, `production`, `test`) | `development` |
| `PORT` | Yes | HTTP server listen port | `5000` |
| `MONGO_URI` | Yes | MongoDB Atlas connection string (**Fail-fast if missing**) | None |
| `JWT_SECRET` | Yes | Cryptographic secret for signing tokens (**Fail-fast if missing**) | None |
| `JWT_EXPIRES_IN` | No | Token lifetime | `7d` |
| `BRAIN_SERVICE_URL` | Yes | URL of RailNexus Python Brain microservice | `http://localhost:8000` |
| `BRAIN_TIMEOUT_MS` | No | Timeout for Brain simulation requests | `30000` |
| `CORS_ORIGIN` | No | Allowed frontend origin for CORS | `http://localhost:3000` |

---

## Running the Application

### Development
```bash
npm run dev
```

### TypeScript Validation
```bash
npm run lint
```

### Automated Test Suite
```bash
npm test
```
All 9 test suites and 29 unit/integration tests run in memory using Vitest.
