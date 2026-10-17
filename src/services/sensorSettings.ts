import type { SensorRanges } from '../types/preferences';

interface SensorSettingsResponse {
  success: boolean;
  ranges?: SensorRanges;
  error?: string;
}

export async function readSensorSettingsResponse(response: Response): Promise<SensorSettingsResponse> {
  if (response.status === 404) {
    throw new Error('서버에 센서 알림 설정 기능이 아직 적용되지 않았습니다. 최신 백엔드를 반영하고 서버를 재시작해주세요.');
  }
  if (response.status === 401) {
    throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('센서 설정 서버가 올바른 데이터를 보내지 않았습니다. 서버 연결 상태를 확인해주세요.');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('센서 설정 서버의 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
}
