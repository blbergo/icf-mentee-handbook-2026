from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import AnalysisResponse, ForecastResponse
from app.services.forecast import train_and_forecast
from app.services.glucose import build_analysis, load_glucose_series
from app.settings import get_settings

settings = get_settings()
app = FastAPI(title="bg-dashboard API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(f"{settings.api_prefix}/analysis/upload", response_model=AnalysisResponse)
async def analyze_upload(file: UploadFile = File(...)) -> AnalysisResponse:
    try:
        series = await load_glucose_series(file)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if len(series.values) < 4:
        raise HTTPException(status_code=400, detail="Upload at least four glucose readings.")

    return build_analysis(series)


@app.post(f"{settings.api_prefix}/predictions/upload", response_model=ForecastResponse)
async def predict_upload(
    file: UploadFile = File(...),
    horizon: int = Query(default=6, ge=1, le=48),
    lookback: int = Query(default=12, ge=4, le=72),
    epochs: int = Query(default=60, ge=1, le=500),
) -> ForecastResponse:
    try:
        series = await load_glucose_series(file)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    analysis = build_analysis(series)
    try:
        forecast = train_and_forecast(series.values, lookback, horizon, epochs)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return ForecastResponse(
        horizon=horizon,
        predictions=forecast.predictions,
        loss_history=forecast.loss_history,
        analysis=analysis
    )
