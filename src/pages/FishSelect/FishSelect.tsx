import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

interface SpeciesOption {
  id: string;
  name: string;
  emoji: string;
  available: boolean;
}

const SPECIES_OPTIONS: SpeciesOption[] = [
  { id: 'betta', name: '베타', emoji: '🐠', available: true },
  { id: 'goldfish', name: '금붕어', emoji: '🐟', available: false },
  { id: 'guppy', name: '구피', emoji: '🐡', available: false },
  { id: 'koi', name: '코이', emoji: '🎏', available: false },
  { id: 'angelfish', name: '엔젤피시', emoji: '🐬', available: false },
  { id: 'neon-tetra', name: '네온테트라', emoji: '🐳', available: false },
];

const FishSelect: React.FC = () => {
  const { fishSpecies, updateFish, setControlNotice } = useAppContext();
  const navigate = useNavigate();

  const [comingSoonMessage, setComingSoonMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const hasExistingFish = Boolean(fishSpecies);

  const handleSelect = async (species: SpeciesOption) => {
    if (!species.available) {
      setComingSoonMessage(`${species.name}는(은) 추후 추가 예정입니다.`);
      return;
    }

    setComingSoonMessage('');
    setSaving(true);

    const result = await updateFish(species.id, species.name);

    setSaving(false);

    if (!result.success) {
      setComingSoonMessage(result.error || '물고기 선택에 실패했습니다.');
      return;
    }

    setControlNotice(`${species.name}를(을) 선택했습니다.`);
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-6 text-center">
          <div className="text-sm text-slate-500">CyberFishTank</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            어떤 물고기를 키우시나요?
          </div>
          <div className="mt-2 text-sm text-slate-500">
            현재는 베타만 지원되며, 다른 어종은 순차적으로 추가될 예정입니다.
          </div>
        </div>

        {comingSoonMessage && (
          <div className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
            {comingSoonMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SPECIES_OPTIONS.map((species) => {
            const isSelected = fishSpecies === species.id;

            return (
              <button
                key={species.id}
                type="button"
                disabled={saving}
                onClick={() => handleSelect(species)}
                className={`flex flex-col items-center gap-2 rounded-[16px] border p-5 transition disabled:opacity-60 ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900/5'
                    : species.available
                      ? 'border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white'
                      : 'border-slate-100 bg-slate-50/60 text-slate-400 hover:border-slate-200'
                }`}
              >
                <span className="text-4xl">{species.emoji}</span>
                <span className={`text-sm font-medium ${species.available ? 'text-slate-900' : 'text-slate-400'}`}>
                  {species.name}
                </span>
                {isSelected ? (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
                    선택됨
                  </span>
                ) : !species.available ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    준비 중
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {hasExistingFish && (
          <div className="mt-6 text-center text-sm text-slate-500">
            <Link to="/" className="font-medium text-slate-900 underline underline-offset-2">
              돌아가기
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default FishSelect;
