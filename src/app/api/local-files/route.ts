import { writeAccess } from '@/server/access';
import { basename } from 'node:path';
import { createBackup } from '@/server/local-files.mjs';
import { Repository } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const mode = writeAccess(request);
  if (!mode) {
    return Response.json({ message: 'Faça este pedido nas Definições da aplicação local.' }, { status: 403, headers });
  }
  const action = new URL(request.url).searchParams.get('action');
  try {
    if (action === 'backup') {
      const backup = await createBackup();
      return Response.json(mode === 'home' ? { ...backup, path: basename(backup.path) } : backup, { headers });
    }
    if (action === 'export') {
      if (mode !== 'local') return Response.json({ message: 'A exportação JSON está disponível no PC.' }, { status: 403, headers });
      const { state, revision } = new Repository().read();
      const { accounts, categories, reserves, base, recurring, months } = state;
      const data = {
        format: 'o-meu-mes-export', version: 1, exportedAt: new Date().toISOString(),
        currency: 'EUR', moneyUnit: 'cent', revision,
        accounts, categories, reserves, base, recurring, months,
      };
      return new Response(JSON.stringify(data, null, 2) + '\n', {
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
    return Response.json({ message: 'Escolha criar um backup ou exportar os dados.' }, { status: 400, headers });
  } catch (error) {
    const e = error as { code?: string; name?: string; errcode?: number };
    console.error('Falha em ficheiros locais', { code: e.code ?? e.name, sqlite: e.errcode });
    const message = action === 'backup'
      ? 'Não foi possível criar um backup verificado. Confirme o espaço livre e a permissão de escrita na pasta da base e tente novamente.'
      : 'Não foi possível preparar a exportação. Verifique se a aplicação local está a funcionar e tente novamente.';
    return Response.json({ message }, { status: 503, headers });
  }
}
