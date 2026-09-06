# RailNexus Brain — Phase 1

> **Standalone Python decision-support microservice** for railway maintenance window scheduling.  
> Communicates with the system exclusively through JSON REST APIs.

---

## 1. Overview

**RailNexus Brain** is a stateless decision-support microservice built with Python and FastAPI. It evaluates feasible track maintenance windows and computes the direct delay impact on scheduled train movements using deterministic simulation.

The Brain operates strictly as an analytical engine:
* It receives maintenance requests at runtime via REST API.
* It evaluates candidate maintenance windows against the provided train-movement dataset.
* It calculates direct waiting delay for conflicting trains.
* It returns structured recommendations, alternatives, metrics, and deterministic explanations to the backend.

---

## 2. What the Brain Does

When maintenance department users request a track block, the Node.js/Express backend submits an analysis request to the Brain. The Brain:

1. Validates the requested maintenance section, duration, and time boundaries.
2. Generates sliding candidate windows across the requested time range.
3. Queries the supplied train-movement dataset for trains operating on the exact section.
4. Detects temporal overlaps (conflicts) for each candidate window.
5. Computes the direct delay incurred by each conflicting train.
6. Scores candidate windows by total direct delay and returns the **recommended lowest-direct-delay maintenance window**.
7. Provides ranked alternative windows and a deterministic, data-driven explanation.

> **Decision Authority**: The Brain is a decision-support prototype. The human railway controller remains the final operational authority over all track block approvals.

---

## 3. Architecture

```text
React Frontend
      ↓ (User creates maintenance request)
Node.js + Express Backend
      ↓ POST /api/v1/brain/analyze (JSON)
RailNexus Brain (Python + FastAPI)
      ↓ Reads (read-only baseline)
Supplied Train Movement Dataset (block_ready_mumbai_pune.csv)
      ↓
Conflict Detection Engine
      ↓
Direct Delay Calculation
      ↓
Impact Scoring (Lowest Direct Delay)
      ↓
Recommendation & Deterministic Explanation
      ↓ JSON Response
Node.js + Express Backend
      ↓ Persists request, run ID, and recommendation
MongoDB Atlas
      ↓
Controller Dashboard
```

* **Stateless Microservice**: The Brain does not connect to MongoDB Atlas and does not store maintenance requests.
* **Server-to-Server Communication**: The Express backend acts as the orchestrator and talks directly to the Brain over HTTP.

---

## 4. Dataset

| Property | Value |
|---|---|
| **File Path** | `data/raw/block_ready_mumbai_pune.csv` |
| **Data Rows** | **20,435 train-movement records** (20,436 physical lines including header) |
| **Synthetic Date Base** | `1900-01-01` (times stored as `1900-01-01 HH:MM:SS`) |
| **Unique Trains** | 1,189 |
| **Unique Stations** | 62 |
| **Columns** | `train_number`, `train_type`, `from_station`, `to_station`, `from_time`, `to_time`, `day`, `block_section_km`, `from_dt`, `to_dt`, `occupancy_duration_mins` |

### Date Base Normalization
`1900-01-01` is a synthetic normalization date used strictly to represent time-of-day in the supplied dataset. It is not an actual railway operating date. Runtime requests and dataset queries in Phase 1 must be normalized consistently to this date base.

> **Read-Only**: The raw CSV file is never modified or appended to during service execution.

---

## 5. Dataset Limitations

* **Movement-Only Scope**: The dataset represents train movements between observed station pairs; it is not a complete railway network topology.
* **Not Infrastructure Topology**: The dataset must **not** be interpreted as:
  * A complete railway track topology
  * A complete station connectivity graph
  * A complete asset inventory
  * A complete railway network infrastructure model
* **No Geographic Inference**: Track connectivity is never inferred from station coordinates or proximity. Section matching requires exact equality of `from_station` and `to_station`.
* **Missing Data Handling**: When required operational information is not present in the dataset, it is treated as `MISSING DATA` rather than inferred or fabricated.

---

## 6. Runtime Maintenance Request

There is a strict architectural distinction between reference data and runtime inputs:

```text
Train Movement CSV
    =
Reference / baseline input data for the Brain (read-only)

Maintenance Request
    =
Runtime API input received dynamically from the Express backend
```

Maintenance requests are runtime inputs received through the API. They are not stored in or appended to the train-movement CSV.

Each runtime maintenance request specifies:
* `request_id`: Backend-generated unique tracking ID
* `from_station` / `to_station`: Maintenance section boundaries
* `duration_minutes`: Required block duration
* `earliest_start` / `latest_end`: Operational time window (normalized to `1900-01-01`)
* `priority`: Priority level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)

---

## 7. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/brain/health` | Liveness check |
| `GET` | `/api/v1/brain/data-status` | Dataset availability, statistics, and validation summary |
| `POST` | `/api/v1/brain/analyze` | Maintenance window recommendation (**core endpoint**) |

* **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`
* **Alternative API Documentation (ReDoc)**: `http://localhost:8000/redoc`

### `GET /api/v1/brain/health` Response
```json
{
  "status": "ok",
  "service": "railnexus-brain",
  "version": "1.0.0"
}
```

