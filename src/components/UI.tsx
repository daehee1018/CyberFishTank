import type { ReactNode } from 'react';

export type IconName = 'fish' | 'grid' | 'chart' | 'pen' | 'settings' | 'flask' | 'bell' | 'logout' | 'temperature' | 'water' | 'waves' | 'camera' | 'arrow';
const paths: Record<IconName, ReactNode> = {
  fish: <><path d="M7 8C11 3 17 5 21 12c-4 7-10 9-14 4l-5 3 2-7-2-7 5 3Z" /><circle cx="16" cy="11" r=".8" /><path d="m10 7 1-3m-1 13 1 3" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  chart: <><path d="M4 3v17h17M7 15l5-6 4 3 5-7" /></>,
  pen: <><path d="m15 4 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1 1-6Z" /></>,
  settings: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></>,
  flask: <><path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10" /></>,
  bell: <><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4ZM10 21h4M12 2v2" /></>,
  logout: <><path d="M9 4H4v16h5m4-8h9m-4-4 4 4-4 4" /></>,
  temperature: <><path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z" /><path d="M12 8v10m5-11h3m-3 4h3" /></>,
  water: <path d="M12 2C10 6 4 11 4 15a8 8 0 0 0 16 0c0-4-6-9-8-13Zm-4 13c0 2 1 3 3 4" />,
  waves: <path d="M2 6c3-5 5 5 10 0s7 5 10 0M2 12c3-5 5 5 10 0s7 5 10 0M2 18c3-5 5 5 10 0s7 5 10 0" />,
  camera: <><path d="M9 5h6l2 3h4v13H3V8h4l2-3Z" /><circle cx="12" cy="14" r="4" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`cft-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="cft-page-heading"><h1>{title}</h1><p>{description}</p></div>;
}

export function AquariumIllustration() {
  return <svg className="cft-aquarium-illustration" viewBox="0 0 600 340" role="img" aria-label="수초 사이를 헤엄치는 분홍색 베타 물고기">
    <defs><linearGradient id="story-water" x2=".6" y2="1"><stop stopColor="#e5f5ef" /><stop offset="1" stopColor="#b7ded9" /></linearGradient><linearGradient id="story-fin"><stop stopColor="#ed7780" /><stop offset="1" stopColor="#d6879c" /></linearGradient></defs>
    <rect width="600" height="340" fill="url(#story-water)" />
    <path d="M0 48Q270 80 600 28M0 315Q160 278 300 313T600 308" fill="none" stroke="#fff" strokeOpacity=".23" strokeWidth="3" />
    <path d="m60 0 100 300h48L139 0M290 0l45 300h50L360 0" fill="#fff" opacity=".15" />
    <path d="M0 310Q150 285 300 316T600 309V340H0Z" fill="#e8e5d3" /><path d="M0 328Q180 305 330 329T600 323" fill="none" stroke="#d7d7c2" strokeWidth="8" />
    <g fill="#5b9f8d"><path d="M58 316Q6 234 28 167q24 47 30 149M58 316Q30 205 77 133q-2 107-19 183M58 316q2-96 56-151-14 95-56 151M545 318q-47-103-14-166 22 63 14 166M545 318q-9-142 40-186-9 108-40 186M545 318q9-72 50-114-2 83-50 114" /></g>
    <g fill="#85b4a0"><path d="M38 318Q1 279 2 234q41 16 36 84M94 318q-7-60 35-92 2 53-35 92M495 318q-27-60-21-92 37 23 21 92" /></g>
    <path d="M439 321q0-63 47-64 39 0 48 64" fill="#95aea0" /><path d="M456 321q2-43 29-43 24 0 32 43" fill="#708f85" />
    <g transform="translate(282 167)"><path d="M-10-9q-67-97-81-36-15 39 0 82 15 40 80-15Z" fill="url(#story-fin)" /><path d="M0-10q12-75 38-31L52-6M4 20q14 65 27 36l9-33" fill="#d98aa0" /><path d="M-5 5q20-43 57-14 39 26 0 46Q18 53-5 5Z" fill="#ca8197" /><path d="M10 16q-25 17-7 39 23-3 30-25" fill="#ad6689" /><path d="m38 39 9 43M47 37l9 39" stroke="#b76c8f" strokeWidth="3" /><circle cx="62" cy="13" r="3" fill="#fdf7e7" /><circle cx="63" cy="13" r="1.5" fill="#624d61" /><path d="M-76-38-15 2M-87-14l72 21M-86 12l73 0M-74 36l61-20" stroke="#f3a2a4" strokeOpacity=".25" fill="none" /></g>
    <g fill="none" stroke="#fff" opacity=".45"><ellipse cx="181" cy="216" rx="3" ry="5" /><ellipse cx="470" cy="104" rx="3" ry="5" /><ellipse cx="462" cy="74" rx="2" ry="4" /><ellipse cx="403" cy="184" rx="2" ry="4" /><ellipse cx="149" cy="263" rx="2" ry="4" /></g>
    <g fill="#c5c5af"><circle cx="108" cy="327" r="2" /><circle cx="154" cy="320" r="2" /><circle cx="426" cy="330" r="2" /></g>
  </svg>;
}

export function AuthStory() {
  return <aside className="cft-auth-story"><div className="cft-auth-logo">CyberFishTank</div><div className="cft-auth-story-content"><h1>작은 어항 속,<br />더 건강한 일상.</h1><p>실시간 상태 확인부터 나만의 어항 꾸미기까지.</p><div className="cft-mini-aquarium"><AquariumIllustration /></div><small>오늘의 물고기 상태를 한눈에 확인하세요</small></div></aside>;
}
