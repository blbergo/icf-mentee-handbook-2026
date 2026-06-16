# bg-dashboard

`bg-dashboard` is a full-stack sample for uploading blood sugar data, reviewing trend analysis, and generating per-upload forecasts with a FastAPI backend.

## Layout

- `src/web`: React Router + Tailwind frontend
- `src/api`: FastAPI + LSTM backend
- `docker-compose.yml`: local orchestration
- `data/test-glucose.csv`: sample upload fixture
- The dashboard includes a persisted prediction panel with a draggable Recharts comparison chart and selectable CSV source.
- Uploading and analyzing a CSV stores it in the prediction library automatically, so there is no separate add-file step.

## Local development

1. Start the API from `samples/bg-dashboard/src/api` with `uvicorn app.main:app --reload`.
2. Start the frontend from `samples/bg-dashboard/src/web` with `pnpm install` and `pnpm dev`.
3. Or run `docker compose up --build` from `samples/bg-dashboard`.
