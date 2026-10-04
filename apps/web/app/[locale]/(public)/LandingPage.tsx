import type { ReactNode } from 'react';
import { PublicPage } from '../../../components/public';

interface LandingPageProps {
  hero: ReactNode;
  children: ReactNode;
}

export default function LandingPage({ hero, children }: LandingPageProps): React.ReactElement {
  return (
    <PublicPage active="nav_product" hero={hero}>
      {children}
    </PublicPage>
  );
}