### `GET /api/v1/brain/data-status` Response
```json
{
  "status": "ready",
  "dataset": "block_ready_mumbai_pune.csv",
  "row_count": 20435,
  "train_count": 183,
  "station_count": 52,
  "validation_errors": 0,
  "validation_warnings": 0
}
```

---

## 8. Analyze Request

```json
{
  "request_id": "REQ-001",
  "from_station": "KE",
  "to_station": "ATG",
  "duration_minutes": 120,
  "earliest_start": "1900-01-01T10:00:00",
  "latest_end": "1900-01-01T20:00:00",
  "priority": "HIGH"
}
```

### Request Fields
* `request_id` (string, required): Identifier assigned by the backend.
* `from_station` (string, required): Departure station code.
* `to_station` (string, required): Arrival station code (must differ from `from_station`).
* `duration_minutes` (integer, required): Maintenance duration in minutes (must be > 0).
* `earliest_start` (ISO 8601 string, required): Earliest allowed start time (using `1900-01-01` date base).
* `latest_end` (ISO 8601 string, required): Latest allowed end time (using `1900-01-01` date base).
* `priority` (string, optional, default `"MEDIUM"`): Operational priority (`LOW` | `MEDIUM` | `HIGH` | `CRITICAL`). Informational in Phase 1.

### Validation Rules
* `from_station` and `to_station` must not be blank and must not be equal.
* `duration_minutes` must be greater than 0.
* `earliest_start` must be strictly before `latest_end`.
* Available range `(latest_end - earliest_start)` must be $\ge$ `duration_minutes`.

---

## 9. Analyze Response

```json
{
  "success": true,
  "brain_run_id": "8f3b6038-6f62-4dc4-b778-0d1fa7e1d51f",
  "request_id": "REQ-001",
  "status": "ANALYZED",
  "recommendation": {
    "start": "1900-01-01T14:00:00",
    "end": "1900-01-01T16:00:00",
    "impact_score": 0.0
  },
  "metrics": {
    "conflict_count": 0,
    "affected_train_count": 0,
    "direct_delay_minutes": 0.0,
    "cascade_delay_minutes": 0.0,
    "total_delay_minutes": 0.0
  },
  "conflicts": [],
  "alternatives": [
    {
      "start": "1900-01-01T15:00:00",
      "end": "1900-01-01T17:00:00",
      "conflict_count": 1,
      "direct_delay_minutes": 15.0,
      "impact_score": 15.0
    }
  ],
  "explanation": "Recommended window: 1900-01-01T14:00:00 -> 1900-01-01T16:00:00\n\nReason:\n  This window produced the lowest calculated delay impact among the 9 evaluated candidate window(s) for section KE->ATG.\n\nConflicts        : 0\nAffected trains  : none\nDirect delay     : 0.00 minutes\nCascade delay    : 0.00 minutes (Phase 2 Cascade Engine)\nImpact score     : 0.00\n\nNote: The human controller remains the final authority. This recommendation must be reviewed before any track block is approved.",
  "metadata": {
    "request_id": "REQ-001",
    "brain_run_id": "8f3b6038-6f62-4dc4-b778-0d1fa7e1d51f",
    "trace_id": "025bc44a-d1a2-4a0b-801b-97217dbcc77b",
    "dataset_version": "v1",
    "algorithm_version": "v2",
    "cascade_simulation": "ACTIVE",
    "candidate_windows_evaluated": 9,
    "window_step_minutes": 60
  }
}
```

---

## 10. Error Contract

Error responses return structured JSON with descriptive error details. Stack traces are omitted from responses for security and clarity.

```json
{
  "success": false,
  "error": {
    "code": "SECTION_NOT_FOUND",
    "message": "Section FAKE_A→FAKE_B was not found in the dataset. Only sections present in the CSV can be analyzed. Verify the station codes and direction."
  }
}
```

### Supported Error Codes
* `INVALID_REQUEST` (HTTP 422): Input fails Pydantic schema validation (e.g. negative duration, inverted start/end times, range smaller than duration).
* `SECTION_NOT_FOUND` (HTTP 404): Specified `from_station` → `to_station` does not exist in the dataset.
* `NO_FEASIBLE_WINDOW` (HTTP 200 with `success: false`): Request is structurally valid, but no feasible candidate window fits within the requested time bounds.
* `INTERNAL_BRAIN_ERROR` (HTTP 500): Unexpected runtime exception in the service.

---

## 11. How the Brain Calculates Delay Impact (Phase 2 Cascade Engine)

The Brain implements a deterministic **Cascade Delay Simulation Engine** that models chronological train delay propagation derived strictly from movement sequences in the historical dataset.

