import { locale } from '../shared/i18n/pt-PT';
import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'O meu mês', description: 'Planeamento mensal e registos guardados neste computador.' };
export const viewport: Viewport = { interactiveWidget: 'resizes-content' };
export default function Layout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang={locale}><body>{children}</body></html>;
}
