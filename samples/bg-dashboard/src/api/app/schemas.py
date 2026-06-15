from datetime import datetime

from pydantic import BaseModel, Field


class GlucosePoint(BaseModel):
    timestamp: datetime | None = None
    glucose: float


class AnalysisResponse(BaseModel):
    sample_count: int
    mean_glucose: float
    min_glucose: float
    max_glucose: float
    std_glucose: float
    trend_slope: float
    points: list[GlucosePoint]


class ForecastRequest(BaseModel):
    horizon: int = Field(default=6, ge=1, le=48)
    lookback: int = Field(default=12, ge=4, le=72)
    epochs: int = Field(default=60, ge=1, le=500)


class ForecastResponse(BaseModel):
    horizon: int
    predictions: list[float]
    loss_history: list[float]
    analysis: AnalysisResponse