```text
Maintenance Block (Candidate Window)
        ↓
Conflict Classification:
  ├── ENTRY_BLOCKED: train arrives during block → direct delay = window.end - train_entry
  └── TRAIN_ALREADY_INSIDE_SECTION: train inside at block start → marks candidate INFEASIBLE
        ↓
Initial Direct Delay Events (for ENTRY_BLOCKED trains)
        ↓
Event / Propagation Queue (FIFO Queue of DelayEvents)
        ↓
[Loop until Queue Empty or MAX_CASCADE_DEPTH reached]:
  1. Pop DelayEvent: (train_number, movement_index, delay_minutes, cause)
  2. Shift movement timing (preserving occupancy duration & observed dwell gaps)
  3. Propagate along same train sequence to subsequent movements (stopping at broken boundaries)
  4. For each shifted movement, check secondary conflicts with other trains on exact section
  5. Use Train B's current EFFECTIVE timing (original + already accumulated delay)
  6. If conflict occurs:
     secondary_delay = max(0, clearing_time - effective_arrival)
     Update Train B's accumulated delay
     Enqueue new DelayEvent for Train B at contested movement
        ↓
Compute Metrics without Double-Counting:
  - direct_delay_minutes = sum of initial delays on directly blocked trains
  - secondary_delay_minutes = sum of new secondary delays injected into interacting trains
  - propagated_delay_minutes = cumulative downstream delay across all shifted movements
  - cascade_delay_minutes = secondary_delay_minutes (net cascade impact beyond direct blocks)
  - total_delay_minutes = direct_delay_minutes + secondary_delay_minutes (net new delay to network)
        ↓
Deterministic Impact Score (impact_score = total_delay_minutes)
        ↓
Joint Planning & Bundling (Phase 2 Additive Approximation)
        ↓
Structured Delay Trace & Explainability
        ↓
JSON Response
```

### Calculation Rules & Metric Definitions
* **`direct_delay_minutes`**: The initial waiting delay injected directly by the maintenance block into `ENTRY_BLOCKED` trains:
  $$\text{direct\_delay} = \max(0, \text{window.end} - \text{train\_entry})$$
* **`propagated_delay_minutes`**: Cumulative sum of downstream movement shifts across all trains, preserving original occupancy durations and observed dwell gaps. Reported in trace records for complete visibility.
* **`secondary_delay_minutes`**: Sum of all new secondary delays injected into interacting trains when shifted movements contest shared track sections with other trains.
* **`cascade_delay_minutes`**: Equal to `secondary_delay_minutes` (net cascade impact beyond direct blocks).
* **`total_delay_minutes`**: Net new delay introduced across all affected trains in the railway network:
  $$\text{total\_delay\_minutes} = \text{direct\_delay\_minutes} + \text{secondary\_delay\_minutes}$$
  *(Same-train downstream propagation is tracked in the trace but not double-counted into total network delay).*
* **`impact_score`**: Objective score equal to $\text{round}(\text{total\_delay\_minutes}, 2)$ for feasible candidates.
* **Effective Timing**: Secondary conflicts compare against target trains' current effective timings ($\text{original\_start} + \text{already\_accumulated\_delay}$), ensuring secondary impacts reflect realistic shifted schedules.
* **Sequence Continuity & Broken Sequences**: Verified using exact station transitions ($m_i.\text{to\_station} == m_{i+1}.\text{from\_station}$). Missing track segments (such as the ghat section between KJT and LNL) are detected as broken sequence boundaries without creating synthetic connections; propagation cleanly stops at broken boundaries.
* **Termination & Cycle Protection**: FIFO propagation terminates when the queue drains or when `MAX_CASCADE_DEPTH` (default 20) is reached. If depth is reached, `cascade_simulation` is flagged as `"PARTIAL"`.
* **Infeasible Windows Excluded**: Candidate windows where a train is already occupying the section at block start (`TRAIN_ALREADY_INSIDE_SECTION`) are marked infeasible with `impact_score = inf` and discarded by the optimizer and joint planner.

---

## 12. Running Locally

### Prerequisites
* Python 3.10+ (tested on Python 3.10 - 3.14)
* Virtual environment (recommended)

### Installation and Startup
```bash
# Navigate to the service folder
cd railnexus-brain

# Install required dependencies
pip install -r requirements.txt

# Start the FastAPI service
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

* **Service URL**: `http://localhost:8000/api/v1/brain`
* **Swagger UI**: `http://localhost:8000/docs`
* **ReDoc**: `http://localhost:8000/redoc`

### Request Correlation (`X-Request-ID`)
Clients may optionally supply an `X-Request-ID` HTTP header for request correlation:
```http
X-Request-ID: req-corr-12345
```
* If provided, the Brain echoes it in `metadata.trace_id` and includes it in all server log messages.
* If omitted, the Brain generates a UUID4 automatically.

### CORS Configuration
CORS middleware is configured (`allow_origins=["*"]`) for local development and direct browser/Swagger testing. The primary production integration is server-to-server (Express to FastAPI), which does not rely on CORS.

---

## 13. Running Tests

The test suite contains 65 automated unit and integration tests covering API endpoints, data loading, schema validation, conflict detection, and direct delay computation.

```bash
# Run all tests
pytest tests/ -v

# Run specific test suites
pytest tests/test_brain_api.py -v
pytest tests/test_conflict_engine.py -v
pytest tests/test_direct_delay.py -v
pytest tests/test_data_loader.py -v
pytest tests/test_health.py -v
pytest tests/test_request_schema.py -v
```

---

## 14. Implemented Features

