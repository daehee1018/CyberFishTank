import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import RecordChart from './RecordChart';

interface Reading { timestamp: string; temperature: number | string | null }
const API_BASE = import.meta.env.VITE_API_URL || 'https://ggnu.site';

export default function MobileTemperatureTrend() {
  const { currentUser, sensorHistory } = useAppContext();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [status, setStatus] = useState('수온 기록을 불러오는 중...');

  useEffect(() => {
    const controller = new AbortController();
    setReadings([]);
    setStatus('수온 기록을 불러오는 중...');
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    fetch(`${API_BASE}/api/sensor-data/range?${query}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('수온 기록을 불러오지 못했습니다.');
        const result = await response.json();
        if (result.success === false) throw new Error('수온 기록을 불러오지 못했습니다.');
        const rows = Array.isArray(result) ? result : result.data ?? result.sensorData ?? [];
        setReadings(rows);
        setStatus('최근 1주일의 수온 기록이 없습니다.');
      })
      .catch(error => { if (!controller.signal.aborted) setStatus(error.message || '수온 기록을 불러오지 못했습니다.'); });
    return () => controller.abort();
  }, [currentUser?.id]);

  const data = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(end);
      date.setDate(date.getDate() - 6 + index);
      return { date, values: [] as number[] };
    });
    // A live sample supersedes a persisted sample with the same timestamp.
    const samples = new Map([...readings, ...sensorHistory].map(row => [row.timestamp, row]));
    samples.forEach(row => {
      if (row.temperature === null || row.temperature === undefined || row.temperature === '') return;
      const value = Number(row.temperature);
      const date = new Date(row.timestamp);
      if (!Number.isFinite(value) || Number.isNaN(date.getTime())) return;
      const day = days.find(day => day.date.toDateString() === date.toDateString());
      day?.values.push(value);
    });
    return days.map(({ date, values }) => ({
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      timestamp: date.toISOString(),
      value: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null,
    }));
  }, [readings, sensorHistory]);
  const values = data.flatMap(row => row.value === null ? [] : [row.value]);

  return <section className="cft-panel cft-mobile-trend">
    <div className="cft-panel-heading"><h2>수온 변화</h2><Link to="/records" state={{ tab: '수온 그래프' }} className="cft-text-link">기록 보기</Link></div>
    {values.length ? <RecordChart data={data} title="최근 1주 수온 변화" min={Math.min(...values) - .5} max={Math.max(...values) + .5} color="#148e98" valueSuffix="°C" /> : <p className="cft-mobile-trend-empty" role="status">{status}</p>}
    <p className="cft-caption">최근 1주 · 일별 평균</p>
  </section>;
}
