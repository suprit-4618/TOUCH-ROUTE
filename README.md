# TouchRoute

### AI-Powered Indoor Navigation and Tactile Mapping for the Visually Impaired

**TouchRoute** is a production-minded accessibility platform engineered to transform indoor building floor plans into accessible navigation experiences through intelligent spatial understanding, deterministic graph wayfinding, voice interaction, and 3D-printable tactile maps.

---

## Stage 1 Architecture & Status

TouchRoute is designed for accessible indoor navigation. Directions are calculated using verified floor plan geometry and graph algorithms rather than unverified estimations.

### Tech Stack Configured
- **Frontend**: React 18, TypeScript 5, Vite, Tailwind CSS, Framer Motion, Lucide Icons, Web Speech API abstraction, Web Audio acoustic cue synthesizer.
- **Backend**: Python 3.10+, FastAPI, Pydantic V2, SQLAlchemy 2.0, NetworkX A* routing engine.
- **AI Vision Architecture**: Provider-independent abstraction (`AIProvider`) supporting Google Gemini (`GeminiProvider`) and future Meta AI vision models (`MetaProvider`).
- **Database**: Dual configuration supporting zero-dependency SQLite for local development and PostgreSQL / PostGIS for production Docker Compose deployments.
- **Packaging & Containers**: Dockerfiles for both services and root `docker-compose.yml` orchestrating PostGIS, FastAPI, and Nginx.

---

## Quickstart Instructions

### 1. Backend (FastAPI + Python)

From the project root:
```bash
# 1. Set PYTHONPATH to backend directory
# On Windows PowerShell:
$env:PYTHONPATH="backend"

# On Linux/macOS:
export PYTHONPATH="backend"

# 2. Run backend test suite (100% pass)
python -m pytest backend/app/tests -v

# 3. Start development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Backend interactive documentation will be live at: `http://localhost:8000/docs`

### 2. Frontend (React + Vite)

In a separate terminal:
```bash
cd frontend

# Run development server
npm run dev
```
Frontend web application will be live at: `http://localhost:5173`

### 3. Containerized Deployment (Docker Compose)

```bash
docker compose up --build
```
This launches PostGIS (Port 5432), FastAPI Backend (Port 8000), and Frontend Nginx proxy (Port 3000).

---

## Key Capabilities

1. **Turn-by-Turn Spoken Guidance**: Conversational spoken directions and landmark cues with Google Gemini TTS synthesis and browser fallback.
2. **Shortest-Path Graph Routing**: Step-free indoor routing using Dijkstra and A* pathfinding over verified floor plan coordinates.
3. **Physical 3D Tactile Maps**: 3D-printable STL relief models with raised walls, corridor paths, and Braille labels.
4. **Interactive Floor Plan Review**: Administrative verification tools to inspect, adjust, and confirm doors, rooms, and transitions.
5. **Screen Reader & Keyboard Navigable**: Semantic HTML, ARIA announcements, and complete keyboard navigation.

