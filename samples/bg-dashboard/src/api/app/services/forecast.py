from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
from torch import nn


class LSTMForecaster(nn.Module):
    def __init__(self, hidden_size: int = 32):
        super().__init__()
        self.lstm = nn.LSTM(input_size=1, hidden_size=hidden_size, batch_first=True)
        self.head = nn.Linear(hidden_size, 1)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        output, _ = self.lstm(inputs)
        return self.head(output[:, -1, :])


@dataclass
class ForecastResult:
    predictions: list[float]
    loss_history: list[float]


def _normalize(values: np.ndarray) -> tuple[np.ndarray, float, float]:
    minimum = float(values.min())
    maximum = float(values.max())
    scale = maximum - minimum or 1.0
    return (values - minimum) / scale, minimum, maximum


def _denormalize(values: np.ndarray, minimum: float, maximum: float) -> np.ndarray:
    return values * (maximum - minimum or 1.0) + minimum


def _build_dataset(values: np.ndarray, lookback: int) -> tuple[torch.Tensor, torch.Tensor]:
    sequences = []
    targets = []
    for index in range(len(values) - lookback):
        sequences.append(values[index : index + lookback])
        targets.append(values[index + lookback])
    x = torch.tensor(np.asarray(sequences), dtype=torch.float32).unsqueeze(-1)
    y = torch.tensor(np.asarray(targets), dtype=torch.float32).unsqueeze(-1)
    return x, y


def train_and_forecast(values: list[float], lookback: int, horizon: int, epochs: int) -> ForecastResult:
    series = np.asarray(values, dtype=np.float32)
    if len(series) <= lookback:
        raise ValueError("Not enough data points to train the forecast model.")

    normalized, minimum, maximum = _normalize(series)
    x, y = _build_dataset(normalized, lookback)

    model = LSTMForecaster()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    loss_fn = nn.MSELoss()
    loss_history: list[float] = []

    for _ in range(epochs):
        optimizer.zero_grad()
        outputs = model(x)
        loss = loss_fn(outputs, y)
        loss.backward()
        optimizer.step()
        loss_history.append(float(loss.item()))

    window = normalized[-lookback:].copy()
    predictions = []
    model.eval()
    with torch.no_grad():
        for _ in range(horizon):
            sample = torch.tensor(window, dtype=torch.float32).view(1, lookback, 1)
            next_value = float(model(sample).item())
            predictions.append(next_value)
            window = np.append(window[1:], next_value)

    return ForecastResult(predictions=_denormalize(np.asarray(predictions), minimum, maximum).round(2).tolist(), loss_history=loss_history)

