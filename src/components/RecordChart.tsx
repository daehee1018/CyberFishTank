import { useId, useLayoutEffect, useRef, useState } from 'react';

interface RecordChartPoint {
  label: string;
  value: number | null;
  timestamp: string;
}

interface RecordChartProps {
  data: RecordChartPoint[];
  title: string;
  min: number;
  max: number;
  color: string;
  valueSuffix: string;
  variant?: 'line' | 'bar';
}

export default function RecordChart({
  data, title, min, max, color, valueSuffix, variant = 'line',
}: RecordChartProps) {
  const fillId = `chart-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;

    const measure = () => {
      const { width, height } = plot.getBoundingClientRect();
      setSize((previous) => previous.width === width && previous.height === height
        ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const left = 12;
  const right = Math.max(left, width - 12);
  const top = 16;
  const bottom = Math.max(top, height - 36);
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const valueRange = max - min || 1;
  const slotWidth = plotWidth / Math.max(data.length, 1);
  const xAt = (index: number) => variant === 'bar'
    ? left + slotWidth * (index + 0.5)
    : data.length === 1 ? left + plotWidth / 2
      : left + index * plotWidth / Math.max(data.length - 1, 1);
  const yAt = (value: number) => bottom - (value - min) / valueRange * plotHeight;
  const validIndices = data.flatMap((point, index) =>
    point.value !== null && Number.isFinite(point.value) ? [index] : []);

  // Weekly ranges use their start date on the axis; touch details retain the full range.
  const axisLabels = data.map((point) => point.label.split('~')[0]);
  // Keep every measurement; only thin date labels to fit the available width.
  const labelWidth = Math.max(60, ...axisLabels.map((label) => label.length * 7 + 12));
  // The first/last labels are aligned inward and need extra space beside centered labels.
  const labelCount = Math.min(data.length, Math.max(2, Math.floor(plotWidth / (labelWidth * 1.5)) + 1));
  const labelIndices = new Set(Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * (data.length - 1) / Math.max(labelCount - 1, 1))));
  const path = data.map((point, index) => {
    if (point.value === null || !Number.isFinite(point.value)) {
      return '';
    }
    const previous = data[index - 1];
    const command = previous?.value != null && Number.isFinite(previous.value) ? 'L' : 'M';
    return `${command}${xAt(index)},${yAt(point.value)}`;
  }).join(' ');
  // Close each uninterrupted segment separately so missing dates stay visible as gaps.
  const areaSegments: string[] = [];
  let segment: number[] = [];
  const closeSegment = () => {
    if (segment.length) {
      areaSegments.push(`M${xAt(segment[0])},${bottom} ` + segment.map(index =>
        `L${xAt(index)},${yAt(data[index].value!)}`).join(' ') +
        ` L${xAt(segment[segment.length - 1])},${bottom} Z`);
      segment = [];
    }
  };
  data.forEach((point, index) => {
    if (point.value !== null && Number.isFinite(point.value)) segment.push(index);
    else closeSegment();
  });
  closeSegment();
  const selected = selectedIndex === null ? undefined : data[selectedIndex];

  const selectAt = (clientX: number) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!bounds || validIndices.length === 0) return;
    const x = clientX - bounds.left;
    setSelectedIndex(validIndices.reduce((nearest, index) =>
      Math.abs(xAt(index) - x) < Math.abs(xAt(nearest) - x) ? index : nearest));
  };

  return (
    <div className="cft-record-chart">
      <div className="cft-record-chart-plot" ref={plotRef}>
        {width > 0 && height > 0 && (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${title}. 날짜별 값을 터치하거나 좌우 방향키로 확인하세요.`}
            tabIndex={0}
            onPointerDown={(event) => selectAt(event.clientX)}
            onPointerMove={(event) => selectAt(event.clientX)}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') setSelectedIndex(null);
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
                || validIndices.length === 0) return;
              event.preventDefault();
              const current = selectedIndex === null ? -1 : validIndices.indexOf(selectedIndex);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? validIndices.length - 1
                : Math.max(0, Math.min(validIndices.length - 1,
                  current + (event.key === 'ArrowLeft' ? -1 : 1)));
              setSelectedIndex(validIndices[next]);
            }}
          >
            <title>{title}</title>
            <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            {variant === 'line' && areaSegments.map((area, index) => <path key={index} d={area} fill={`url(#${fillId})`} />)}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line key={ratio} x1={left} x2={right}
                y1={top + ratio * plotHeight} y2={top + ratio * plotHeight}
                stroke="var(--cft-chart-grid, #e0eae8)" strokeDasharray="4 4" />
            ))}
            {variant === 'line' && (
              <path d={path} fill="none" stroke={color} strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
            )}
            {validIndices.map((index) => {
              const point = data[index];
              const x = xAt(index);
              const y = yAt(point.value!);
              const active = index === selectedIndex;
              const barWidth = Math.min(64, slotWidth * 0.7);
              return variant === 'bar' ? (
                <rect key={`${point.timestamp}-${index}`} x={x - barWidth / 2} y={y}
                  width={barWidth} height={Math.max(0, bottom - y)} rx={Math.min(6, barWidth / 2)}
                  fill={color} opacity={active ? 1 : 0.8} />
              ) : (active || plotWidth / Math.max(data.length - 1, 1) >= 12) ? (
                <circle key={`${point.timestamp}-${index}`} cx={x} cy={y}
                  r={active ? 5 : 3} fill={color} stroke="var(--cft-surface, white)" strokeWidth={1.5} />
              ) : null;
            })}
            {Array.from(labelIndices).map((index) => (
              <text key={index} x={xAt(index)} y={height - 12}
                textAnchor={data.length === 1 ? 'middle' : index === 0 ? 'start'
                  : index === data.length - 1 ? 'end' : 'middle'}
                fontSize={12} fill="var(--cft-chart-label, #668080)">
                {axisLabels[index]}
              </text>
            ))}
          </svg>
        )}
      </div>
      <div className="cft-record-chart-detail" aria-live="polite" aria-atomic="true">
        {selected && selected.value !== null
          ? <><span>{selected.label}</span><strong>{selected.value}{valueSuffix}</strong></>
          : <span>그래프를 터치하면 날짜별 값을 확인할 수 있어요.</span>}
      </div>
    </div>
  );
}
