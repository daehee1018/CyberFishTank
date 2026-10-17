import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import FishSettings from '../../components/FishSettings';
import FishAppearance from '../../components/FishAppearance';
import SensorSettings from '../../components/SensorSettings';
import TankTheme from '../../components/TankTheme';
import type { AquariumDecorationType } from '../../context/AppContext';
import Aquarium from '../../components/Aquarium';
import { Fish2D } from '../../components/Fish2D';
import { Icon, PageHeading } from '../../components/UI';

const PersonalSettings: React.FC = () => {
  const {
    aquariumDecorations,
    setAquariumDecorations,
    setControlNotice,
    tankTheme,
    substrateColor,
    fishData,
    controlNotice,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState('어항 커스터마이징');

  const [selectedDecorationId, setSelectedDecorationId] =
    useState<string | null>(null);

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
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
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
    { type: 'structure', label: '자연 유목과 바위', src: '/assets/aquarium/natural/driftwood-v1.webp' },
    { type: 'plant', label: '자연 수초 군락', src: '/assets/aquarium/natural/plant-v1.webp', sway: true },
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
        layer: 'back',
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
    <div className="cft-customize-page">
      <PageHeading title="나만의 어항 꾸미기" description="물고기와 어항에 나만의 취향을 더해보세요." />
      {controlNotice && <div className="cft-notice" role="status">{controlNotice}</div>}
      <nav className="cft-tabs" aria-label="꾸미기 메뉴">{['어항 커스터마이징', '물고기 그래픽', '센서 연동'].map(tab => <button key={tab} aria-pressed={activeTab === tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
      <div className={`cft-customize-grid ${activeTab === '물고기 그래픽' ? 'is-graphics' : activeTab === '센서 연동' ? 'is-sensor' : ''}`}>
        <section className="cft-panel cft-editor-panel" hidden={activeTab === '센서 연동'}><div className="cft-panel-heading"><h2>어항 미리보기</h2><span className="cft-caption">실시간 반영</span></div>
            <div
              ref={previewRef}
              onDragOver={event => event.preventDefault()}
              onDrop={handleDecorationDrop}
              onPointerMove={handlePreviewPointerDown}
              onPointerUp={stopDragging}
              onPointerLeave={stopDragging}
              className="cft-editor-aquarium relative touch-none overflow-hidden"
            >
              <Aquarium variant="soft" showFish={false} decorations={aquariumDecorations} theme={tankTheme} substrateColor={substrateColor}><Fish2D {...fishData} /></Aquarium>
              <div className="absolute inset-0 z-20 pointer-events-none">
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
                        pointerEvents: 'auto',
                      }}
                    >
                      <img
                        src={assetPreviewSrc(decoration.src)}
                        alt=""
                        onPointerDown={event => beginDragging(event, decoration.id)}
                        onClick={() => setSelectedDecorationId(decoration.id)}
                        className="h-full w-full cursor-grab object-contain object-bottom opacity-0 active:cursor-grabbing"
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
            </div>
          <div className="cft-editor-hint"><Icon name="pen" />장식물을 드래그해 위치와 크기를 조절하세요.</div><div className="cft-editor-footer"><span>추가 장식 {aquariumDecorations.length}개</span><span>{tankTheme === 'default' ? '자연 어항' : tankTheme}</span></div>
        </section>
        <aside className="cft-panel cft-style-panel" hidden={activeTab !== '어항 커스터마이징'}><div className="cft-panel-heading"><h2>어항 스타일</h2></div><TankTheme />

            {aquariumDecorations.length > 0 && <label className="cft-field">장식 선택
              <select aria-label="장식 선택" value={selectedDecorationId ?? ''} onChange={event => setSelectedDecorationId(event.target.value || null)}>
                <option value="">편집할 장식을 선택하세요</option>
                {aquariumDecorations.map((decoration, index) => <option key={decoration.id} value={decoration.id}>{index + 1}. {decorationOptions.find(option => option.src === decoration.src)?.label ?? '장식'}</option>)}
              </select>
            </label>}

            {selectedDecoration && <div className="cft-decoration-controls">
              <label className="cft-field">장식 레이어
                <select aria-label="장식 레이어" value={selectedDecoration.layer ?? 'back'} onChange={event => updateSelectedDecoration({ layer: event.target.value as 'back' | 'front' })}>
                  <option value="back">후경 · 물고기 뒤</option>
                  <option value="front">전경 · 물고기 앞</option>
                </select>
              </label>
              <p className="cft-caption">전경 장식은 가장자리에 작게 배치해 주세요.</p>
              <label className="cft-field">가로 위치
                <input type="range" min="0" max="100" value={selectedDecoration.x} onChange={event => updateSelectedDecoration({ x: Number(event.target.value) })} />
              </label>
              <label className="cft-field">세로 위치
                <input type="range" min="15" max="100" value={selectedDecoration.y} onChange={event => updateSelectedDecoration({ y: Number(event.target.value) })} />
              </label>
              <label className="cft-field">크기
                <input type="range" min="8" max="50" value={selectedDecoration.width ?? 22} onChange={event => {
                  const width = Number(event.target.value);
                  updateSelectedDecoration({ width, height: Math.min(60, width * (selectedDecoration.height ?? 22) / (selectedDecoration.width ?? 22)) });
                }} />
              </label>
              <button type="button" className="cft-button" onClick={removeSelectedDecoration}>선택한 장식 삭제</button>
            </div>}


            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-800">장식물 추가</div>
              <div className="cft-decoration-grid">
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
                    className="cft-decoration-option"
                  >

                    <span className="text-xs">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          <p className="cft-caption">장식 추가 · 이동 · 크기 조절 · 선택 후 Delete로 삭제</p>
        </aside>
        <section className="cft-graphics-panel" hidden={activeTab !== '물고기 그래픽'}><FishSettings /></section>
        <section className="cft-appearance-panel" hidden={activeTab !== '물고기 그래픽'}><FishAppearance /></section>
        {activeTab === '센서 연동' && <SensorSettings />}
      </div>
    </div>
  );
};
export default PersonalSettings;