* ✅ **Read-Only Dataset Loader**: Loads `block_ready_mumbai_pune.csv` without disk mutation.
* ✅ **Dataset Validator**: Checks for missing columns, nulls, negative durations, ordering, and duplicate rows across severity levels (`INFO`, `WARNING`, `ERROR`, `CRITICAL`).
* ✅ **TrainRepository**: Query interface supporting exact section matching and time overlap filtering.
* ✅ **Sliding Candidate Window Generator**: Configurable window generation (default 60-minute step).
* ✅ **Conflict Detection Engine**: Exact section match and interval overlap detection.
* ✅ **Direct Delay Calculation**: Computes individual and aggregated direct waiting delays.
* ✅ **Impact Scoring**: Deterministic scoring based on calculated direct delay.
* ✅ **Deterministic Selection**: Evaluates all candidate windows and ranks the lowest-delay window first.
* ✅ **Deterministic Explanation Generator**: Text explanation built strictly from computed numbers.
* ✅ **REST Endpoints**: `/health`, `/data-status`, and `/analyze`.
* ✅ **Pydantic Validation**: Strict input boundary validation with clear error messages.
* ✅ **Consistent Error Contract**: Standardized JSON error schema with appropriate HTTP status codes.
* ✅ **Request Correlation & Run Tracking**: Supports `X-Request-ID` and outputs unique `brain_run_id`.
* ✅ **Interactive Documentation**: Auto-generated Swagger UI and ReDoc.
* ✅ **Automated Test Suite**: 65 passing pytest test cases.

---

## 15. Intentionally Not Implemented

| Feature | Status | Design Rationale |
|---------|--------|------------------|
| **Cascade delay simulation** | `NOT_IMPLEMENTED` | Phase 1 scope is direct delay only. Returns placeholder `0.0`. |
| **ML / AI prediction models** | `NOT_IMPLEMENTED` | Phase 1 requires strict deterministic transparency. |
| **LLM decision making** | `NOT_IMPLEMENTED` | Explanations and window rankings are strictly algorithmic. |
| **OR-Tools / global mathematical solvers** | `NOT_IMPLEMENTED` | Sliding candidate evaluation using direct delay fulfills Phase 1 requirements. |
| **Request / decision persistence** | `NOT_IMPLEMENTED` | Brain is stateless; persistence is handled by Node.js Express & MongoDB Atlas. |
| **Authentication / User management** | `NOT_IMPLEMENTED` | Security and auth belong in the Express API gateway layer. |
| **Railway network topology inference** | `NOT_IMPLEMENTED` | Dataset contains point-to-point movements; no spatial track network is assumed. |
| **Live GPS / real-time train tracking** | `NOT_IMPLEMENTED` | Operates on the supplied baseline dataset. |

---

## 16. Project Structure

```text
railnexus-brain/
├── data/
│   └── raw/
│       └── block_ready_mumbai_pune.csv  ← Supplied train-movement dataset (read-only)
├── src/
│   ├── __init__.py
│   ├── main.py                          ← FastAPI entry point & CORS configuration
│   ├── config.py                        ← Constants, paths, versions, and date base
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py                    ← Endpoint handlers (/health, /data-status, /analyze)
│   │   └── schemas.py                   ← Pydantic request and response models
│   ├── core/
│   │   ├── __init__.py
│   │   ├── data_loader.py               ← CSV dataset parsing and validation checks
│   │   ├── validator.py                 ← Structured data validation report
│   │   ├── train_repository.py          ← Query interface for train movements
│   │   ├── candidate_windows.py         ← Sliding candidate window generator
│   │   ├── conflict_engine.py           ← Exact section and time overlap detection
│   │   ├── direct_delay.py              ← Direct waiting delay computation
│   │   ├── cascade_delay.py             ← Cascade delay placeholder (Phase 2 stub)
│   │   ├── impact_score.py              ← Impact scoring function (= direct delay)
│   │   ├── optimizer.py                 ← Candidate evaluation and ranking
│   │   ├── bundling.py                  ← Post-planning bundle opportunity analysis
│   │   ├── joint_planner.py             ← Joint multi-request optimization engine
│   │   └── explanation.py               ← Deterministic text explanation generator
│   └── services/
│       ├── __init__.py
│       └── brain_service.py             ← Orchestration service for analysis pipeline
├── tests/
│   ├── __init__.py
│   ├── conftest.py                      ← Pytest fixtures and mock client setup
│   ├── test_health.py                   ← Health and data-status endpoint tests
│   ├── test_data_loader.py              ← Dataset loader tests
│   ├── test_request_schema.py           ← Pydantic request validation tests
│   ├── test_conflict_engine.py          ← Conflict detection unit tests
│   ├── test_direct_delay.py             ← Direct delay calculation unit tests
│   ├── test_brain_api.py                ← Full /analyze API integration tests
│   └── test_planning_state.py           ← Dynamic planning state & joint planning tests
├── pytest.ini                           ← Pytest configuration
├── requirements.txt                     ← Service dependencies
└── README.md                            ← Project documentation
```

---

## 17. Integration Contract

The full RailNexus platform integrates the Brain as an analytical microservice:

```text
React Frontend
      ↓ 1. User submits maintenance request
Node.js + Express Backend
      ↓ 2. Express forwards POST /api/v1/brain/analyze
FastAPI Brain Microservice
      ↓ 3. Brain returns recommendation, metrics, and brain_run_id
Node.js + Express Backend
      ↓ 4. Express links request_id + brain_run_id and stores in database
MongoDB Atlas
      ↓ 5. Updates broadcast / retrieved
Controller Dashboard
```

