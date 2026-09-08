<img width="1433" height="671" alt="image" src="https://github.com/user-attachments/assets/0891928f-3f18-4cdb-98b1-c66f58bac948" />


RailNexus — Intelligent Railway Maintenance Coordination & Decision Support System
Human-In-The-Loop AI Decision Support System for Indian Railways (Central Railway: Mumbai CSMT ⟷ Pune JN Corridor)

🏛️ System Architecture
               ENGINEERING / S&T / OHE DEPARTMENTS
                                │
                                │ (Submit Maintenance Requests)
                                ↓
                      ┌───────────────────┐
                      │  MAINTENANCE UI   │
                      └─────────┬─────────┘
                                │
                                ↓
                      ┌───────────────────┐
                      │    NESTJS API     │
                      └─────────┬─────────┘
                                │
                                ↓
                      ┌───────────────────┐
                      │  RAILNEXUS BRAIN  │
                      │                   │
                      │  1. Validation    │
                      │  2. Graph Mapping │
                      │  3. Bundling      │
                      │  4. Conflicts     │
                      │  5. Simulation    │
                      │  6. Optimization  │
                      │  7. Explanation   │
                      └─────────┬─────────┘
                                │
                                ↓
                      Recommended Block Plan
                                │
                                ↓
                      ┌───────────────────┐
                      │  CONTROLLER HUB   │
                      │                   │
                      │ • View Simulation │
                      │ • View Conflicts  │
                      │ • Compare Alts    │
                      │ • View Map        │
                      │                   │
                      │ [APPROVE/MODIFY/  │
                      │     REJECT]       │
                      └─────────┬─────────┘
                                │
                                ↓
                      Immutable Audit Trail
🚀 Quick Start (Running Locally)
1. Start the RailNexus Python Brain (FastAPI)
cd brain/optimization-service
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
2. Start the Backend API (Express / NestJS)
cd backend
npm install
npm run dev
3. Start the Next.js Frontend
cd frontend
npm install
npm run dev
Open http://localhost:3000 in your browser.

🐳 Docker Deployment
To run all services containerized:

docker-compose up --build
Frontend: http://localhost:3000
Backend API: http://localhost:5000
Brain FastAPI Docs: http://localhost:8000/docs
🧠 Brain Capabilities & Algorithms
Data Guardian: Deterministic verification of 52 stations, 51 track sections, and 3,890 movements. 99.6% dataset confidence.
NetworkX Directed Graph: Station nodes and directed track sections representing Mumbai CSMT ⟷ Pune JN.
Multi-Department Bundling: Automatically groups compatible track repair (Engineering), signal calibration (S&T), and catenary maintenance (OHE) on the same section into a single unified block.
Direction-Aware Conflict Engine: Directional interval overlap min(entry, exit) ➔ max(entry, exit) detecting all train overlaps without hidden data.
Deterministic Delay & Cascade Simulation: Direct waiting time calculations + 5-hop recursive downstream propagation.
Objective Scoring: Multi-factor penalty scoring weighting direct delay, cascade delay, conflicts, and high-priority train preservation.
Explainability Engine (WHY?): Generates human-readable, calculation-backed reasons for every recommendation.
What-If Simulation: Instant re-simulation when a controller adjusts a window (e.g. testing 2:00 PM – 4:00 PM vs 1:00 PM – 3:00 PM).
🧪 Testing
Run the comprehensive test suite:

cd brain/optimization-service
python tests/test_brain.py
(8/8 Unit & Integration tests passing in 0.065s)
