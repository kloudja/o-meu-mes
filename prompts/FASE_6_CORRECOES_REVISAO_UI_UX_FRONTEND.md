# Fase 6 — Aplicar as correções da revisão de UI, UX e frontend

Implementa estas correções no projeto **O meu mês**. Lê primeiro `AGENTS.md`, `docs/REQUISITOS.md`, `docs/PLANO.md` e `prompts/FASE_6_VALIDACAO_UTILIZACAO_ACABAMENTO.md`. Consulta também `docs/FASE_6_RESULTADOS.md` e `docs/CONTAS_TRANSFERENCIAS.md` para perceber o comportamento já validado. Este pedido dá continuidade à Fase 6 e autoriza a implementação das correções abaixo.

Trabalha em localhost, com a demonstração e uma base de ensaio isolada com dados fictícios. Preserva a base habitual, o Excel de referência e o projeto Finanças Pessoais. Usa português de Portugal, EUR, datas portuguesas e cêntimos inteiros. Reutiliza os componentes, consultas de domínio e mecanismos de persistência existentes. Preserva o isolamento mensal, o plano inicial imutável, a execução antes da gravação do plano e a separação entre contas principais e reservas.

## 1. Corrigir primeiro os registos que podem divergir do banco

### Transferências em lote

- No diálogo existente, mostra primeiro as transferências sugeridas, com origem, destino e montante, seguidas do que fica por cobrir e dos valores por apurar. Apresenta o número de transferências, o total e a data efetiva editável antes da ação «Registar N transferências já efetuadas». Mantém o percurso individual para operações com valores ou datas diferentes ou para quem só realizou parte do lote.
- Vincula a confirmação ao mês, à revisão e ao conjunto exato de origens, destinos e montantes apresentados. Uma atualização da aplicação enquanto o diálogo está aberto deve invalidar a revisão em curso se alterar o lote. Valida essa correspondência também no servidor, antes de qualquer escrita. Em caso de divergência, explica o que mudou e permite rever a nova lista ou registar individualmente o que já foi feito no banco.
- Preserva a atomicidade e a idempotência. Abrir, rever ou cancelar preserva os saldos. Um duplo clique ou a repetição do pedido após uma resposta perdida produz um único lote. Usa a data revista nos registos.
- Regressão obrigatória em duas sessões, com SQLite fictício. A primeira sessão revê uma rota de 50 €. A segunda altera um saldo e a rota passa para 35 €. A confirmação antiga deve ser recusada sem registar nenhuma transferência do lote. Após nova revisão e confirmação, só o lote aprovado pode ser gravado. Verifica os efeitos em cêntimos por conta e o resultado após recarregar.

### Compras individuais e total acumulado

- Abre «Compra individual» com o montante vazio. Comida com 200 € previstos deve continuar sem novo movimento e sem débito quando se tenta confirmar sem preencher o campo. Mantém o pagamento integral de despesas fixas numa ação.
- Em «Total acumulado», mostra antes da gravação o gasto já registado, o novo total, o ajuste e o efeito na origem escolhida, quando forem determináveis. Reutiliza o cálculo do domínio. Com 40 € em compras e um novo total de 60 €, a prévia e o resultado devem indicar 60 € gastos e um débito adicional de 20 €. Se o total for inferior às compras conhecidas, indica junto ao montante o que precisa de ser corrigido e preserva os registos existentes.

### Identidade das contas, categorias e reservas

- Conserva o ID estável da opção selecionada ou pré-preenchida até ao envio do comando. Separa o texto de pesquisa da seleção. Distingue opções homónimas com o contexto disponível e uma indicação inequívoca quando pertencem à mesma conta. Trata a alteração do texto após uma seleção de forma a evitar que fique ativo um ID que o campo já não representa.
- Reproduz o caso de duas reservas com o mesmo nome na mesma conta. Cria primeiro a reserva com 300 € e depois a de 100 €. Registar um reforço livre de 10 € a partir do cartão da segunda deve deixá-la com 110 €, manter a primeira em 300 € e debitar 10 € na conta principal. Confirma o destino na prévia, nos efeitos persistidos e após recarregar. Mantém utilizáveis os dados já existentes, incluindo reservas homónimas.

## 2. Melhorar o feedback, a acessibilidade e a leitura

