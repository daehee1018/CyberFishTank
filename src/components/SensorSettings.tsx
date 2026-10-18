import { trackedFetch as fetch } from '../services/requestActivity';
import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_SENSOR_RANGES } from '../types/preferences';
import type { SensorRanges } from '../types/preferences';

const API_BASE = import.meta.env.VITE_API_URL || 'https://ggnu.site';
const groups = [
  { title: '수온', description: '설정한 범위보다 낮거나 높으면 알림을 보내요.', minKey: 'temperatureMin', maxKey: 'temperatureMax', minLabel: '최저 수온 (°C)', maxLabel: '최고 수온 (°C)', min: 0, max: 50 },
  { title: 'pH', description: '설정한 범위를 벗어나면 알림을 보내요.', minKey: 'phMin', maxKey: 'phMax', minLabel: '최저 pH', maxLabel: '최고 pH', min: 0, max: 14 },
  { title: '수질 변화 민감도', description: '평소 변동 폭의 몇 배부터 주의·위험으로 볼지 설정해요. 값이 작을수록 민감해요.', minKey: 'pollutionWarningZ', maxKey: 'pollutionDangerZ', minLabel: '주의 기준 (배)', maxLabel: '위험 기준 (배)', min: 0.1, max: 20 },
] as const;
const toDraft = (ranges: SensorRanges) => Object.fromEntries(Object.entries(ranges).map(([key, value]) => [key, String(value)])) as Record<keyof SensorRanges, string>;

