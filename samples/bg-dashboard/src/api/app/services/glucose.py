from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import StringIO

import numpy as np
import pandas as pd
from fastapi import UploadFile

from app.schemas import AnalysisResponse, GlucosePoint

TIMESTAMP_COLUMNS = ("timestamp", "time", "datetime", "date", "recorded_at")
GLUCOSE_COLUMNS = ("glucose", "bg", "blood_glucose", "value", "reading")


@dataclass
class GlucoseSeries:
    timestamps: list[datetime | None]
    values: list[float]


def _pick_column(frame: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    lowered = {column.lower(): column for column in frame.columns}
    for candidate in candidates:
        if candidate in lowered:
            return lowered[candidate]
    return None


async def load_glucose_series(file: UploadFile) -> GlucoseSeries:
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise ValueError("Only CSV uploads are supported for this sample.")

    content = (await file.read()).decode("utf-8")
    frame = pd.read_csv(StringIO(content))
    glucose_column = _pick_column(frame, GLUCOSE_COLUMNS)
    if glucose_column is None:
        raise ValueError("CSV must contain a glucose column such as 'glucose' or 'value'.")

    timestamp_column = _pick_column(frame, TIMESTAMP_COLUMNS)
    timestamps: list[datetime | None]
    if timestamp_column is not None:
        timestamps = [pd.to_datetime(value, errors="coerce").to_pydatetime() if not pd.isna(value) else None for value in frame[timestamp_column]]
    else:
        timestamps = [None] * len(frame)

    values = [float(value) for value in frame[glucose_column].astype(float).tolist()]
    return GlucoseSeries(timestamps=timestamps, values=values)


def build_analysis(series: GlucoseSeries) -> AnalysisResponse:
    values = np.asarray(series.values, dtype=np.float32)
    timestamps = series.timestamps
    points = [GlucosePoint(timestamp=timestamps[index], glucose=float(values[index])) for index in range(len(values))]

    x = np.arange(len(values), dtype=np.float32)
    slope = float(np.polyfit(x, values, 1)[0]) if len(values) > 1 else 0.0

    return AnalysisResponse(
        sample_count=len(values),
        mean_glucose=float(values.mean()),
        min_glucose=float(values.min()),
        max_glucose=float(values.max()),
        std_glucose=float(values.std(ddof=0)),
        trend_slope=slope,
        points=points
    )
