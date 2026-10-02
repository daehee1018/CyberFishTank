// src/components/FishAppearance.tsx
//
// 가벼운 코스메틱 커스터마이징: 색상 틴트(hue-rotate) + 액세서리(이모지).
// AI 사진 변환(FishSettings)과 달리 새 이미지를 만들지 않고, 어떤
// 스프라이트든 위에 겹쳐 적용되므로 즉시 반영되고 되돌리기도 쉽다.
//
// 물고기마다 실제 크기/프레임이 달라 액세서리 기본 위치가 항상
// 맞지는 않는다. 그래서 미리보기에서 직접 끌어서 위치를 잡을 수
// 있게 하고, 그 값(%)을 저장한다. 안 잡으면(null) 액세서리별
// 기본 위치(ACCESSORY_STYLE)를 그대로 쓴다.
import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ACCESSORY_STYLE } from './Fish2D';

const HUE_PRESETS: { label: string; hue: number }[] = [
  { label: '원래색', hue: 0 },
  { label: '블루', hue: 200 },
  { label: '퍼플', hue: 270 },
  { label: '핑크', hue: 320 },
  { label: '골드', hue: 40 },
  { label: '그린', hue: 120 },
];

const ACCESSORY_OPTIONS: { key: string; label: string; emoji: string }[] = [
  { key: '', label: '없음', emoji: '' },
  { key: 'hat', label: '모자', emoji: '🎩' },
  { key: 'crown', label: '왕관', emoji: '👑' },
  { key: 'ribbon', label: '리본', emoji: '🎀' },
  { key: 'sunglasses', label: '선글라스', emoji: '🕶️' },
  { key: 'flower', label: '꽃', emoji: '🌸' },
];

// '70%' 같은 문자열 기본값을 숫자(%)로 변환. 파싱 실패하면 50(가운데).
function parsePercent(value: string | undefined): number {
  const n = value ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : 50;
}

