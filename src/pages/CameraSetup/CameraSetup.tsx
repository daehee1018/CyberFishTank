import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';

const CameraSetup: React.FC = () => {
  const { currentUser, confirmCameraSetup, setControlNotice } = useAppContext();
  const navigate = useNavigate();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const alreadyConfigured = Boolean(currentUser?.cameraConfigured);

  // 이미 연결을 마친 계정이 실수로 이 화면에 오면 자동으로 돌려보낸다.
  useEffect(() => {
    if (alreadyConfigured) {
      navigate('/', { replace: true });
    }
  }, [alreadyConfigured, navigate]);

  // 카메라가 여러 대면 고를 수 있게 목록을 가져온다.
  // 권한을 아직 안 줬으면 라벨 없이 개수만 보일 수 있다.
  const loadCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === 'videoinput');
      setAvailableCameras(cameras);
    } catch (err) {
      console.error('❌ 카메라 목록 조회 실패:', err);
    }
  };

  useEffect(() => {
    loadCameraDevices();
  }, []);

  const handleConnect = async () => {
    setError('');
    setConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : true,
        audio: false,
      });

      // 권한 확인용이라 바로 꺼도 된다. 실제 사용은 대시보드에서
      // "내 카메라 켜기"를 누를 때 다시 요청한다.
      stream.getTracks().forEach((track) => track.stop());

      const result = await confirmCameraSetup();

      if (!result.success) {
        setError(result.error || '카메라 연결 확인에 실패했습니다.');
        setConnecting(false);
        return;
      }

      setControlNotice('카메라 연결이 완료되었습니다.');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('❌ 카메라 접근 실패:', err);
      setError('카메라에 접근할 수 없습니다. 브라우저 권한을 확인해주세요.');
      setConnecting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="mb-6 text-center">
          <div className="text-sm text-slate-500">CyberFishTank</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            카메라를 연결해주세요
          </div>
          <p className="mt-3 text-sm text-slate-500">
            내 어항을 비출 웹캠 권한이 필요합니다. 이 권한이 있어야 AI가
            내 물고기를 실시간으로 추적하고 성장/활동량을 기록할 수 있습니다.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {availableCameras.length > 1 && (
          <label className="mb-4 block text-sm font-medium text-slate-600">
            사용할 카메라
            <select
              value={selectedCameraId}
              onChange={(event) => setSelectedCameraId(event.target.value)}
              className="mt-2 w-full rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
            >
              <option value="">기본 카메라</option>
              {availableCameras.map((camera, index) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `카메라 ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="w-full rounded-[14px] bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {connecting ? '연결 중...' : '카메라 연결하기'}
        </button>
      </div>
    </div>
  );
};

export default CameraSetup;