* **Correlation**: The Express backend associates:
  * Maintenance request record (`request_id`)
  * Analysis execution (`brain_run_id`)
  * Request correlation ID (`trace_id` / `X-Request-ID`)
  * Controller approval / rejection decision
  * Audit log
* **Isolation**: The Brain does not require database credentials or direct MongoDB access.

---

## 18. Design Decisions / Constraints

1. **Stateless Microservice**: Eliminates local state management, enabling straightforward horizontal scaling and predictable restarts.
2. **Deterministic Computation**: Every calculation is reproducible for identical inputs without stochastic variation.
3. **No Unsupported Provenance Claims**: Data fields not present in the dataset are treated as `MISSING DATA` rather than synthesized.
4. **Separation of Concerns**: Analytics belong in FastAPI; persistence, business workflows, and authentication belong in Express.
5. **Exact Section Boundaries**: Prevents incorrect scheduling caused by speculative spatial track connectivity.

---

## 19. Phase 2 Status & Simulation Assumptions

* **Cascade Delay Simulation (Implemented)**: Replaces Phase 1 placeholder with a deterministic event-driven propagation queue. Models multi-tier downstream and secondary knock-on delays along chronological movement sequences.
* **Precedence Policy (Prototype Assumption)**: When shifted movements contest a section, the earlier effective arrival takes precedence; the later-arriving train waits until the contested section is vacated.
* **Non-Double-Counting Total Delay**: Network total delay equals $\text{direct} + \text{secondary}$. Downstream same-train propagation is tracked in the trace but not double-counted into net network delay.
* **Sequence Gaps Handled Realistically**: Missing sections in the historical dataset are detected as broken sequences; propagation halts cleanly without inventing synthetic connections.
* **Bounded Depth**: Cascading is bounded by `MAX_CASCADE_DEPTH = 20` to guarantee deterministic termination.
* **Decision Support Only**: RailNexus Brain provides deterministic decision-support recommendations; it is not a certified real-time railway interlocking or dispatching system. Final authority remains with the human section controller.

---

## 20. Future Enhancements (Phase 3)

Planned future enhancements:
* **Multi-Section Corridor Analysis**: Simultaneous block analysis across contiguous multi-block track sections.
* **Priority-Weighted Multi-Factor Scoring**: Incorporation of passenger load, train priority class, and maintenance criticality into the objective score.
* **Live Telemetry Ingestion**: Capability to ingest real-time train positions from operational feeds.
* **Automated Re-Route Exploration**: Identification of alternative track corridors during long-duration block windows.

---

## 21. Dynamic Planning State Architecture

### 21.1 The Asynchronous Arrival Challenge
In real railway operations, maintenance requests do not arrive in neat, synchronized batches. A civil engineering division may submit a track renewal request at 10:00 AM, an overhead equipment (OHE) team may request a block at 3:00 PM, and a signaling team may request maintenance at 9:00 PM.

The system cannot stall operations waiting for a batch of requests to accumulate. The RailNexus Brain evaluates every maintenance request immediately upon arrival without minimum count requirements, while dynamically maintaining a globally optimal planning state.

```text
10:00 AM: Request A arrives
          ↓
          Brain analyzes A immediately → Window A recommended

03:00 PM: Request B arrives (competing section)
          ↓
          Brain evaluates A + B jointly
          → A and B assigned non-overlapping windows (mutual exclusion)

09:00 PM: Request C arrives
          ↓
          Controller approved Window A earlier (now a FixedPlanItem)
          Brain treats A as an immoveable exclusion constraint
          Brain jointly plans B and C around Fixed Plan A
```

### 21.2 Joint Multi-Request Optimization
When the optional `planning_state` container is passed to `POST /api/v1/brain/analyze`, the Brain shifts from single-request evaluation to joint multi-request optimization:

1. **Mutual Exclusion**: Requests sharing the exact same section (`from_station` and `to_station`) are guaranteed non-overlapping windows:
   $$\max(\text{start}_i, \text{start}_j) \ge \min(\text{end}_i, \text{end}_j)$$
2. **Fixed Plan Protection**: Approved or scheduled maintenance plans (`FixedPlanItem`) are immoveable constraints; candidate windows overlapping fixed plans on the same section are discarded upfront.
3. **Global Minimization**: The joint planner selects a collective assignment that minimizes total impact:
   $$\min \sum_{i} \text{impact\_score}_i$$
   *(Phase 1 Approximation: Uses additive per-candidate simulation scores and does not yet perform state-coupled re-simulation across concurrent windows).*
4. **Different Section Independence**: Requests on different sections (e.g. `KE`→`ATG` vs `PNVL`→`KJT`) are scheduled without artificial mutual exclusions.

### 21.3 Backend Ownership of Lifecycle State
* **`planning_mode`**: Either `"INITIAL"` (first-time evaluation of a request set) or `"REPLAN"` (re-optimization triggered by new arrivals or modifications). The Brain reflects the backend-supplied mode in `planning_summary.planning_mode` and never infers it.
* **`plan_version`**: The version number is managed by the Express backend. When supplied in `planning_state.version`, the Brain preserves and echoes it in `plan_version` and `metadata.plan_version`. If omitted, it falls back to a deterministic count.