export default function SensorSettings() {
  const { sensorRanges, sensorRangesLoading, sensorRangesError, reloadSensorRanges, updateSensorRanges } = useAppContext();
  const [draft, setDraft] = useState(() => toDraft(sensorRanges));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [sensorKey, setSensorKey] = useState('');
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyError, setKeyError] = useState('');
  const [keyNotice, setKeyNotice] = useState('');
  const [keyReload, setKeyReload] = useState(0);
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => { setDraft(toDraft(sensorRanges)); }, [sensorRanges]);
  useEffect(() => {
    const controller = new AbortController();
    setKeyLoading(true);
    setKeyError('');
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sensor-key`, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.success || !data.sensorKey) throw new Error('연동 키를 불러오지 못했습니다.');
        if (!controller.signal.aborted) setSensorKey(data.sensorKey);
      } catch (error) {
        if (!controller.signal.aborted) setKeyError(error instanceof Error ? error.message : '연동 키 조회 실패');
      } finally {
        if (!controller.signal.aborted) setKeyLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [keyReload]);

  const rotateKey = async () => {
    if (!window.confirm('키를 재발급하면 기존 키를 쓰던 센서 장치는 다시 설정해야 합니다. 계속할까요?')) return;
    setKeyBusy(true);
    setKeyError('');
    setKeyNotice('');
    try {
      const response = await fetch(`${API_BASE}/api/sensor-key/rotate`, { method: 'POST', credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data.success || !data.sensorKey) throw new Error('연동 키 재발급에 실패했습니다.');
      setSensorKey(data.sensorKey);
      setKeyNotice('새 키가 발급되었습니다. 센서 장치의 키도 변경해주세요.');
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : '연동 키 재발급 실패');
    } finally { setKeyBusy(false); }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(sensorKey);
      setKeyNotice('연동 키를 복사했습니다.');
    } catch { setKeyError('복사하지 못했습니다. 연동 키를 직접 선택해 복사해주세요.'); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setMessage('');
    if (Object.values(draft).some(value => value.trim() === '' || !Number.isFinite(Number(value)))) {
      setFormError('모든 범위를 숫자로 입력해주세요.');
      return;
    }
    const ranges = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value)])) as unknown as SensorRanges;
    if (groups.some(group => ranges[group.minKey] >= ranges[group.maxKey])) {
      setFormError('최저값은 최고값보다, 주의 기준은 위험 기준보다 작아야 합니다.');
      return;
    }
    setSaving(true);
    const result = await updateSensorRanges(ranges);
    setSaving(false);
    if (result.success) setMessage('알림 범위를 저장했습니다. 이후 센서 측정과 대시보드에 적용됩니다.');
    else setFormError(result.error || '저장에 실패했습니다.');
  };

  return (
    <section className="cft-panel cft-sensor-settings">
      <div className="cft-panel-heading"><h2>센서 연동 및 알림 설정</h2></div>
      <p className="cft-caption">내 센서를 연결하고, 어항에 맞는 알림 범위를 설정하세요.</p>
      <div className="cft-sensor-settings-grid">
        <div className="cft-sensor-connection">
          <h3>내 센서 연동</h3>
          <p className="cft-caption">이 연동 키를 센서 장치의 설정에 입력하면 측정값이 내 계정에 연결됩니다.</p>
          <div className="cft-sensor-key"><code>{keyLoading ? '불러오는 중...' : sensorKey || '연동 키 없음'}</code><div><button className="cft-button is-primary" type="button" onClick={copyKey} disabled={!sensorKey || keyLoading || keyBusy}>복사</button><button className="cft-button" type="button" onClick={rotateKey} disabled={keyLoading || keyBusy}>{keyBusy ? '재발급 중...' : '재발급'}</button></div></div>
          {keyError && <div className="cft-error" role="alert">{keyError} <button type="button" className="cft-text-link" onClick={() => setKeyReload(value => value + 1)}>다시 불러오기</button></div>}
          {keyNotice && <p className="cft-caption" role="status">{keyNotice}</p>}
          <div className="cft-sensor-info"><h3>알림 적용 안내</h3><p>수온·pH가 설정 범위를 벗어나면 알림을 보내요.</p><p>수질은 탁도·TDS의 평소 측정값과 비교해요. 위험 상태가 3회 연속 측정되면 물갈이 알림을 보내요.</p><p>수위 센서는 물 감지 여부를 보내요. 물이 감지되지 않으면 수위 저하 알림을 보내며, 높이 범위는 설정하지 않아요.</p></div>
        </div>
        <form className="cft-sensor-ranges" onSubmit={save}>
          <h3>센서 알림 범위</h3>
          {sensorRangesLoading && <p className="cft-caption" role="status">알림 범위를 불러오는 중...</p>}
          {sensorRangesError && <div className="cft-error" role="alert">{sensorRangesError} <button className="cft-text-link" type="button" onClick={reloadSensorRanges}>다시 불러오기</button></div>}
          <fieldset disabled={sensorRangesLoading || !!sensorRangesError || saving} className="cft-sensor-range-fields">
            {groups.map(group => <fieldset className="cft-sensor-range-group" key={group.title}>
              <legend>{group.title}</legend><p className="cft-caption">{group.description}</p>
              <div className="cft-sensor-range-inputs">{([{ key: group.minKey, label: group.minLabel }, { key: group.maxKey, label: group.maxLabel }]).map(field => <label className="cft-field" key={field.key}>{field.label}<input type="number" min={group.min} max={group.max} step="any" required value={draft[field.key]} onChange={event => { setDraft(current => ({ ...current, [field.key]: event.target.value })); setMessage(''); }} /></label>)}</div>
            </fieldset>)}
            <div className="cft-sensor-range-actions"><button className="cft-button is-primary" type="submit">{saving ? '저장 중...' : '알림 범위 저장'}</button><button className="cft-button" type="button" onClick={() => { setDraft(toDraft(DEFAULT_SENSOR_RANGES)); setMessage('기본값을 불러왔습니다. 저장하면 적용됩니다.'); setFormError(''); }}>기본값 불러오기</button></div>
          </fieldset>
          {formError && <p className="cft-error" role="alert">{formError}</p>}
          {message && <p className="cft-caption" role="status">{message}</p>}
        </form>
      </div>
    </section>
  );
}
