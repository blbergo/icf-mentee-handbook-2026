import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type Metric = { label: string; value: string };

type AnalysisResponse = {
  sample_count: number;
  mean_glucose: number;
  min_glucose: number;
  max_glucose: number;
  std_glucose: number;
  trend_slope: number;
};

type ForecastResponse = {
  horizon: number;
  predictions: number[];
  loss_history: number[];
  analysis: AnalysisResponse;
};

type CsvPoint = {
  timestamp: string;
  glucose: number;
};

type PredictionFileRecord = {
  id: string;
  name: string;
  points: CsvPoint[];
};

type PredictionStore = {
  files: PredictionFileRecord[];
  selectedFileId: string;
  period: PeriodKey;
  forecast: ForecastResponse | null;
};

type SeriesPoint = {
  time: string;
  actual: number | null;
  predicted: number | null;
};

type PeriodKey = 'hour' | 'day' | 'week';

const PERIODS: Record<PeriodKey, { label: string; horizon: number; lookback: number; epochs: number }> = {
  hour: { label: 'Hour', horizon: 1, lookback: 6, epochs: 20 },
  day: { label: 'Day', horizon: 24, lookback: 12, epochs: 30 },
  week: { label: 'Week', horizon: 168, lookback: 24, epochs: 40 }
};

const samplePoints = [
  { time: '08:00', glucose: 95 },
  { time: '10:00', glucose: 112 },
  { time: '12:00', glucose: 128 },
  { time: '14:00', glucose: 118 },
  { time: '16:00', glucose: 104 },
  { time: '18:00', glucose: 109 }
];

const PREDICTION_STORE_KEY = 'bg-dashboard:prediction-store';
const DEFAULT_PREDICTION_POINTS: CsvPoint[] = [
  { timestamp: '2026-06-01T06:00:00', glucose: 92 },
  { timestamp: '2026-06-01T07:00:00', glucose: 96 },
  { timestamp: '2026-06-01T08:00:00', glucose: 101 },
  { timestamp: '2026-06-01T09:00:00', glucose: 108 },
  { timestamp: '2026-06-01T10:00:00', glucose: 113 },
  { timestamp: '2026-06-01T11:00:00', glucose: 117 },
  { timestamp: '2026-06-01T12:00:00', glucose: 121 },
  { timestamp: '2026-06-01T13:00:00', glucose: 118 },
  { timestamp: '2026-06-01T14:00:00', glucose: 115 },
  { timestamp: '2026-06-01T15:00:00', glucose: 110 },
  { timestamp: '2026-06-01T16:00:00', glucose: 106 },
  { timestamp: '2026-06-01T17:00:00', glucose: 103 },
  { timestamp: '2026-06-01T18:00:00', glucose: 107 },
  { timestamp: '2026-06-01T19:00:00', glucose: 112 },
  { timestamp: '2026-06-01T20:00:00', glucose: 116 },
  { timestamp: '2026-06-01T21:00:00', glucose: 120 },
  { timestamp: '2026-06-01T22:00:00', glucose: 124 },
  { timestamp: '2026-06-01T23:00:00', glucose: 119 },
  { timestamp: '2026-06-02T00:00:00', glucose: 114 },
  { timestamp: '2026-06-02T01:00:00', glucose: 109 },
  { timestamp: '2026-06-02T02:00:00', glucose: 105 },
  { timestamp: '2026-06-02T03:00:00', glucose: 101 },
  { timestamp: '2026-06-02T04:00:00', glucose: 98 },
  { timestamp: '2026-06-02T05:00:00', glucose: 95 }
];
const DEFAULT_PREDICTION_FILE = createPredictionFileRecord('test-glucose.csv', DEFAULT_PREDICTION_POINTS);

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
}

