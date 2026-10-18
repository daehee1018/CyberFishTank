import type { ReactNode } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { AquariumIllustration, AuthStory } from './UI';

export default function AuthLayout({ children, signup = false }: { children: ReactNode; signup?: boolean }) {
  const isMobile = useIsMobile();
  if (isMobile) return (
    <div className={`cft-mobile-auth ${signup ? 'is-signup' : ''}`}>
      <header className="cft-mobile-auth-intro">
        <div><strong>CyberFishTank</strong><h1>작은 어항 속,<br />더 건강한 일상.</h1></div>
        <div className="cft-mobile-auth-aquarium"><AquariumIllustration /></div>
      </header>
      <main className="cft-mobile-auth-form">{children}</main>
      <footer>CyberFishTank</footer>
    </div>
  );
  return <div className="cft-auth-page"><div className="cft-auth-shell"><AuthStory /><div className="cft-auth-form">{children}</div></div></div>;
}
