# Fase 5 — Fiabilidade e entrega local

Ensaio de 04/11/2026 em Windows, Node.js 24.22.1, SQLite 3.53.4, pnpm 11.25.0 e Microsoft Edge. Foram usadas bases fictícias novas em pastas temporárias `omeumes-test-*`. A base habitual ficou fora dos ensaios.

## Ensaio de recuperação

1. O teste abriu `Iniciar.cmd` sobre um caminho novo, com um servidor independente a ocupar a porta pedida. A aplicação anunciou outra porta em `127.0.0.1` e o servidor independente continuou a responder.
2. O primeiro mês arrancou vazio. O ensaio introduziu linhas de despesa e reforço no mês e no Modelo Base, saldos fictícios, uma reserva, um plano inicial e uma alteração posterior. Registou uma transferência, uma despesa pela conta, um reforço e uma despesa pela reserva. Abriu um segundo mês a partir do Modelo Base, adicionou um lembrete de montante por indicar e dispensou outro.
3. O servidor gerou o backup SQLite. Depois de parar a origem, o teste abriu `Restaurar.cmd`, conferiu a apresentação da origem e do destino antes da cópia, confirmou e abriu o novo servidor sobre o destino. O ficheiro do backup e a base habitual do ensaio conservaram os mesmos bytes.
4. A resposta da cópia recuperada coincidiu com a da origem, incluindo revisão, catálogos, meses, plano atual, plano inicial, eventos, efeitos, lembretes e recibos. O segundo mês conservou os seus próprios saldos por indicar e nenhum evento. Reenviar o pedido de 40 € com a mesma chave e revisão devolveu `replay: true`. A revisão e os quatro eventos mantiveram-se.
5. O Edge abriu a **Cópia recuperada**, mudou para o primeiro mês e mostrou o saldo utilizável de 1.060 €, despesas por pagar de 75 € e 40 € realizados na compra. Uma tentativa pendente fictícia da base habitual colocada no navegador ficou fora da sessão de recuperação. O teste fechou a cópia, reabriu a origem com `Iniciar.cmd` e comparou novamente o estado.

| Conferência independente | Resultado |
|---|---:|
| Conta de origem: 1.000 € − 250 € − 40 € − 100 € | 610 € |
| Conta de destino: 200 € + 250 € | 450 € |
| Reserva: 0 € + 100 € − 15 € | 85 € |
| Despesas realizadas: 40 € + 15 € | 55 € |
| Despesas por pagar: (90 € − 40 €) + (40 € − 15 €) | 75 € |
| Saldo utilizável: 610 € + 450 € | 1.060 € |
| Disponibilidade após compromissos nas contas principais: 1.060 € − 50 € | 1.010 € |
| Património conhecido: 610 € + 450 € + 85 € | 1.145 € |

O plano inicial preservou 85 € na linha que passou para 90 € no plano atual. O reforço de 100 € ficou concluído. A transferência e o reforço produziram efeitos em duas origens sem aumentar as despesas.

## Falhas, concorrência e exportação

- O teste de WAL manteve uma ligação aberta, desativou checkpoints automáticos nessa ligação e confirmou um saldo antes da cópia. Durante uma cópia de uma página por passo confirmou um segundo saldo por outra ligação. O destino recuperado incluiu ambos os commits, com os recibos e a mesma revisão.
- Foram recusados ficheiros ilegíveis, uma base SQLite alheia, uma versão futura, relações quebradas, o caminho habitual, um destino existente e uma pasta pública, incluindo um atalho de diretoria para essa pasta em Windows.
- O teste de integração bloqueou a criação da pasta de backups com um ficheiro e recebeu 503. O teste de armazenamento injetou `EACCES` na publicação do backup e do restauro depois da preparação da cópia. As falhas conservaram a origem e os destinos existentes, não deixaram ficheiros com nomes finais e permitiram repetir.
- O JSON coincidiu com os dados persistidos, incluindo acentos, cêntimos, datas, referências históricas e valores `null`. O Edge descarregou o ficheiro anunciado. Pedidos de backup e exportação de outra origem foram recusados.
- Uma base inválida e um caminho onde não era possível criar a base produziram um erro acionável no arranque. A regressão de migrações confirmou que uma falha de SQL reverte as alterações de esquema e a versão.

## Recuperação manual

Em **Definições → Dados locais**, escolha **Criar backup**, aguarde pela confirmação e use **Copiar caminho**. Abra `Restaurar.cmd`, cole o caminho do backup, aceite o nome novo ou escolha outro destino privado e confirme os dois caminhos. Responda **s** para abrir a cópia e use o endereço mostrado. Para regressar, pare a cópia com **Ctrl+C** e abra `Iniciar.cmd` sem argumentos. Se o servidor habitual ainda estiver aberto, pode regressar ao seu endereço. [Instruções de recuperação](../README.md#backup-exportação-e-recuperação)

## Capturas

Inspeção visual no Edge em desktop e a 360 e 390 px. Foram verificados o foco visível, a utilização com Enter e Espaço, o toque, alvos de 44 px e a ausência de deslocação horizontal. Após a primeira inspeção, acrescentou-se **Copiar caminho** e ajustaram-se o alinhamento dos cartões e o enquadramento das capturas móveis. Os percursos foram repetidos nos três tamanhos.

- [Definições em desktop](capturas/fase-5/dados-locais-1366.png) e [falha recuperável](capturas/fase-5/backup-falha-1366.png).
- Dados locais a [360 px](capturas/fase-5/dados-locais-360.png) e [390 px](capturas/fase-5/dados-locais-390.png).
- Instruções de restauro a [360 px](capturas/fase-5/restauro-360.png) e [390 px](capturas/fase-5/restauro-390.png).
- [Aplicação aberta sobre a cópia recuperada](capturas/fase-5/copia-recuperada-1366.png).

## Comandos e resultados

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | Sem erros |
| `pnpm test` | 145 testes passaram |
| `pnpm build` | Compilação concluída |
| `pnpm test:integration` | 4 testes passaram, incluindo arranque e recuperação Windows com Edge |
| `pnpm test:e2e` | 46 testes passaram em Edge |
| `pnpm test:e2e phase-5.spec.ts` | 3 testes passaram numa base nova para obter as capturas finais |
| `pnpm install --offline --frozen-lockfile` e `Iniciar.cmd --port 43157` numa cópia temporária do código | A primeira abertura compilou sem build prévia, criou apenas a base fictícia e respondeu com revisão 0 |

A primeira montagem desse ensaio, com um atalho para as dependências fora da cópia, foi rejeitada pelo Turbopack. A repetição com as dependências instaladas na pasta de ensaio passou.

## Limites

O restauro requer uma nova localização numa pasta privada com suporte a hard links, verificado em NTFS. Backup e exportação são ações manuais e os ficheiros não têm encriptação própria. O JSON serve para consulta. O restauro usa o ficheiro SQLite e recupera os dados confirmados até ao momento da cópia. A validação com o utilizador pertence à Fase 6.
