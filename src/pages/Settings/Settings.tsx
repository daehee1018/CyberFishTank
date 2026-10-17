import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/UI';
import { useAppContext } from '../../context/AppContext';

const Settings: React.FC = () => {
  const {
    tankName, setTankName,
    fishName, setFishName,
    fishSpecies, updateFish,
    notificationsEnabled, setNotificationsEnabled,
    darkModeEnabled, setDarkModeEnabled,
    language, setLanguage,
    accountEmail, setAccountEmail,
    controlPin, setControlPin,
    controlNotice, setControlNotice,
  } = useAppContext();

  const renderToggle = (label: string, enabled: boolean, onChange: (value: boolean) => void) => (
    <button type="button" role="switch" aria-label={label} aria-checked={enabled} onClick={() => onChange(!enabled)} className={`cft-switch ${enabled ? 'is-on' : ''}`}><span /></button>
  );

  return (
    <div className="cft-settings-page">
      <PageHeading title="설정" description="어항 정보와 계정 환경을 관리하세요." />
      {controlNotice && <div className="cft-notice" role="status">{controlNotice}</div>}
      <div className="cft-settings-grid">
        <section className="cft-panel"><div className="cft-panel-heading"><h2>어항 및 물고기 정보</h2></div>
          <label className="cft-field">어항 이름<input value={tankName} onChange={event => setTankName(event.target.value)} /></label>
          <div className="cft-field-row"><label className="cft-field">물고기 이름<input value={fishName} onChange={event => setFishName(event.target.value)} /></label><div className="cft-field"><span>어종</span><Link to="/select-fish" className="cft-button">{fishSpecies === 'betta' ? '베타' : fishSpecies || '선택하기'} · 종류 변경</Link></div></div>
          <button type="button" className="cft-button is-primary" onClick={async () => { if (fishSpecies) { const result = await updateFish(fishSpecies, fishName); if (!result.success) { setControlNotice(result.error || '어항 정보 저장에 실패했습니다.'); return; } } setControlNotice('어항 정보가 저장되었습니다.'); }}>어항 설정 저장</button>
        </section>
        <section className="cft-panel"><div className="cft-panel-heading"><h2>계정 및 환경</h2></div>
          <label className="cft-field">계정 이메일<input type="email" value={accountEmail} onChange={event => setAccountEmail(event.target.value)} /></label>
          <label className="cft-field">계정 보안 PIN<input type="password" value={controlPin} onChange={event => setControlPin(event.target.value)} /></label>
          <div className="cft-toggle-row"><div><strong>알림 수신</strong><p>어항의 주요 상태를 알려드려요.</p></div>{renderToggle('알림 수신', notificationsEnabled, setNotificationsEnabled)}</div>
          <div className="cft-toggle-row"><div><strong>다크 모드</strong><p>화면 테마 설정을 저장합니다.</p></div>{renderToggle('다크 모드', darkModeEnabled, setDarkModeEnabled)}</div>
          <label className="cft-field">언어<select value={language} onChange={event => setLanguage(event.target.value)}><option>한국어</option><option>English</option><option>日本語</option></select></label>
          <button type="button" className="cft-button is-primary" onClick={() => setControlNotice('설정이 저장되었습니다.')}>설정 저장</button>
        </section>
      </div>
    </div>
  );
};
export default Settings;