function formatLabel(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function parseGlucoseCsv(text: string): CsvPoint[] {
  const [headerLine, ...rows] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(',').map((value) => value.trim().toLowerCase());
  const timestampIndex = headers.findIndex((value) => ['timestamp', 'time', 'datetime', 'date'].includes(value));
  const glucoseIndex = headers.findIndex((value) => ['glucose', 'value', 'reading', 'bg'].includes(value));

  if (timestampIndex < 0 || glucoseIndex < 0) {
    throw new Error("CSV must include timestamp and glucose columns.");
  }

  return rows
    .map((row) => row.split(',').map((value) => value.trim()))
    .filter((cells) => cells.length > Math.max(timestampIndex, glucoseIndex))
    .map((cells) => {
      const timestamp = new Date(cells[timestampIndex]);
      const glucose = Number(cells[glucoseIndex]);

      if (Number.isNaN(timestamp.getTime()) || Number.isNaN(glucose)) {
        return null;
      }

      return { timestamp: timestamp.toISOString(), glucose };
    })
    .filter((point): point is CsvPoint => point !== null);
}

function buildSeries(points: CsvPoint[], predictions: number[]): SeriesPoint[] {
  if (points.length === 0) {
    return [];
  }

  const actualSeries = points.map((point) => ({
    time: formatLabel(point.timestamp),
    actual: point.glucose,
    predicted: null
  }));

  const stepMs =
    points.length > 1
      ? new Date(points[1].timestamp).getTime() - new Date(points[0].timestamp).getTime()
      : 60 * 60 * 1000;
  const lastTime = new Date(points[points.length - 1].timestamp).getTime();

  const forecastSeries = predictions.map((value, index) => {
    const timestamp = new Date(lastTime + stepMs * (index + 1)).toISOString();
    return {
      time: formatLabel(timestamp),
      actual: null,
      predicted: value
    };
  });

  return [...actualSeries, ...forecastSeries];
}

function csvPointsToText(points: CsvPoint[]) {
  return ['timestamp,glucose', ...points.map((point) => `${point.timestamp},${point.glucose}`)].join('\n');
}

function createPredictionFileRecord(name: string, points: CsvPoint[]): PredictionFileRecord {
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${points.length}-${points[0]?.timestamp ?? 'empty'}`,
    name,
    points
  };
}

function loadPredictionStore(): PredictionStore {
  if (typeof window === 'undefined') {
    return {
      files: [DEFAULT_PREDICTION_FILE],
      selectedFileId: DEFAULT_PREDICTION_FILE.id,
      period: 'day',
      forecast: null
    };
  }

  const raw = window.localStorage.getItem(PREDICTION_STORE_KEY);
  if (!raw) {
    return {
      files: [DEFAULT_PREDICTION_FILE],
      selectedFileId: DEFAULT_PREDICTION_FILE.id,
      period: 'day',
      forecast: null
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PredictionStore>;
    const files = parsed.files?.length ? parsed.files : [DEFAULT_PREDICTION_FILE];
    const selectedFileId = parsed.selectedFileId ?? files[0].id;

    return {
      files,
      selectedFileId: files.some((file) => file.id === selectedFileId) ? selectedFileId : files[0].id,
      period: parsed.period === 'hour' || parsed.period === 'day' || parsed.period === 'week' ? parsed.period : 'day',
      forecast: parsed.forecast ?? null
    };
  } catch {
    return {
      files: [DEFAULT_PREDICTION_FILE],
      selectedFileId: DEFAULT_PREDICTION_FILE.id,
      period: 'day',
      forecast: null
    };
  }
}

function usePredictionStore() {
  const [store, setStore] = useState<PredictionStore>(() => loadPredictionStore());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PREDICTION_STORE_KEY, JSON.stringify(store));
    }
  }, [store]);

  return [store, setStore] as const;
}

function getSelectedFile(store: PredictionStore) {
  return store.files.find((file) => file.id === store.selectedFileId) ?? store.files[0];
}

async function savePredictionFileFromUpload(file: File) {
  const points = parseGlucoseCsv(await file.text());
  const record = createPredictionFileRecord(file.name, points);
  const currentStore = loadPredictionStore();

  const nextStore: PredictionStore = {
    ...currentStore,
    files: [...currentStore.files.filter((item) => item.name !== record.name), record],
    selectedFileId: record.id,
    forecast: null
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PREDICTION_STORE_KEY, JSON.stringify(nextStore));
  }
}

function Shell() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">bg-dashboard</p>
            <p className="text-sm text-slate-400">Upload, analyze, and forecast glucose trends</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <NavLink className={({ isActive }) => (isActive ? 'text-cyan-300' : 'text-slate-300')} to="/">
              Dashboard
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? 'text-cyan-300' : 'text-slate-300')} to="/upload">
              Upload
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/prediction" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard() {
  const [predictionStore, setPredictionStore] = usePredictionStore();
  const selectedPredictionFile = getSelectedFile(predictionStore);
  const usingSampleReadings = selectedPredictionFile?.id === DEFAULT_PREDICTION_FILE.id;
  const dashboardReadings = usingSampleReadings
    ? samplePoints
    : selectedPredictionFile?.points.map((point) => ({
        time: formatLabel(point.timestamp),
        glucose: point.glucose
      })) ?? samplePoints;
  const metrics: Metric[] = useMemo(
    () => [
      { label: 'Average', value: '111 mg/dL' },
      { label: 'Range', value: '95–128 mg/dL' },
      { label: 'Trend', value: 'Mild upward drift' },
      { label: 'Forecast', value: '+8 mg/dL next 2h' }
    ],
    []
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Blood sugar trend dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">Accessible, mobile-friendly analysis of uploaded data.</p>
          </div>
          <Link className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950" to="/upload">
            Upload data
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-2xl bg-slate-950 p-4">
              <p className="text-sm text-slate-400">{metric.label}</p>
              <p className="mt-2 text-xl font-semibold">{metric.value}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-slate-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{usingSampleReadings ? 'Recent readings' : 'Selected readings'}</h2>
            <span className="text-xs text-slate-500">
              {usingSampleReadings ? 'Sample preview' : selectedPredictionFile?.name}
            </span>
          </div>
          <ul className="space-y-3">
            {dashboardReadings.map((point) => (
              <li key={point.time} className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3">
                <span className="text-slate-300">{point.time}</span>
                <span className="font-medium">{point.glucose} mg/dL</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold">Prediction model</h2>
          <p className="mt-2 text-sm text-slate-400">
            The backend trains an RNN or LSTM per upload so forecasts stay tied to the user&apos;s own data.
          </p>
        </section>
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold">Responsive by default</h2>
          <p className="mt-2 text-sm text-slate-400">
            Layouts stack on mobile, preserve readable spacing, and keep controls keyboard-accessible.
          </p>
        </section>
      </aside>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
        <PredictionPanel store={predictionStore} setStore={setPredictionStore} />
      </section>
    </div>
  );
}

function UploadPage() {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!file) {
      setError('Choose a CSV file before running analysis.');
      return;
    }

    const payload = new FormData();
    payload.append('file', file);

    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl()}/api/v1/analysis/upload`, {
        method: 'POST',
        body: payload
      });

      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail.detail ?? 'Analysis request failed.');
      }

      setAnalysis((await response.json()) as AnalysisResponse);
      await savePredictionFileFromUpload(file);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Analysis request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Upload glucose data</h1>
          <p className="mt-2 text-sm text-slate-400">Analyze a CSV before saving it for dashboard predictions.</p>
        </div>
        <Link className="text-sm font-semibold text-cyan-300" to="/">
          Go to dashboard
        </Link>
      </div>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Dataset name</span>
          <input
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My glucose log"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">CSV file</span>
          <input
            className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300"
            type="file"
            accept=".csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          className="rounded-full bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? 'Running analysis...' : 'Analyze data'}
        </button>
      </form>

      {error ? <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}

      {analysis ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl bg-slate-950 p-4">
            <h2 className="font-semibold">Analysis</h2>
            <dl className="mt-3 space-y-2 text-sm text-slate-300">
              <div className="flex justify-between">
                <dt>Samples</dt>
                <dd>{analysis.sample_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Mean</dt>
                <dd>{analysis.mean_glucose.toFixed(1)} mg/dL</dd>
              </div>
              <div className="flex justify-between">
                <dt>Trend slope</dt>
                <dd>{analysis.trend_slope.toFixed(2)}</dd>
              </div>
            </dl>
          </article>
          <article className="rounded-2xl bg-slate-950 p-4">
            <h2 className="font-semibold">Next step</h2>
            <p className="mt-3 text-sm text-slate-300">
              Open the dashboard prediction panel to compare actual and predicted values with a draggable Recharts timeline.
            </p>
          </article>
        </div>
      ) : null}

      {name ? <p className="mt-4 text-xs uppercase tracking-[0.25em] text-slate-500">Dataset: {name}</p> : null}
    </section>
  );
}

