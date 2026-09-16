import React from 'react';
import { useAppContext } from '../../context/AppContext';
import FishSettings from '../../components/FishSettings';

const PersonalSettings: React.FC = () => {
  const { aquariumDecorations, setAquariumDecorations } = useAppContext();

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
            <div className="mt-2 text-sm leading-6 text-slate-600">어항 배경과 장식물 배치를 설정하는 영역입니다.</div>
          </div>
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">배경, 장식물, 레이아웃 편집 기능을 이 영역에 추가할 수 있습니다.</div>
          <button type="button" onClick={() => setAquariumDecorations([...aquariumDecorations])} className="mt-4 rounded-[14px] border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700">현재 어항 배치 유지</button>
        </section>
      </div>
    </div>
  );
};

export default PersonalSettings;
