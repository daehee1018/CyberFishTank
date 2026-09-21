import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import FishSettings from '../../components/FishSettings';
import type { AquariumDecorationType } from '../../context/AppContext';
import Aquarium from '../../components/Aquarium';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  'https://ggnu.site';

const PersonalSettings: React.FC = () => {
  const {
    aquariumDecorations,
    setAquariumDecorations,
    setControlNotice,
  } = useAppContext();

  const [selectedDecorationId, setSelectedDecorationId] =
    useState<string | null>(null);

  const [sensorKey, setSensorKey] = useState<string | null>(null);
  const [sensorKeyLoading, setSensorKeyLoading] = useState(true);
  const [sensorKeyCopied, setSensorKeyCopied] = useState(false);

  useEffect(() => {
    const loadSensorKey = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sensor-key`, {
          credentials: 'include',
        });
        const data = await response.json();
        if (data?.success) {
          setSensorKey(data.sensorKey);
        }
      } catch (error) {
        console.error('❌ 센서 키 조회 실패:', error);
      } finally {
        setSensorKeyLoading(false);
      }
    };

    loadSensorKey();
  }, []);

  const rotateSensorKey = async () => {
    if (!window.confirm('키를 재발급하면 기존 키를 쓰던 센서 장치는 다시 설정해야 합니다. 계속할까요?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/sensor-key/rotate`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data?.success) {
        setSensorKey(data.sensorKey);
      }
    } catch (error) {
      console.error('❌ 센서 키 재발급 실패:', error);
    }
  };

  const copySensorKey = async () => {
    if (!sensorKey) return;
    try {
      await navigator.clipboard.writeText(sensorKey);
      setSensorKeyCopied(true);
      window.setTimeout(() => setSensorKeyCopied(false), 2000);
    } catch (error) {
      console.error('❌ 클립보드 복사 실패:', error);
    }
  };

  const previewRef =
    useRef<HTMLDivElement>(null);

  const [draggingDecorationId, setDraggingDecorationId] =
    useState<string | null>(null);

  const [resizingDecorationId, setResizingDecorationId] =
    useState<string | null>(null);

  const [draggedOptionSrc, setDraggedOptionSrc] =
    useState<string | null>(null);

  const resizeStartRef =
    useRef<{
      x: number;
      width: number;
      height: number;
    } | null>(null);

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        selectedDecorationId &&
        (event.key === 'Delete' ||
          event.key === 'Backspace')
      ) {
        event.preventDefault();
        removeSelectedDecoration();
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () =>
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
  }, [selectedDecorationId]);

  const decorationOptions: {
    type: AquariumDecorationType;
    label: string;
    src: string;
    sway?: boolean;
  }[] = [
    { type: 'plant', label: '아누비아스', src: '/assets/aquarium/plants/plant_anubias_01.png', sway: true },
    { type: 'plant', label: '발리스네리아', src: '/assets/aquarium/plants/plant_vallisneria_01.png', sway: true },
    { type: 'plant', label: '붉은 줄기 수초', src: '/assets/aquarium/plants/plant_rotala_red_01.png', sway: true },
    { type: 'house', label: '석조 신전', src: '/assets/aquarium/houses/house_temple_01.png' },
    { type: 'house', label: '목조 오두막', src: '/assets/aquarium/houses/house_cabin_01.png' },
    { type: 'cave', label: '둥근 바위 동굴', src: '/assets/aquarium/caves/cave_rounded_stone_01.png' },
    { type: 'cave', label: '수정 동굴', src: '/assets/aquarium/caves/cave_crystal_01.png' },
    { type: 'structure', label: '석조 아치', src: '/assets/aquarium/structures/structure_stone_arch_01.png' },
    { type: 'structure', label: '나무 다리', src: '/assets/aquarium/structures/structure_wood_bridge_01.png' },
  ];

  const addDecoration = (
    option: typeof decorationOptions[number],
    x = 50,
    y = 72
  ) => {
    const decorationId =
      `${option.type}-${Date.now()}`;

    setAquariumDecorations([
      ...aquariumDecorations,
      {
        id: decorationId,
        type: option.type,
        src: option.src,
        x,
        y,
        width: option.type === 'plant' ? 24 : 20,
        height: option.type === 'plant' ? 34 : 24,
        sway: option.sway ?? false,
      },
    ]);

    setSelectedDecorationId(decorationId);

    setControlNotice(
      `${option.label} 요소가 어항에 추가되었습니다.`
    );
  };

  const handleDecorationDrop = (
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    if (!previewRef.current || !draggedOptionSrc) {
      return;
    }

    const option = decorationOptions.find(
      item => item.src === draggedOptionSrc
    );

    if (!option) {
      return;
    }

    const bounds =
      previewRef.current.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(
        100,
        ((event.clientX - bounds.left) /
          bounds.width) *
          100
      )
    );

    const y = Math.max(
      15,
      Math.min(
        90,
        ((event.clientY - bounds.top) /
          bounds.height) *
          100
      )
    );

    addDecoration(option, x, y);
    setDraggedOptionSrc(null);
  };

  const assetPreviewSrc = (
    src: string
  ) => `${src}?v=3`;

  const selectedDecoration =
    aquariumDecorations.find(
      decoration =>
        decoration.id === selectedDecorationId
    );

  const updateSelectedDecoration = (
    changes: Partial<NonNullable<typeof selectedDecoration>>
  ) => {
    if (!selectedDecorationId) {
      return;
    }

    setAquariumDecorations(
      aquariumDecorations.map(
        decoration =>
          decoration.id === selectedDecorationId
            ? { ...decoration, ...changes }
            : decoration
      )
    );
  };

  const removeSelectedDecoration = () => {
    if (!selectedDecorationId) {
      return;
    }

    setAquariumDecorations(
      aquariumDecorations.filter(
        decoration =>
          decoration.id !== selectedDecorationId
      )
    );
    setSelectedDecorationId(null);
    setControlNotice('어항 요소가 삭제되었습니다.');
  };

  const getClampedPosition = (
    x: number,
    y: number,
    width: number,
    height: number
  ) => ({
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(
      height,
      Math.min(100, y)
    ),
  });

  const handlePreviewPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!previewRef.current) {
      return;
    }

    const bounds =
      previewRef.current.getBoundingClientRect();

    if (resizingDecorationId && resizeStartRef.current) {
      const delta =
        ((event.clientX - resizeStartRef.current.x) /
          bounds.width) *
        100;

      const width = Math.max(
        8,
        Math.min(
          50,
          resizeStartRef.current.width + delta
        )
      );

      const ratio =
        resizeStartRef.current.height /
        resizeStartRef.current.width;

      updateSelectedDecoration({
        width,
        height: Math.max(
          8,
          Math.min(60, width * ratio)
        ),
      });
      return;
    }

    if (!draggingDecorationId) {
      return;
    }

    const x =
      ((event.clientX - bounds.left) /
        bounds.width) *
      100;

    const y =
      ((event.clientY - bounds.top) /
        bounds.height) *
      100;

    const decoration =
      aquariumDecorations.find(
        item => item.id === draggingDecorationId
      );

    if (!decoration) {
      return;
    }

    const position = getClampedPosition(
      x,
      y,
      decoration.width ?? 22,
      decoration.height ?? 22
    );

    updateSelectedDecoration(position);
  };

  const beginDragging = (
    event: React.PointerEvent<HTMLImageElement>,
    decorationId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedDecorationId(decorationId);
    setDraggingDecorationId(decorationId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginResizing = (
    event: React.PointerEvent<HTMLButtonElement>,
    decorationId: string
  ) => {
    const decoration =
      aquariumDecorations.find(
        item => item.id === decorationId
      );

    if (!decoration) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setSelectedDecorationId(decorationId);
    setResizingDecorationId(decorationId);
    resizeStartRef.current = {
      x: event.clientX,
      width: decoration.width ?? 22,
      height: decoration.height ?? 22,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const stopDragging = () => {
    if (draggingDecorationId) {
      setControlNotice('어항 요소 위치가 변경되었습니다.');
    }
    setDraggingDecorationId(null);
    setResizingDecorationId(null);
    resizeStartRef.current = null;
  };

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="rounded-[20px] border border-slate-200 bg-white p-4">
        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-500">개인 설정</div>
          <div className="space-y-3">
            <div className="rounded-[14px] border border-slate-900 bg-slate-900 p-4 text-sm font-semibold text-white">물고기 그래픽</div>
            <div className="rounded-[14px] border border-slate-200 bg-white p-4 text-sm text-slate-600">어항 커스터마이징</div>
          </div>
        </div>
      </aside>
      <div className="space-y-4">
        <section>
          <div className="mb-4">
            <div className="text-sm text-slate-500">디지털 트윈 개인 설정</div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">물고기 그래픽 생성</div>
          </div>
          <FishSettings />
        </section>
        <section className="rounded-[20px] border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <div className="text-sm text-slate-500">어항 개인 설정</div>
            <div className="text-2xl font-semibold tracking-tight text-slate-900">어항 커스터마이징</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">어항 안의 요소를 직접 드래그하고 크기를 조절합니다.</div>
          </div>

          <div className="space-y-4">
            <div
              ref={previewRef}
              onDragOver={event => event.preventDefault()}
              onDrop={handleDecorationDrop}
              onPointerMove={handlePreviewPointerDown}
              onPointerUp={stopDragging}
              onPointerLeave={stopDragging}
              className="relative h-[420px] touch-none overflow-hidden rounded-[16px] border border-slate-200 bg-sky-100"
            >
              <Aquarium showFish={false} />
              <div className="absolute inset-0 z-10">
                {aquariumDecorations.map(decoration => {
                  const isSelected =
                    selectedDecorationId === decoration.id;

                  return (
                    <div
                      key={decoration.id}
                      className={`absolute ${isSelected ? 'border-2 border-slate-900' : ''}`}
                      style={{
                        left: `${decoration.x}%`,
                        top: `${decoration.y}%`,
                        width: `${decoration.width ?? 22}%`,
                        height: `${decoration.height ?? 22}%`,
                        transform: 'translate(-50%, -100%)',
                      }}
                    >
                      <img
                        src={assetPreviewSrc(decoration.src)}
                        alt=""
                        onPointerDown={event => beginDragging(event, decoration.id)}
                        onClick={() => setSelectedDecorationId(decoration.id)}
                        className="h-full w-full cursor-grab object-contain active:cursor-grabbing"
                      />
                      {isSelected && (
                        <>
                          <button
                            type="button"
                            aria-label="요소 삭제"
                            onPointerDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={event => {
                              event.stopPropagation();
                              removeSelectedDecoration();
                            }}
                            className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-white shadow hover:bg-rose-700"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v5M14 11v5" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            aria-label="요소 크기 조절"
                            onPointerDown={event => beginResizing(event, decoration.id)}
                            className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-slate-900 shadow"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {aquariumDecorations.length === 0 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-slate-600">
                  오른쪽 목록에서 장식물을 추가하세요.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-800">장식물 추가</div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {decorationOptions.map(option => (
                  <button
                    key={option.src}
                    type="button"
                    draggable
                    onDragStart={event => {
                      setDraggedOptionSrc(option.src);
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData('text/plain', option.src);
                    }}
                    onDragEnd={() => setDraggedOptionSrc(null)}
                    onClick={() => addDecoration(option)}
                    className="w-[112px] flex-none rounded-[12px] border border-slate-200 bg-slate-50 p-2 text-left transition hover:border-slate-400 hover:bg-white"
                  >
                    <img src={assetPreviewSrc(option.src)} alt="" className="h-14 w-full object-contain" />
                    <span className="mt-1 block truncate text-[11px] font-medium text-slate-700">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-500">현재 배치 {aquariumDecorations.length}개</div>

        </section>

        <section className="rounded-[20px] border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">개인 설정</div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">
            내 센서 연동
          </div>
          <p className="mt-2 text-sm text-slate-500">
            RP2040 같은 본인 센서 하드웨어가 있다면, 아래 키를 그 장치의 설정에 넣어주세요.
            이 키로 보낸 센서 데이터는 이 계정에만 저장되고 표시됩니다.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3">
            <code className="flex-1 break-all text-sm text-slate-700">
              {sensorKeyLoading ? '불러오는 중...' : sensorKey}
            </code>
            <button
              type="button"
              onClick={copySensorKey}
              disabled={!sensorKey}
              className="rounded-[10px] bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              {sensorKeyCopied ? '복사됨' : '복사'}
            </button>
            <button
              type="button"
              onClick={rotateSensorKey}
              className="rounded-[10px] border border-red-200 px-4 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
            >
              재발급
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PersonalSettings;