### 21.4 Post-Planning Bundle Opportunity Analysis
The Brain automatically scans for bundling opportunities after joint planning is complete:
* **Eligibility Criteria**:
  1. Exact section match (`from_station` and `to_station`).
  2. Overlapping availability windows ($\max(\text{start}) < \min(\text{end})$).
  3. Intersection range accommodates the combined duration ($\ge \text{duration}_A + \text{duration}_B$).
  4. Combined block impact $\le$ sum of individual impacts.
* **Post-Planning Reporting**: Bundling is reported as an advisory candidate in `bundles` (`recommendation: "BUNDLE" | "SEPARATE"`). The Brain does not unilaterally force bundling, giving controllers the option to adopt or keep separate blocks.

### 21.5 Scope & Topology Limitations
* **Exact Section Matching**: Same-section exclusion applies to matching `from_station` and `to_station` pairs. Network graph topological relationships (shared junctions, upstream/downstream corridor ripple) will be introduced with full topological graph modeling.
* **Tractability Limits**: Full Cartesian search is bounded by `JOINT_PLANNING_CAP = 5` and `MAX_CANDIDATES_JOINT = 8`. If request volume exceeds the cap or no mutually feasible Cartesian combination exists, a deterministic priority-based greedy fallback schedules requests in priority order (`CRITICAL` > `HIGH` > `MEDIUM` > `LOW`).

### 21.6 Joint-Feasible Alternatives
Alternatives returned during joint planning are filtered against the selected windows of the other pending requests and fixed plans. An individually valid window is not shown as an alternative if it would make the overall plan infeasible.

* **Single-request mode (`planning_state = None`)**: Alternatives represent individually feasible candidate windows for the request, tagged with `alternative_type = "SINGLE_REQUEST_ALTERNATIVE"`.
* **Joint-planning mode (`planning_state` active)**: Alternatives must satisfy all current planning constraints—including request time bounds, fixed-plan non-overlap, same-section mutual exclusion with all other selected requests in the plan, and candidate feasibility (zero occupying trains at block start). Tagged with `alternative_type = "JOINT_FEASIBLE_ALTERNATIVE"`.
* **Complete Plan Variations**: Top runner-up combinations from Cartesian joint evaluation are exposed in `plan_alternatives` as complete, globally feasible multi-request allocations.

### 21.7 Extended API Payload Example

```json
{
  "request_id": "REQ-003",
  "from_station": "KE",
  "to_station": "ATG",
  "duration_minutes": 60,
  "earliest_start": "1900-01-01T10:00:00",
  "latest_end": "1900-01-01T18:00:00",
  "priority": "HIGH",
  "planning_state": {
    "version": 4,
    "planning_mode": "REPLAN",
    "pending_requests": [
      {
        "request_id": "REQ-002",
        "from_station": "KE",
        "to_station": "ATG",
        "duration_minutes": 60,
        "earliest_start": "1900-01-01T10:00:00",
        "latest_end": "1900-01-01T18:00:00",
        "priority": "MEDIUM",
        "status": "RECOMMENDED"
      }
    ],
    "fixed_plans": [
      {
        "request_id": "REQ-001",
        "from_station": "KE",
        "to_station": "ATG",
        "allocated_start": "1900-01-01T10:00:00",
        "allocated_end": "1900-01-01T12:00:00",
        "status": "APPROVED"
      }
    ]
  }
}
```

Response includes individual recommendations, bundle opportunities, and planning summary:
```json
{
  "success": true,
  "brain_run_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "request_id": "REQ-003",
  "status": "ANALYZED",
  "plan_version": 4,
  "recommendation": {
    "start": "1900-01-01T14:00:00",
    "end": "1900-01-01T15:00:00",
    "impact_score": 25.0
  },
  "planning_summary": {
    "planning_mode": "REPLAN",
    "total_pending": 2,
    "total_fixed": 1,
    "scheduled_count": 2,
    "unfeasible_count": 0,
    "algorithm_used": "JOINT_OPTIMAL"
  },
  "recommendations": [
    {
      "request_id": "REQ-002",
      "from_station": "KE",
      "to_station": "ATG",
      "status": "RECOMMENDED",
      "recommendation": { "start": "1900-01-01T12:00:00", "end": "1900-01-01T13:00:00", "impact_score": 10.0 }
    },
    {
      "request_id": "REQ-003",
      "from_station": "KE",
      "to_station": "ATG",
      "status": "RECOMMENDED",
      "recommendation": { "start": "1900-01-01T14:00:00", "end": "1900-01-01T15:00:00", "impact_score": 25.0 }
    }
  ],
  "bundles": [
    {
      "bundle_id": "BUNDLE-KE-ATG-E003_E002",
      "request_ids": ["REQ-002", "REQ-003"],
      "section": "KE -> ATG",
      "combined_start": "1900-01-01T12:00:00",
      "combined_end": "1900-01-01T14:00:00",
      "combined_duration_minutes": 120,
      "bundle_impact_score": 30.0,
      "individual_impact_sum": 35.0,
      "recommendation": "BUNDLE",
      "reason": "Combined block saves impact score (30.00 <= 35.00) by combining 60m and 60m into a single window."
    }
  ]
}
```