export default function FishAppearance() {
  const {
    currentUser,
    fishSpecies,
    fishColorHue,
    fishAccessory,
    fishAccessoryX,
    fishAccessoryY,
    updateFishAppearance,
    activeGraphicDir,
  } = useAppContext();

  const [hue, setHue] = useState(fishColorHue);
  const [accessory, setAccessory] = useState(fishAccessory);
  const [posX, setPosX] = useState<number | null>(fishAccessoryX);
  const [posY, setPosY] = useState<number | null>(fishAccessoryY);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const previewBoxRef = useRef<HTMLDivElement | null>(null);

  // 서버에서 값이 로드/변경되면 편집 중이 아닐 때 동기화
  useEffect(() => {
    setHue(fishColorHue);
  }, [fishColorHue]);

  useEffect(() => {
    setAccessory(fishAccessory);
    setPosX(fishAccessoryX);
    setPosY(fishAccessoryY);
  }, [fishAccessory, fishAccessoryX, fishAccessoryY]);

  // Fish2D/그래픽 갤러리와 같은 규칙: activeGraphicDir이 있으면
  // 그 버전 폴더를, 없으면 예전 방식(계정 바로 아래)을 본다.
  const previewSrc = currentUser
    ? activeGraphicDir
      ? `/fish_sprites/${currentUser.id}/${activeGraphicDir}/fish_right.png`
      : `/fish_sprites/${currentUser.id}/fish_right.png`
    : '/fish_sprites/fish_right.png';

  const defaultStyle = accessory ? ACCESSORY_STYLE[accessory] : null;

  // 커스텀 위치가 있으면 그걸, 없으면 액세서리 기본 위치를 쓴다.
  const effectiveX = posX ?? (defaultStyle ? parsePercent(defaultStyle.left) : 50);
  const effectiveY = posY ?? (defaultStyle ? parsePercent(defaultStyle.top) : 50);

  const hasCustomPos = posX !== null || posY !== null;

  const dirty =
    hue !== fishColorHue ||
    accessory !== fishAccessory ||
    posX !== fishAccessoryX ||
    posY !== fishAccessoryY;

  // ============================================================
  // 액세서리 드래그로 위치 잡기
  //
  // 미리보기 박스(previewBoxRef) 기준 0~100% 좌표로 저장한다.
  // 포인터 이벤트 하나로 마우스/터치 둘 다 처리한다.
  // ============================================================

  const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

  const updatePosFromClientXY = (clientX: number, clientY: number) => {
    const box = previewBoxRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const x = clampPercent(((clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((clientY - rect.top) / rect.height) * 100);

    setPosX(Math.round(x * 10) / 10);
    setPosY(Math.round(y * 10) / 10);
  };

  const handleAccessoryPointerDown = (
    event: React.PointerEvent<HTMLSpanElement>
  ) => {
    if (!accessory) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updatePosFromClientXY(event.clientX, event.clientY);
  };

  const handleAccessoryPointerMove = (
    event: React.PointerEvent<HTMLSpanElement>
  ) => {
    if (!dragging) return;
    updatePosFromClientXY(event.clientX, event.clientY);
  };

  const handleAccessoryPointerUp = (
    event: React.PointerEvent<HTMLSpanElement>
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const handleResetPos = () => {
    setPosX(null);
    setPosY(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    const result = await updateFishAppearance(hue, accessory, posX, posY);

    setSaving(false);

    setMessage(
      result.success
        ? '저장했습니다. 대시보드에 바로 반영됩니다.'
        : result.error || '저장에 실패했습니다.'
    );
  };

  if (!fishSpecies) {
    return null;
  }

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.02)]">
      <h3 className="text-base font-semibold text-slate-900 mb-1">
        🎨 물고기 색상 / 액세서리
      </h3>

      <p className="text-xs text-slate-500 mb-4">
        어떤 그래픽을 쓰든(기본/AI 변환본) 항상 위에 겹쳐 적용됩니다.
      </p>

      <div className="flex flex-col sm:flex-row gap-5">
        {/* 미리보기 (액세서리는 드래그해서 위치 조절 가능) */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            ref={previewBoxRef}
            className="relative flex h-32 w-32 flex-none items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50"
          >
            <img
              src={previewSrc}
              alt="미리보기"
              draggable={false}
              onError={(e) => {
                e.currentTarget.src = '/fish_sprites/fish_right.png';
              }}
              style={{
                width: '84px',
                height: 'auto',
                objectFit: 'contain',
                pointerEvents: 'none',
                filter: `hue-rotate(${hue}deg) drop-shadow(0 4px 6px rgba(15,23,42,0.3))`,
              }}
            />
            {accessory && (
              <span
                onPointerDown={handleAccessoryPointerDown}
                onPointerMove={handleAccessoryPointerMove}
                onPointerUp={handleAccessoryPointerUp}
                style={{
                  position: 'absolute',
                  left: `${effectiveX}%`,
                  top: `${effectiveY}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: '20px',
                  lineHeight: 1,
                  cursor: dragging ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
              >
                {ACCESSORY_STYLE[accessory]?.emoji}
              </span>
            )}
          </div>

          {accessory && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                끌어서 위치 조절
              </span>
              {hasCustomPos && (
                <button
                  type="button"
                  onClick={handleResetPos}
                  className="text-[11px] font-medium text-blue-600 hover:underline"
                >
                  기본 위치로
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          {/* 색상 프리셋 */}
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">색상</div>
            <div className="flex flex-wrap gap-2">
              {HUE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setHue(preset.hue)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    hue === preset.hue
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(event) => setHue(Number(event.target.value))}
              className="mt-3 w-full"
            />
          </div>

          {/* 액세서리 */}
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">액세서리</div>
            <div className="flex flex-wrap gap-2">
              {ACCESSORY_OPTIONS.map((option) => (
                <button
                  key={option.key || 'none'}
                  onClick={() => {
                    setAccessory(option.key);
                    // 다른 액세서리로 바꾸면 이전 커스텀 위치는 의미가 없으므로 초기화.
                    setPosX(null);
                    setPosY(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    accessory === option.key
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {option.emoji ? `${option.emoji} ${option.label}` : option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                saving || !dirty
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? '저장 중...' : '저장'}
            </button>

            {message && (
              <span className="text-xs text-slate-500">{message}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
