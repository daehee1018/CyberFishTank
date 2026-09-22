// src/components/TankTheme.tsx
//
// 어항 배경 테마 선택. 물고기 색상/액세서리(FishAppearance)와
// 같은 패턴: 새 에셋 없이 CSS/이모지로만 구현해서 즉시 반영된다.
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';

const THEME_OPTIONS: { key: string; label: string; emoji: string }[] = [
  { key: 'default', label: '기본', emoji: '💧' },
  { key: 'night', label: '밤', emoji: '🌙' },
  { key: 'halloween', label: '할로윈', emoji: '🎃' },
  { key: 'christmas', label: '크리스마스', emoji: '🎄' },
];

const SUBSTRATE_OPTIONS: { key: string; label: string; swatch: string }[] = [
  { key: 'natural', label: '자연 모래', swatch: '#d7b77f' },
  { key: 'white', label: '흰 모래', swatch: '#e9e4d6' },
  { key: 'black', label: '검은 자갈', swatch: '#2e2c2a' },
  { key: 'pink', label: '핑크 자갈', swatch: '#e8a9bb' },
  { key: 'blue', label: '블루 자갈', swatch: '#6f93b8' },
];

export default function TankTheme() {
  const {
    tankTheme,
    updateTankTheme,
    substrateColor,
    updateSubstrateColor,
    fishSpecies,
  } = useAppContext();

  const [savingTheme, setSavingTheme] = useState(false);
  const [themeMessage, setThemeMessage] = useState('');

  const [savingSubstrate, setSavingSubstrate] = useState(false);
  const [substrateMessage, setSubstrateMessage] = useState('');

  const handleSelectTheme = async (theme: string) => {
    if (theme === tankTheme || savingTheme) {
      return;
    }

    setSavingTheme(true);
    setThemeMessage('');

    const result = await updateTankTheme(theme);

    setSavingTheme(false);
    setThemeMessage(result.success ? '' : result.error || '저장에 실패했습니다.');
  };

  const handleSelectSubstrate = async (substrate: string) => {
    if (substrate === substrateColor || savingSubstrate) {
      return;
    }

    setSavingSubstrate(true);
    setSubstrateMessage('');

    const result = await updateSubstrateColor(substrate);

    setSavingSubstrate(false);
    setSubstrateMessage(result.success ? '' : result.error || '저장에 실패했습니다.');
  };

  if (!fishSpecies) {
    return null;
  }

  return (
    <div className="mb-4 space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">테마</div>
        <div className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => handleSelectTheme(option.key)}
              disabled={savingTheme}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                tankTheme === option.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option.emoji} {option.label}
            </button>
          ))}
        </div>
        {themeMessage && <div className="mt-2 text-xs text-red-500">{themeMessage}</div>}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-500">바닥재</div>
        <div className="flex flex-wrap gap-2">
          {SUBSTRATE_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => handleSelectSubstrate(option.key)}
              disabled={savingSubstrate}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                substrateColor === option.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: option.swatch }}
              />
              {option.label}
            </button>
          ))}
        </div>
        {substrateMessage && <div className="mt-2 text-xs text-red-500">{substrateMessage}</div>}
      </div>
    </div>
  );
}
