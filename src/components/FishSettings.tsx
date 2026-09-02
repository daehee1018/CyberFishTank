// src/components/FishSettings.tsx
import React, { useState } from 'react';

export default function FishSettings() {
  const [file, setFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStyle, setActiveStyle] = useState<string>('');

  // ============================================================
  // 파일 선택
  // ============================================================

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);

      // 새로운 사진을 선택하면 기존 후보 초기화
      setCandidates([]);
      setActiveStyle('');
    }
  };


  // ============================================================
  // 1. 사진 서버 전송
  //    → Python make_10_fish.py
  //    → 10개 후보 생성
  // ============================================================

  const handleUpload = async () => {

    if (!file) {
      alert('어항 물고기 사진을 먼저 등록해주세요!');
      return;
    }

    setLoading(true);

    const formData = new FormData();

    formData.append(
      'fishImage',
      file
    );

    try {

      const res = await fetch(
        '/api/upload-fish',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
          '사진 처리에 실패했습니다.'
        );
      }

      if (data.success) {

        setCandidates(
          Array.isArray(data.candidates)
            ? data.candidates
            : []
        );

        setActiveStyle('');

      } else {

        throw new Error(
          data.error ||
          '후보 생성에 실패했습니다.'
        );
      }

    } catch (err) {

      console.error(
        '[FishSettings] 사진 업로드 오류:',
        err
      );

      const message =
        err instanceof Error
          ? err.message
          : '백엔드 파이썬 엔진과 통신할 수 없습니다.';

      alert(
        `사진 처리 중 오류가 발생했습니다.\n\n${message}`
      );

    } finally {

      setLoading(false);

    }
  };


  // ============================================================
  // 2. 10개 후보 중 하나 선택
  //    → Node.js /api/select-style
  //    → Python generate_fish.py
  //    → 8방향 이미지 생성
  // ============================================================

  const handleSelectStyle = async (
    styleName: string
  ) => {

    setLoading(true);
    setActiveStyle(styleName);

    try {

      const res = await fetch(
        '/api/select-style',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            selectedStyle: styleName,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
          '8방향 이미지 생성에 실패했습니다.'
        );
      }

      if (data.success) {

        // 현재 선택된 물고기 스타일 저장
        localStorage.setItem(
        'selectedFishStyle',
        styleName
      );

      // Fish2D에게 새 이미지가 생성되었다고 알림
      window.dispatchEvent(
        new Event('fish-style-changed')
      );

      alert(
        '🎉 8방향 디지털 트윈 에셋 생성이 완료되었습니다! 어항에 적용되었습니다.'
      );
} else {

        throw new Error(
          data.error ||
          '8방향 이미지 생성에 실패했습니다.'
        );
      }

    } catch (err) {

      console.error(
        '[FishSettings] 스타일 선택 오류:',
        err
      );

      const message =
        err instanceof Error
          ? err.message
          : '8방향 연산 처리 중 오류가 발생했습니다.';

      alert(
        `8방향 이미지 생성 중 오류가 발생했습니다.\n\n${message}`
      );

      // 생성 실패했으므로 선택 표시 제거
      setActiveStyle('');

    } finally {

      setLoading(false);

    }
  };


  // ============================================================
  // 화면
  // ============================================================

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.02)]">

      <h3 className="text-base font-semibold text-slate-900 mb-1">
        🧬 실시간 수중 개체 디지털 트윈 등록
      </h3>

      <p className="text-xs text-slate-500 mb-4">
        실물 어항의 물고기 사진을 업로드하여 인공지능 그래픽 모델로 변환합니다.
      </p>


      {/* ========================================================
          파일 업로드 영역
          ======================================================== */}

      <div className="flex flex-col sm:flex-row gap-3 items-stretch mb-5">

        <label className="flex-1 flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 hover:border-slate-400 rounded-[14px] cursor-pointer transition">

          <div className="flex items-center gap-3">

            <svg
              className="w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>

            <span className="text-sm font-medium text-slate-600 truncate max-w-[280px]">
              {file
                ? file.name
                : '어항 물고기 사진 선택하기...'}
            </span>

          </div>


          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />


          {file && (
            <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
              선택됨
            </span>
          )}

        </label>


        {/* ======================================================
            사진 업로드 버튼
            ====================================================== */}

        <button
          onClick={handleUpload}
          disabled={loading || !file}

          className={`
            px-5 py-3
            font-semibold
            text-sm
            rounded-[14px]
            transition
            flex
            items-center
            justify-center
            gap-2

            ${
              loading || !file
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
            }
          `}
        >

          {loading && !candidates.length ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />

              AI 분석 가동 중...
            </>
          ) : (
            '사진 가공 및 10종 후보 생성'
          )}

        </button>

      </div>


      {/* ========================================================
          10종 후보군
          ======================================================== */}

      {candidates.length > 0 && (

        <div className="mt-4 p-4 rounded-[16px] bg-slate-50 border border-slate-200">

          <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">

            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping" />

            💡 가공 완료! 대시보드 어항 렌더링에 매핑할 스타일 외형을 선택하세요:

          </p>


          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

            {candidates.map((style) => (

              <div
                key={style}

                onClick={() => {
                  if (!loading) {
                    handleSelectStyle(style);
                  }
                }}

                className={`
                  relative
                  rounded-[12px]
                  p-2
                  cursor-pointer
                  text-center
                  bg-white
                  transition-all
                  duration-200
                  border-2

                  ${
                    activeStyle === style
                      ? 'border-blue-500 bg-blue-50/20 shadow-md scale-[1.02]'
                      : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'
                  }

                  ${
                    loading
                      ? 'pointer-events-none opacity-70'
                      : ''
                  }
                `}
              >

                {/* 후보 이미지 */}

                <img
                  src={`/fish_10_candidates/${style}`}
                  alt={style}
                  className="w-full h-auto aspect-square object-contain mb-2 rounded-[6px]"
                />


                {/* 후보 이름 */}

                <div className="text-[11px] font-medium text-slate-600 truncate px-1">

                  {style
                    .replace('.png', '')
                    .substring(3)
                    .toUpperCase()}

                </div>


                {/* 선택 표시 */}

                {activeStyle === style && (

                  <div className="absolute top-1.5 right-1.5 bg-blue-500 text-white rounded-full p-0.5">

                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>

                  </div>

                )}

              </div>

            ))}

          </div>

        </div>

      )}

    </div>
  );
}