function PredictionPanel({
  store,
  setStore
}: {
  store: PredictionStore;
  setStore: Dispatch<SetStateAction<PredictionStore>>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedFile = getSelectedFile(store);
  const config = PERIODS[store.period];

  const chartData = useMemo(() => {
   if (!store.forecast || !selectedFile) {
     return [];
   }

   return buildSeries(selectedFile.points, store.forecast.predictions);
  }, [selectedFile, store.forecast]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
   event.preventDefault();
   setError('');

   if (!selectedFile) {
     setError('Choose a prediction file before running predictions.');
     return;
   }

   if (selectedFile.points.length < config.lookback + 1) {
     setError(`Upload more data for the ${config.label.toLowerCase()} view.`);
     return;
   }

   const payload = new FormData();
   payload.append(
     'file',
     new File([csvPointsToText(selectedFile.points)], selectedFile.name, {
       type: 'text/csv'
     })
   );

   setLoading(true);
   try {
     const response = await fetch(
       `${apiBaseUrl()}/api/v1/predictions/upload?horizon=${config.horizon}&lookback=${config.lookback}&epochs=${config.epochs}`,
       {
         method: 'POST',
         body: payload
       }
     );

     if (!response.ok) {
       const detail = await response.json();
       throw new Error(detail.detail ?? 'Prediction request failed.');
     }

     const forecast = (await response.json()) as ForecastResponse;
     setStore((current) => ({
       ...current,
       forecast
     }));
   } catch (submitError) {
     setError(submitError instanceof Error ? submitError.message : 'Prediction request failed.');
   } finally {
     setLoading(false);
   }
  }

  return (
   <div className="space-y-6">
     <div className="flex flex-wrap items-start justify-between gap-4">
       <div>
         <h2 className="text-2xl font-semibold">Prediction comparison</h2>
         <p className="mt-2 text-sm text-slate-400">
           Pick a saved CSV, keep it across refreshes, and drag the Recharts brush to inspect actual versus predicted output.
         </p>
       </div>
     </div>

     <form className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end" onSubmit={handleSubmit}>
       <label className="block">
         <span className="mb-2 block text-sm font-medium">Saved file</span>
         <select
           className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
           value={store.selectedFileId}
           onChange={(event) =>
             setStore((current) => ({
               ...current,
               selectedFileId: event.target.value,
               forecast: null
             }))
           }
         >
           {store.files.map((file) => (
             <option key={file.id} value={file.id}>
               {file.name}
             </option>
           ))}
         </select>
       </label>
       <label className="block">
         <span className="mb-2 block text-sm font-medium">Time period</span>
         <select
           className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
           value={store.period}
           onChange={(event) =>
             setStore((current) => ({
               ...current,
               period: event.target.value as PeriodKey,
               forecast: null
             }))
           }
         >
           <option value="hour">Hour</option>
           <option value="day">Day</option>
           <option value="week">Week</option>
         </select>
       </label>
       <button
         className="rounded-full bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 md:col-start-2"
         disabled={loading}
         type="submit"
       >
         {loading ? 'Generating forecast...' : 'Compare actual vs predicted'}
       </button>
     </form>

     {error ? <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}

     {store.forecast && chartData.length > 0 ? (
       <div className="space-y-6">
         <div className="grid gap-4 sm:grid-cols-3">
           <article className="rounded-2xl bg-slate-950 p-4">
             <p className="text-sm text-slate-400">Period</p>
             <p className="mt-2 text-xl font-semibold">{config.label}</p>
           </article>
           <article className="rounded-2xl bg-slate-950 p-4">
             <p className="text-sm text-slate-400">Forecast horizon</p>
             <p className="mt-2 text-xl font-semibold">{store.forecast.horizon} steps</p>
           </article>
           <article className="rounded-2xl bg-slate-950 p-4">
             <p className="text-sm text-slate-400">Selected file</p>
             <p className="mt-2 text-xl font-semibold">{selectedFile?.name}</p>
           </article>
         </div>

         <div className="h-[420px] rounded-3xl border border-slate-800 bg-slate-950 p-4">
           <ResponsiveContainer width="100%" height="100%">
             <LineChart data={chartData}>
               <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
               <XAxis dataKey="time" stroke="#94a3b8" minTickGap={24} />
               <YAxis stroke="#94a3b8" />
               <Tooltip
                 contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: 16 }}
                 labelStyle={{ color: '#cbd5e1' }}
               />
               <Legend />
               <Line type="monotone" dataKey="actual" name="Actual" stroke="#22d3ee" strokeWidth={3} dot={false} />
               <Line
                 type="monotone"
                 dataKey="predicted"
                 name="Predicted"
                 stroke="#f59e0b"
                 strokeWidth={3}
                 strokeDasharray="6 4"
                 dot={false}
               />
               <Brush dataKey="time" height={28} stroke="#22d3ee" travellerWidth={12} />
             </LineChart>
           </ResponsiveContainer>
         </div>
       </div>
     ) : (
       <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
         Choose a saved CSV and run a comparison to render the actual/predicted chart.
       </div>
     )}
   </div>
  );
}

export default function App() {
  return <Shell />;
}
