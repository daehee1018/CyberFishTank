import { useEffect, useState } from 'react';

interface FeedingDay {
  date: string;
  count: number;
}

interface FeedingCalendarProps {
  apiBase: string;
  lastFeedAt: string | null;
}

const koreanDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

export default function FeedingCalendar({ apiBase, lastFeedAt }: FeedingCalendarProps) {
  const today = koreanDate.format(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [history, setHistory] = useState<{ month: string; days: FeedingDay[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const loadHistory = async () => {
      try {
        const response = await fetch(`${apiBase}/api/feeder/history?month=${month}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error('급여 기록을 불러오지 못했습니다.');
        }
        if (!controller.signal.aborted) {
          setHistory({ month, days: data.days });
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('급여 기록을 불러오지 못했습니다.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadHistory();
    return () => controller.abort();
  }, [apiBase, month, lastFeedAt, retry]);

  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
  const days = history?.month === month ? history.days : [];
  const counts = new Map(days.map((day) => [day.date, day.count]));

  const moveMonth = (offset: number) => {
    setMonth((current) => {
      const [currentYear, currentMonth] = current.split('-').map(Number);
      const next = new Date(Date.UTC(currentYear, currentMonth - 1 + offset, 1));
      return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  };

  return (
    <section aria-label="먹이급여 달력" className="min-w-0 rounded-[18px] border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-900">먹이급여 달력</h2>
      <div className="mt-3 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="이전 달"
          disabled={month === '1000-01'}
          onClick={() => moveMonth(-1)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-30"
        >
          {'<'}
        </button>
        <span aria-live="polite" className="text-xs font-semibold text-slate-900">{year}년 {monthNumber}월</span>
        <button
          type="button"
          aria-label="다음 달"
          disabled={month === '9999-12'}
          onClick={() => moveMonth(1)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-30"
        >
          {'>'}
        </button>
      </div>

      <table aria-label={`${year}년 ${monthNumber}월 먹이급여 기록`} aria-busy={loading} className="mt-2 w-full table-fixed border-separate border-spacing-y-1 text-center text-[11px]">
        <thead>
          <tr>
            {weekdays.map((day, index) => (
              <th key={day} scope="col" className={`pb-1 font-normal ${index === 0 ? 'text-rose-500' : index === 6 ? 'text-sky-600' : 'text-slate-500'}`}>{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: weekCount }, (_, week) => (
            <tr key={week}>
              {weekdays.map((_, weekday) => {
                const day = week * 7 + weekday - firstWeekday + 1;
                if (day < 1 || day > daysInMonth) return <td key={weekday} />;
                const date = `${month}-${String(day).padStart(2, '0')}`;
                const count = counts.get(date) ?? 0;
                const isToday = date === today;
                const label = `${monthNumber}월 ${day}일${isToday ? ', 오늘' : ''}, ${count > 0 ? `급여 완료 ${count}회` : loading || error ? '급여 기록 확인 중' : '급여 기록 없음'}`;

                return (
                  <td key={weekday} className="p-0 align-top">
                    <div
                      aria-label={label}
                      aria-current={isToday ? 'date' : undefined}
                      title={label}
                      className={`flex min-h-10 min-w-0 flex-col items-center justify-center rounded-md ${count > 0 ? 'bg-teal-50 font-semibold text-teal-700' : 'text-slate-600'} ${isToday ? 'ring-1 ring-inset ring-teal-600' : ''}`}
                    >
                      <span aria-hidden="true">{day}</span>
                      <span aria-hidden="true" className="h-3 text-[9px] leading-3">{count > 0 ? `✓ ${count}` : ''}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div aria-live="polite" className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-500">
        {loading ? <p>급여 기록을 불러오는 중...</p> : error ? (
          <div>
            <p role="alert" className="text-red-600">{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="text-teal-700 underline">다시 불러오기</button>
          </div>
        ) : (
          <p className="font-semibold text-teal-700">✓ 급여 완료·횟수</p>
        )}
      </div>
    </section>
  );
}
