import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'O meu mês', description: 'Planeamento mensal e registos guardados neste computador.' };
export const viewport: Viewport = { interactiveWidget: 'resizes-content' };
export default function Layout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang="pt-PT"><body>{children}</body></html>;
}
