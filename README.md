# TouchRoute

### AI-Powered Indoor Navigation and Tactile Mapping for the Visually Impaired

**TouchRoute** is a production-minded accessibility platform engineered to transform indoor building floor plans into accessible navigation experiences through intelligent spatial understanding, deterministic graph wayfinding, voice interaction, and 3D-printable tactile maps.

---

## Stage 1 Architecture & Status

TouchRoute adheres to strict non-visual first principles and WCAG 2.1 AAA contrast and typography requirements. Rather than hallucinating indoor directions or faking live positioning, the platform relies on verifiable graph topology.

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

## Accessibility Capabilities Built-In

1. **High Contrast Mode**: Instant one-click toggle adhering to strict black and off-white contrast (>7:1).
2. **Scalable Typography**: Standard, Large, and Extra Large font scaling preserved in persistent storage.
3. **Acoustic Audio Feedback**: Web Audio API frequency tones indicating navigation steps and form confirmations.
4. **Reduced Motion**: Respects `prefers-reduced-motion` media query and offers a manual "Calm" override.
5. **Screen Reader Live Regions**: `aria-live="polite"` feedback announcements for every state update and dialog.
6. **Focus Trap & Keyboard Control**: Semantic HTML with visible 3px amber focus rings and Escape key handlers.
7. **Physical Tactile Standards**: 3D printable relief conforming to ISO 21542 and ADA Title III guidelines.