---

## 22. Phase 2: Cascade Delay Simulation Engine

The Phase 2 RailNexus Brain replaces static estimate placeholders with a deterministic, event-driven cascade simulation engine that tracks downstream propagation along train journeys and resolves secondary conflicts across trains sharing track sections.

```text
Maintenance Block on Section S1
             ↓
    Train A Direct Delay (+20m)
             ↓
    Train A Movement 2 Propagated Delay (+20m on Section S2)
             ↓
    Secondary Conflict: Train A Mov 2 overlaps Train B Mov 1 on S2
             ↓
    Precedence Resolution (Effective Arrival Timing)
             ↓
    Train B receives Secondary Delay (+10m)
             ↓
    Train B Movement 2 Propagated Delay (+10m on Section S3)
             ↓
    Secondary Conflict: Train B Mov 2 overlaps Train C Mov 1 on S3
             ↓
    Train C receives Secondary Delay (+20m)
```

### 22.1 Effective Arrival Timing & Movement State
Timetable precedence calculations must never evaluate against stale original timings after a train has been shifted. Every movement maintains accumulated state:
$$\text{effective\_start} = \text{original\_start} + \text{accumulated\_delay}$$
$$\text{effective\_end} = \text{original\_end} + \text{accumulated\_delay} = \text{effective\_start} + \text{occupancy\_duration}$$

Occupancy duration $(\text{original\_end} - \text{original\_start})$ is strictly invariant.

### 22.2 Two-Way Precedence Resolution Semantics
For any two overlapping train movements on the exact same block section, precedence is determined deterministically in **both directions**:

* **Case A ($\text{effective\_start}_A < \text{effective\_start}_B$)**: Train A retains precedence. Train B must wait until Train A clears.
* **Case B ($\text{effective\_start}_B < \text{effective\_start}_A$)**: Train B retains precedence. Train A must wait until Train B clears.
* **Deterministic Tie-Breaker ($\text{effective\_start}_A == \text{effective\_start}_B$)**:
  1. Earlier original start time (`from_dt`).
  2. Lower train number (`train_number`).
  3. Lower movement index (`movement_index`).

> [!NOTE]
> **PROTOTYPE ASSUMPTION**: Precedence based strictly on effective arrival is a computational prototype convention for automated conflict resolution. It does not represent certified Indian Railways priority dispatch rules. Every secondary delay event records `reason = "PROTOTYPE_ASSUMPTION_PRECEDENCE"`.

### 22.3 Secondary Waiting Delay Calculation
The movement that loses precedence is delayed until the winning movement completely clears the section:
$$\text{secondary\_delay} = \max\left(0, (\text{winner\_effective\_end} - \text{loser\_effective\_start}).\text{total\_minutes}\right)$$

The loser shifts to:
$$\text{new\_start} = \text{loser\_effective\_start} + \text{secondary\_delay}$$
$$\text{new\_end} = \text{new\_start} + \text{duration}$$
The winning movement is never modified. Secondary delay is genuinely new incremental delay and is added to the loser's accumulated delay without double-counting existing inherited delays.

### 22.4 Multi-Tier Cascade Propagation Queue
When a train receives secondary delay, propagation does not halt:
1. The delayed movement is enqueued into an event-driven FIFO queue.
2. All subsequent continuous movements of that train sequence inherit the delay, preserving observed station dwells and gaps.
3. Every downstream shifted movement is rechecked for secondary conflicts on its section.
4. Any newly affected trains are enqueued in turn ($A \to B \to C$).
5. Propagation continues until the queue drains or the technical depth limit is reached.

### 22.5 Sequence Continuity & Broken Boundary Handling
Propagation strictly follows continuous train movements:
$$\text{movement}_i\text{.to\_station} == \text{movement}_{i+1}\text{.from\_station}$$
If a track connection boundary is broken (e.g. missing track connection in the raw timetable dataset), same-train propagation halts immediately at that boundary, recording `BROKEN_SEQUENCE`. No synthetic track connections are invented.

### 22.6 Non-Double-Counting Metric Accounting
Metrics adhere to strict non-double-counting definitions:
* **Direct Delay (`direct_delay_minutes`)**: Initial delay imposed immediately by the maintenance block on directly blocked trains.
* **Propagated Delay (`propagated_delay_minutes`)**: Downstream propagation impact trace metric (sum of downstream movement schedule shifts across sequence). **NON-ADDITIVE TRACE METRIC: Not added to network total delay.**
* **Secondary Delay (`secondary_delay_minutes`)**: Net incremental waiting delay imposed on conflicting trains to clear track section occupancy.
* **Cascade Delay (`cascade_delay_minutes`)**: Equal to secondary delay.
* **Total Network Delay (`total_delay_minutes`)**: Net train-level attributable delay:
  $$\text{total\_delay\_minutes} = \text{direct\_delay\_minutes} + \text{secondary\_delay\_minutes} = \sum_{T \in \text{affected}} \text{final\_attributable\_delay}(T)$$
  Each affected train's final attributable delay equals its net effective completion delay ($\max_{m \in T} \text{delay}_m$). Downstream propagation copies are never counted as separate delay minutes.

