# MU0 — Reorganização ampla com comportamento preservado

Estado: por implementar. Dependência: aplicação local atual e alterações pré-existentes inventariadas. Escolha expressa **7B**: reorganizar primeiro, antes das novas funcionalidades. Ler [guia](README.md) e [arquitetura](ARQUITETURA.md).

## Objetivo e limites

Preparar uma estrutura simples por domínios, biblioteca interna de componentes e contratos claros. É uma reorganização ampla, executada em passos verificáveis; não uma reescrita da aplicação nem alteração de regras financeiras. Não adicionar Utilizador, espaços, MFA, compensações ou novo esquema funcional nesta fase. Não apagar funcionalidades/alterações locais para obter testes verdes.

## Trabalho

1. Registar baseline de ficheiros/contratos, comportamento e verificações, separando falhas já existentes das introduzidas. Consultar regras atuais em AGENTS/REQUISITOS; não usar a regra antiga de ausência de transporte de saldos.
   Inventariar também o `migrate(path)` automático no arranque e a compatibilidade de backup/restauro para a transição MU1. MU0 preserva formatos persistidos; não usar a reorganização para aplicar já o novo esquema.
2. Mapear módulos, dependências e exports públicos. Extrair composição de `App.tsx`, domínio financeiro, adaptadores e hooks pelas responsabilidades de AR02. Preservar IDs, formatos persistidos, rotas e comportamento observável nesta etapa.
3. Consolidar componentes existentes antes de criar alternativas: MoneyInput, SearchField, Dialog e restantes componentes financeiros. Primitivas comuns cobrem teclado, foco, rótulos, erro e loading. Evitar duplicar estilos e validação monetária.
4. Organizar textos/constantes/configuração por domínio e finalidade. Introduzir estrutura mínima para futura separação de idiomas sem traduzir já ou mudar moeda. Manter os mesmos textos funcionais salvo correções pontuais documentadas.
5. Selecionar biblioteca de schemas por manutenção/licença/compatibilidade/documentação oficial. Substituir parsing manual por contratos equivalentes, sem aceitar entradas antes recusadas ou mudar regras de negócio inadvertidamente. Qualquer endurecimento necessário fica identificado e testado como alteração deliberada.
6. Configurar formatter e análise estática proporcionais, TypeScript estrito e verificação de fronteiras/imports. Não adicionar uma plataforma genérica de plugins, contentores DI, event bus ou microserviços.
7. Escrever mapa antigo → novo e nota de decisões técnicas. Referências nos testes/scripts/docs afetados devem continuar corretas.

## Verificação e aceitação

- `typecheck`, testes unitários/integração relevantes, build e percursos de navegador passam ou têm falhas preexistentes identificadas que impeçam aceitação, sem afirmar aprovação completa.
- Comparação financeira antes/depois em fixtures independentes: saldos iniciais capturados, Modelo Base, pagamentos, reservas, total manual, conferência, correções, snapshots e recorrências.
- Persistência, dupla confirmação e recuperação existente mantêm comportamento. Nenhum teste usa a base real.
- Inspecionar UI renderizada em desktop e mobile, incluindo formulário monetário, seleção pesquisável, diálogos, estados vazios e navegação. Inspeção não é só screenshot produzido: registar o que se verificou.
- Revisor independente verifica ausência de novas dependências cruzadas e de mudanças contabilísticas escondidas no refactor. Sem ciclos, sem classes estáticas só para constantes e sem componentes universais com flags contraditórias.

## Entrega

Mapa de módulos, decisões sobre dependências, verificações/comandos/resultados, evidência visual e limitações. Manter arranque manual único do AGENTS. Para reverter, usar apenas mudanças desta fase sobre o baseline inventariado, preservando trabalho anterior. Parar após entregar MU0; não iniciar MU1 automaticamente.
