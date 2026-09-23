// CyberFishTank 서비스 워커
//
// 지금은 "설치 가능한 웹앱(PWA)"이 되기 위한 최소 조건만
// 채운다 — fetch 이벤트를 처리하는 서비스 워커가 있어야
// 브라우저가 설치 프롬프트를 띄워준다. 센서/알림은 실시간
// 데이터라 오프라인 캐싱은 하지 않고 그냥 네트워크로
// 통과시킨다. 나중에 푸시 알림을 붙일 때 이 파일에
// push/notificationclick 리스너를 추가하면 된다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // 캐싱 없음 — 항상 네트워크로. 이 리스너 자체가
  // PWA 설치 조건(fetch 핸들러 존재)을 만족시킨다.
});