### 22.7 Prototype Assumptions & Operational Boundaries
* **Simplified First-Clears Section Model**: When two trains conflict on a section, the train with precedence retains exclusive section occupancy until clearing (`winner_effective_end`), and the loser enters immediately thereafter (`secondary_delay = winner_effective_end - loser_effective_start`). This is an explicit **simplified prototype assumption** for deterministic simulation, not certified railway signaling/interlocking dispatch rules.
* **Phase 2 Bundle Label**: Multi-request bundling reasons in Phase 2 exclusively carry the `[PHASE 2 BUNDLE ESTIMATE]` prefix (obsolete Phase 1 bundle labels are completely removed).
* **Deterministic Tie-Breaker**: When effective arrival timings are identical, precedence is broken deterministically by (1) earlier original start, (2) lower train number, (3) lower movement index.

### 22.8 Termination Guards & Simulation Status
* **`MAX_CASCADE_DEPTH = 20`**: A computational termination guard to prevent runaway propagation across large networks.
* **Status Flags**:
  * `"PHASE_2_DETERMINISTIC"`: Complete propagation without depth truncation or missing data.
  * `"PARTIAL"`: Propagation stopped due to technical depth limit or broken sequence, accompanied by structured reasons:
    * `{"code": "MAX_CASCADE_DEPTH_REACHED", "message": "Cascade propagation stopped at configured technical depth."}`
    * `{"code": "BROKEN_SEQUENCE", "message": "Cascade propagation stopped along train sequence due to missing track connection boundary or movement in dataset."}`

---

## 23. Phase 3 Multi-Factor Impact Scoring

Phase 3 transitions RailNexus Brain from a single-metric objective ($\text{impact\_score} = \text{total\_delay\_minutes}$) to an extensible, deterministic, configurable **Multi-Factor Impact Scoring Architecture**.

### 23.1 Mathematical Formulation
For each candidate maintenance window:
$$\text{impact\_score} = \text{round}\left(w_A \cdot \text{total\_delay} + w_B \cdot \text{affected\_trains} + w_C \cdot \text{train\_priority} + w_D \cdot \text{maintenance\_priority}, 2\right)$$

Where:
* **Weighted Value**: For each factor $i$, $\text{weighted\_value}_i = \text{round}(\text{raw\_value}_i \times w_i, 2)$.
* **Total Score**: $\text{impact\_score} = \text{round}\left(\sum_{i} \text{weighted\_value}_i, 2\right)$.
* **Score Breakdown**: Every calculation produces a 4-element audit breakdown list detailing each factor's raw value, weight, weighted value, status, source, and details.

### 23.2 Factor Classifications & Sources

| Factor | Key | Default Weight | Status Flag | Data Classification | Source |
|---|---|---|---|---|---|
| **Factor A: Attributable Delay** | `total_delay` | `1.0` | Active (`DELAY_WEIGHT = 1.0`) | `DATA_BACKED` | `PHASE_2_CASCADE_SIMULATION` |
| **Factor B: Affected Train Count** | `affected_train_count` | `0.0` | `ENABLE_AFFECTED_TRAIN_FACTOR = False` | `DATA_BACKED` | `SIMULATION` |
| **Factor C: Train Priority** | `train_priority` | `0.0` | `ENABLE_TRAIN_PRIORITY_FACTOR = False` | `PROTOTYPE_ASSUMPTION` / `MISSING DATA` | `CONFIGURATION` |
| **Factor D: Maintenance Priority** | `maintenance_priority` | `0.0` | `ENABLE_MAINTENANCE_PRIORITY_FACTOR = False` | `PROTOTYPE_ASSUMPTION` | `CONFIGURATION` |

### 23.3 Default Invariant & Backward Compatibility
Under default configuration:
* `DELAY_WEIGHT = 1.0`
* `AFFECTED_TRAIN_WEIGHT = 0.0` (flag: `False`)
* `TRAIN_PRIORITY_WEIGHT = 0.0` (flag: `False`)
* `MAINTENANCE_PRIORITY_WEIGHT = 0.0` (flag: `False`)

$$\text{impact\_score} \equiv \text{total\_attributable\_delay\_minutes}$$

All existing Phase 1 and Phase 2 optimization outcomes, rankings, candidate window selections, and test invariants are **100% preserved**.

### 23.4 Data Integrity & Anti-Fabrication Rules
1. **Unique Affected Trains**: Factor B and Factor C count unique trains with non-zero attributable delay ($\text{direct} + \text{secondary} > 0$). Downstream movement shifts and repeated delay trace records are never counted as additional trains.
2. **Missing Train Types**: When an affected train's type is missing from the dataset or unmapped in `TRAIN_TYPE_WEIGHTS`, it contributes `0.0` to Factor C and is recorded as `MISSING DATA` in the factor audit details (`details = "Unmapped train types for trains: [...]"`). Synthetic priorities are never fabricated.
3. **Prototype Assumptions & Disclaimers**: Priority weights (`TRAIN_TYPE_WEIGHTS`, `MAINTENANCE_PRIORITY_WEIGHTS`) are computational prototype assumptions and do not represent certified Indian Railways priority dispatch policy. When active, explanations include explicit disclaimer warnings:
   > `[PROTOTYPE DISCLAIMER] This weighting is a prototype configuration and is not an official railway priority policy.`