- **Pagamento concluído.** Mostra junto da linha o montante registado, a data, a conta ou reserva debitada e um acesso ao registo. A confirmação deve aparecer depois da gravação, ficar visível sem deslocação manual e ser anunciada como mensagem de estado. Após pagamento por teclado, encaminha o foco para «Detalhe» da mesma linha se «Pagar» ficar desativado. Verifica também o fecho dos diálogos, Escape e o retorno do foco.
- **Erros de formulário.** Associa cada erro ao campo efetivamente inválido, preserva os valores introduzidos e encaminha o foco para a correção. Verifica a ligação entre mensagem e campo e o estado `aria-invalid`. Com um montante válido e uma origem inválida, o campo «Origem do dinheiro» deve receber o erro. Aplica o mesmo princípio a destino, data e montante.
- **Insuficiência em reservas.** Apresenta o aviso antes de tentar pagar. Uma reserva de 0 € com 40 € de despesas previstas deve indicar que faltam 40 € e permitir chegar à reserva ou ao compromisso. Distingue falta apurada de saldo ou plano por indicar. Mantém estes avisos separados das sugestões entre contas à ordem e reutiliza os cálculos existentes.
- **Cartões do resumo.** Ajusta a grelha para quatro, duas ou uma coluna conforme a largura útil. Mantém cada montante, sinal, cêntimos e símbolo do euro numa linha, com os valores alinhados. Valida 320, 360, 390, 701, 768, 820, 1024 e 1366 px, incluindo valores altos, negativos, zero e zoom de 200% e 400%. Os montantes e ações devem ficar legíveis sem truncamento ou deslocação horizontal.
- **Subtotais e ajuda.** Quando o valor apresentado for parcial, indica junto dele a cobertura real, por exemplo «Subtotal · 5 de 6 contas», e distingue o estado «Por apurar» com a respetiva causa. Garante pelo menos 4,5:1 de contraste para texto normal. Troca a ajuda que corta ou tapa conteúdo por um controlo «Como é calculado» que expande a explicação em linha, utilizável por toque, Enter e Espaço. Usa 44 px como meta para o alvo de toque.

## 3. Afinar lembretes e pesquisa

- **Lembrete com possível correspondência.** Quando já existir um movimento plausível para o lembrete, apresenta-o com os dados disponíveis e dá prioridade a «Associar a movimento existente». Mantém explícita a opção de criar uma despesa separada. Um nome igual é apenas uma pista. A associação exige escolha explícita, usa IDs e preserva o total do plano, a execução e os saldos. Testa o exemplo fictício do Seguro do Carro que já está no plano.
- **Pesquisa.** Calcula os resultados a partir do filtro e dos dados atuais. Ao renomear ou atualizar uma conta, o resultado deve corresponder imediatamente ao filtro ativo. Distingue «Sem resultados para esta pesquisa», com ação para limpar o filtro, de um mês ou catálogo realmente vazio.

## 4. Verificar e entregar

- Executa `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration` e `pnpm test:e2e`. Acrescenta regressões específicas quando a cobertura atual não reproduzir a falha. Nos casos financeiros, verifica valores esperados independentes, eventos e saldos por origem. Usa bases de teste novas e identificadas.
- Inspeciona a interface renderizada em desktop e móvel, incluindo os pontos de quebra a 701 e 768 px e um diálogo com altura reduzida. Testa teclado, foco, toque, zoom, contraste, campos inválidos, ausência de dados, cancelamento, falha de gravação e confirmação. Guarda capturas apenas com dados fictícios. Distingue o que foi observado em emulação do que foi testado num Android físico ou com leitor de ecrã.
- Regista em `docs/FASE_6_RESULTADOS.md` os problemas reproduzidos, as correções, os comandos e resultados, as capturas e as limitações. Se um critério não puder ser verificado, identifica-o concretamente e indica a verificação pendente.
- Deixa o ensaio pronto para a validação acompanhada. Pede ao utilizador, por objetivos e sem indicar onde clicar, que antecipe o efeito do total de uma compra, descubra uma insuficiência numa reserva, registe só parte de um lote e encontre o pagamento confirmado. Inclui os restantes percursos pendentes da Fase 6. A conclusão da fase depende dos testes, da experimentação e da aceitação do utilizador.

## Referências da revisão

- [Nielsen Norman Group — confirmação de ações](https://www.nngroup.com/articles/confirmation-dialog/) e [GOV.UK Design System — rever antes de submeter](https://design-system.service.gov.uk/patterns/check-answers/)
- [WCAG 2.2 — adaptação do conteúdo](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [identificação de erros](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) e [mensagens de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [WAI — gestão de foco](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) e [controlo de expansão](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [React — estrutura do estado e seleção por ID](https://react.dev/learn/choosing-the-state-structure) e [Playwright — testes de acessibilidade](https://playwright.dev/docs/accessibility-testing)
