# Histórico de versões

## 1W — Expansão administrativa para múltiplas lojas — Homologada e publicada em HML

- Configurações passa a cadastrar lojas com identificação automática, editar seus dados e controlar a situação ativa sem permitir exclusão.
- Novas lojas começam inativas e sem duplicar documentos de estoque; os saldos continuam sendo criados sob demanda pelas movimentações existentes.
- Uma loja com terminal ativo não pode ser desativada, e um terminal ativo precisa ser desativado antes de mudar de loja.
- Estoque passa a permitir a seleção entre as lojas atribuídas ao usuário; administradores mantêm visão global.
- Leituras diretas de lojas respeitam o escopo das custom claims, e escritas ficam restritas à Function `manageSettings`, com auditoria.
- O painel administrativo recebe uma revisão visual completa: cabeçalhos, filtros, cartões, tabelas, estados, formulários e botões passam a seguir o mesmo alinhamento e comportamento responsivo.
- Configurações passa a separar Alertas, Lojas e Terminais em seções visuais próprias; ações e formulários ficam organizados sem alterar os fluxos já validados.
- Usuários passa a oferecer os perfis exclusivos `Administrador master` e `Administrador`: o master acessa todos os módulos, enquanto o administrador mantém acesso global às lojas e aos módulos operacionais, mas não acessa Configurações nem Auditoria.
- Somente um master pode atribuir ou alterar o perfil master, impedindo que um administrador comum recupere indiretamente o acesso às configurações.
- Papéis operacionais continuam restritos às lojas atribuídas, enquanto combinações de um perfil global com outros papéis ou lojas são rejeitadas pelo backend.
- A fase reutiliza `manageSettings`; não cria Function, tarefa agendada, coleção ou índice composto.
- Validação final em 10/09/2026: lint e builds de frontend e backend aprovados; sete testes de regras e 82 testes de negócio passaram sem falhas. O `diff-check` não encontrou erros e apresentou somente avisos de conversão LF/CRLF. Permanece a recomendação de desempenho do Vite para o pacote principal acima de 500 kB.
- Publicação confirmada em `seolleda-dev` (HML): regras do Firestore, Hosting e dez Functions dependentes da hierarquia de papéis foram atualizados com sucesso (`manageAdminUsers`, `manageSettings`, `listSettingsAudit`, `manageProducts`, `manageInventory`, `listAdminSales`, `getAdminReport`, `managePayment`, `resolveSaleStock` e `reconcileSaleReservation`). Após a revisão final, o Hosting foi republicado isoladamente com o ajuste de navegação do administrador. As duas saídas confirmaram `Deploy complete`.
- A conta `jpbelooo@gmail.com` foi promovida para `roles: ["master"]` no Firebase Authentication de HML, com remoção das claims administrativas legadas, das lojas atribuídas e revogação dos tokens de renovação.
- Após a publicação e a renovação da sessão, o usuário confirmou a homologação funcional da 1W em HML em 10/09/2026.

## 1V.1 — Saneamento técnico dos avisos do frontend — Homologada e publicada em HML

- O hook de autenticação passa a ficar separado do componente provedor, preservando o Fast Refresh durante o desenvolvimento.
- Carregamentos iniciais de auditoria, categorias, configurações, produtos e estoque passam a ignorar respostas após a desmontagem da tela, sem criar novas consultas.
- A invalidação da consulta de vendas deixa de acessar diretamente o `ref` no retorno do efeito, mantendo a proteção contra respostas antigas.
- O hotfix não altera regras, Functions, dados, permissões ou fluxos funcionais; seu objetivo é zerar os sete avisos conhecidos do lint do frontend.
- Validação enviada pelo usuário em 10/09/2026: lint do frontend aprovado com zero erros e zero avisos, e build concluído com sucesso. Permanece somente a recomendação de desempenho do Vite para o pacote principal acima de 500 kB, fora do escopo deste hotfix.
- Publicação confirmada em `seolleda-dev` (HML): somente o Hosting foi publicado, com `release complete` e `Deploy complete` na saída enviada pelo usuário.
- Após a publicação, o usuário confirmou a homologação funcional da 1V.1 em HML em 10/09/2026.
- Fechamento concluído: commit `1a2db9d` enviado à `main` e tag `release-1v.1` publicada no repositório remoto.

## 1V — Gestão administrativa de usuários e permissões — Homologada e publicada em HML

- Administradores podem listar contas do Firebase Authentication em páginas de até 100 e pesquisar os resultados já carregados no navegador.
- Contas internas são criadas sem senha inicial e recebem convite por redefinição de senha; nenhuma senha é armazenada ou exibida pelo Seolleda.
- Papéis administrativos, lojas atribuídas e situação ativa da conta podem ser alterados, com revogação dos tokens de renovação após mudanças.
- Somente administradores acessam a tela e a nova callable; além do token apresentado, a Function confirma as claims atuais e a situação ativa do autor diretamente no Authentication.
- O usuário atual não pode alterar os próprios papéis nem desativar a própria conta, evitando bloqueio acidental do administrador em uso.
- O contexto de autenticação acompanha renovações do ID token para refletir papéis atualizados na navegação assim que novas claims forem emitidas.
- Contas e permissões continuarão centralizadas no Firebase Authentication e em custom claims, sem duplicação no Firestore.
- Validação local enviada pelo usuário em 10/09/2026: builds de frontend e backend aprovados, lints sem erros, seis testes de regras e 76 testes de negócio aprovados. O `diff-check` não encontrou erros e mostrou somente avisos de conversão LF/CRLF. Permanecem os sete avisos conhecidos do frontend, reservados para saneamento técnico posterior.
- Publicação confirmada em `seolleda-dev` (HML): a Function `manageAdminUsers` foi criada em `southamerica-east1` e o Hosting foi publicado. A saída enviada confirmou sucesso nos dois alvos e `Deploy complete`.
- Após a publicação, o usuário executou o roteiro funcional e confirmou a homologação da 1V em HML em 10/09/2026.
- Fechamento concluído: commit `e23ea16` enviado à `main` e tag `release-1v` publicada no repositório remoto.

## 1U — Fechamento financeiro e exportação de relatórios — Homologada e publicada em HML

- Totais financeiros bruto, reembolsado e líquido, separados por Pix e cartão e consolidados por dia e loja.
- Contagem de vendas pagas, canceladas, estornadas e contestadas, sem incluir vendas em revisão nos valores confirmados.
- Filtros de período, loja e forma de pagamento, preservando o limite de mil vendas por consulta.
- Exportação do relatório filtrado em CSV gerada diretamente no navegador, sem armazenar cópias no Firebase.
- A fase reutiliza `getAdminReport`; não cria Function, tarefa agendada ou coleção de relatórios.
- Validação local enviada pelo usuário em 10/09/2026: lint e build de frontend e backend aprovados; seis testes de regras e 72 testes de negócio passaram, incluindo os três testes da 1U. O diff-check não encontrou erros e mostrou somente avisos de conversão LF/CRLF. Permanecem os sete avisos conhecidos do frontend e o aviso de tamanho do pacote, sem erros novos.
- Publicação confirmada em `seolleda-dev` (HML): `getAdminReport` foi atualizada em `southamerica-east1` e o Hosting foi publicado. A saída enviada confirmou sucesso nos dois alvos e `Deploy complete`.
- Após a publicação, o usuário executou o roteiro funcional e confirmou a homologação da 1U em HML em 10/09/2026.
- Fechamento concluído: commit `e19c243` enviado à `main` e tag `release-1u` publicada no repositório remoto.

## 1T — Reembolsos e devoluções parciais — Homologada e publicada em HML

- Administradores podem selecionar itens e quantidades de uma venda paga para solicitar um reembolso parcial; o backend calcula o valor exclusivamente pelos preços originais persistidos.
- Cada solicitação possui identificação idempotente própria, confirmação pelo valor acumulado informado pelo Mercado Pago e registro do motivo, responsável, itens e valor.
- A devolução física fica vinculada à operação de reembolso parcial: é possível repor somente os itens recebidos ou encerrar aquela operação sem reposição.
- Quantidades já reembolsadas ou devolvidas não podem ser processadas novamente. Solicitações simultâneas, respostas perdidas e divergências do provedor não duplicam dinheiro nem estoque.
- Relatórios descontam valores e unidades dos reembolsos parciais confirmados, exibindo receita, ticket e unidades líquidas.
- A fase reutiliza `managePayment`, `mercadoPagoWebhook`, `resolveSaleStock`, `listAdminSales` e `getAdminReport`; nenhuma nova Function ou tarefa agendada foi criada.
- Validação enviada pelo usuário em 09/09/2026: lint e build de frontend e backend aprovados; lint frontend com os sete avisos conhecidos; 70 testes de negócio e seis testes de regras aprovados. O diff-check passou somente com avisos de conversão LF/CRLF; as mensagens `PERMISSION_DENIED` do emulador correspondem aos bloqueios esperados.
- Publicação confirmada em `seolleda-dev` (HML): cinco Functions foram atualizadas em `southamerica-east1` (`managePayment`, `mercadoPagoWebhook`, `listAdminSales`, `resolveSaleStock` e `getAdminReport`) e o Hosting foi publicado. A saída enviada confirmou sucesso individual em todos os alvos e `Deploy complete`.
- Após a publicação, o usuário executou o roteiro funcional e confirmou a homologação da 1T em HML.
- Fechamento concluído: commit `56c9b8c` enviado à `main` e tag `release-1t` publicada no repositório remoto.

## 1S.1 — Contenção de custos Firebase — Homologada e publicada em HML

- Todas as 16 Functions passam a aplicar as opções globais antes de carregar qualquer gatilho: 256 MiB, CPU fracionária `gcf_gen1`, nenhuma instância mínima, concorrência unitária e no máximo três instâncias por Function.
- A consulta do estado do pagamento usa intervalos progressivos de 3, 10 e 30 segundos; abas ocultas consultam no máximo a cada 30 segundos. Uma venda aberta por 15 minutos cai de aproximadamente 450 para cerca de 64 consultas.
- Relatórios administrativos passam a processar no máximo mil vendas por chamada, reduzindo o risco de milhares de leituras repetidas em consultas amplas.
- O frontend fica preparado para Firebase App Check com reCAPTCHA Enterprise por meio de `VITE_FIREBASE_APPCHECK_SITE_KEY`, e todas as Functions callable passam a exigir o token válido. Em 08/09/2026, o usuário confirmou a configuração no projeto HML e a chave pública foi verificada como presente e não vazia no `.env.local`, sem exposição do valor.
- Auditoria remota encontrou uma tarefa agendada e 328,6 MB no Artifact Registry com limpeza após um dia. Após autorização explícita do usuário, sete versões antigas de segredos foram destruídas permanentemente; a conferência final deixou ativas somente `MERCADO_PAGO_ACCESS_TOKEN` versão 7 e `MP_WEBHOOK_SECRET` versão 2.
- Um teste de regressão garante que os controles globais sejam registrados antes das 16 Functions. Validação enviada pelo usuário: builds frontend/backend e lint backend aprovados; lint frontend sem erros e com os sete avisos conhecidos; 59 testes de negócio e seis testes de regras aprovados. O diff-check apresentou somente avisos de conversão LF/CRLF.
- Publicação confirmada em `seolleda-dev` (HML): as 16 Functions foram atualizadas em `southamerica-east1` e o Hosting foi publicado. A saída enviada confirmou sucesso individual em todos os alvos e `Deploy complete`.
- Após a publicação, o usuário confirmou a versão visível **1S.1 — HML** e homologou funcionalmente o hotfix.
- Fechamento concluído: commit `d7ee849` enviado à `main` e tag `release-1s.1` publicada no repositório remoto.

## 1S — Conciliação de reservas de estoque — Homologada e publicada em HML

- Vendas encerradas com `RELEASE_REVIEW_REQUIRED` passam a oferecer uma análise administrativa das reservas por produto.
- O backend recalcula o saldo esperado com todas as vendas ainda reservadas da mesma loja e mostra o valor atual, o valor esperado e a correção antes da confirmação.
- A confirmação fica vinculada aos valores exibidos; se as reservas mudarem depois da análise, uma nova análise é exigida.
- A aplicação exige administrador, justificativa e confirmação; atualiza todos os produtos e encerra a pendência na mesma transação, com registro imutável por venda.
- Limites e validações interrompem a conciliação quando houver venda ativa inconsistente, mais de 500 vendas reservadas ou saldo físico incompatível. Nenhuma correção parcial é aplicada.
- Correção manual de itens inválidos e tratamento em lote de várias pendências ficam fora desta fase.
- Implementação e validação local concluídas. Em 08/09/2026, lint e build das Functions passaram sem erros, os 58 testes de negócio e os seis testes de regras foram aprovados. O frontend também passou em lint e build, com os sete avisos conhecidos e o aviso de tamanho do pacote. O diff-check passou somente com avisos de conversão LF/CRLF; as mensagens `PERMISSION_DENIED` do emulador correspondem aos bloqueios esperados.
- Publicação confirmada em `seolleda-dev` (HML): `reconcileSaleReservation` foi criada, `listAdminSales` foi atualizada e o Hosting foi publicado. A saída enviada confirmou sucesso individual nos três alvos.
- Após a publicação, o usuário confirmou a homologação funcional da 1S em HML.
- Fechamento concluído: commit `c44f283` enviado à `main` e tag `release-1s` criada para a versão.

## 1R — Devoluções e resolução de pendências de estoque — Homologada e publicada em HML

- Conferência administrativa de vendas estornadas ou contestadas com reserva já consumida: devolução integral com reposição ou encerramento sem reposição, mediante justificativa e confirmação física.
- Backend verifica os itens e a baixa original e grava estoque, movimentações e resolução na mesma transação. Uma resolução por venda impede reposição duplicada, inclusive com solicitações simultâneas.
- Responsável, data, motivo e decisão ficam disponíveis no detalhe da venda; reposições também aparecem no histórico de estoque.
- Devoluções parciais e correção de reservas inconsistentes ficam fora desta fase. Pendências anteriores de reserva não são encerradas por este fluxo.
- Implementação local concluída; adicionados 11 testes de devoluções e um teste de regras para bloquear gravação direta do histórico. Builds, testes, Git e deploy são executados pelo usuário.
- Validação enviada pelo usuário em 08/09/2026: builds frontend/backend aprovados, lints sem erros, 48 testes de negócio e cinco testes de regras aprovados. Permanecem sete avisos conhecidos no lint frontend e o aviso de tamanho do bundle. Diff-check apresentou somente avisos de conversão LF/CRLF. Mensagens de permissão negada no emulador correspondem aos bloqueios esperados.
- Diff enviado pelo usuário e três arquivos novos revisados (`resolveSaleStock.ts`, `returns.test.cjs` e `SaleStockResolution.tsx`). Seleção da fase contém 12 arquivos; cache gerado do Hosting fica fora do commit.
- Usuário autorizou e executou a publicação em `seolleda-dev` (HML) em 08/09/2026: `resolveSaleStock` criada e `listAdminSales` atualizada em `southamerica-east1`; Hosting publicado. Saída enviada confirmou sucesso nos três alvos e `Deploy complete`.
- Após a publicação, o usuário confirmou os testes funcionais e a homologação da 1R. Commit e tag de fechamento ainda pendentes.
- Fechamento concluído: commit `ae52943` enviado à `main` e tag `release-1r` enviada ao repositório remoto.

## 1Q — Operações de pagamentos em revisão, cancelamento e reembolso — Homologada e publicada em HML

- Administradores podem consultar o estado atual no Mercado Pago, cancelar cobranças pendentes e solicitar reembolso integral com motivo obrigatório.
- Identificação persistida antes do envio evita duplicar reembolsos em repetições; operação, motivo, usuário e confirmação ficam registrados no backend.
- Webhook reconhece cancelamento, reembolso e contestação mesmo após venda paga, sem permitir que notificações antigas reabram vendas encerradas.
- Reservas consistentes são liberadas transacionalmente. Produtos de vendas já pagas não retornam automaticamente ao estoque; a venda fica sinalizada para conferência física.
- Consulta não aprova manualmente uma venda em revisão. Reembolso parcial e resolução manual de estoque ficam fora desta fase.
- Implementação e validação local concluídas. Git, builds, testes e deploy são executados pelo usuário.
- Revalidação confirmada pelo usuário em 08/09/2026: lint e build backend sem erros e 37 testes de negócio aprovados, após corrigir o erro `curly` e a preparação das reservas nos testes. Frontend já validado com build aprovado e sete avisos de lint sem erros. Diff-check apresentou somente avisos de conversão LF/CRLF.
- Os quatro testes de regras passaram no emulador do Firestore, com saída 0 confirmada pelo usuário. Mensagens de permissão negada correspondem aos bloqueios esperados pelos testes.
- Diff enviado pelo usuário e os dois arquivos novos (`managePayment.ts` e `reconcilePayment.ts`) revisados. Escopo da 1Q conferido; cache gerado do Hosting excluído da seleção para commit.
- Alvos publicados: `managePayment`, `mercadoPagoWebhook`, `listAdminSales` e Hosting, exclusivamente em `seolleda-dev` (HML).
- Usuário autorizou e executou a publicação em `seolleda-dev` (HML) em 08/09/2026. `managePayment` foi criada; `mercadoPagoWebhook` e `listAdminSales` foram atualizadas; Hosting foi publicado. A saída confirmou sucesso em todos os alvos e `Deploy complete`.
- Após a publicação, o usuário confirmou a homologação funcional da 1Q sem erros.

## 1P — Confiabilidade de reservas e paginação — Homologada e publicada em HML

- A limpeza agendada busca somente vendas pendentes vencidas, em lotes ordenados, evitando que vendas já processadas bloqueiem a fila.
- Reservas inconsistentes saem da fila automática com indicação de revisão de estoque, evitando repetição indefinida do mesmo registro.
- A paginação administrativa usa data e identificador da venda como cursor estável, sem pular vendas criadas no mesmo instante.
- Testes focados cobrem a limpeza em lotes, invocações concorrentes e o cursor composto.
- Implementação local concluída: builds e lints sem erros; 29 testes de negócio e 4 testes de regras aprovados. Três testes focados foram repetidos após o ajuste final.
- Publicada em `seolleda-dev` (HML) em 08/09/2026: `releaseExpiredReservations`, `listAdminSales`, índices do Firestore e Hosting concluíram com `Deploy complete`.
- Após a publicação, o usuário confirmou a versão 1P visível e o teste funcional sem erros.

## 1O — Pagamento por cartão online — Homologada e publicada em HML

- Integração com o Checkout Transparente do Mercado Pago para tokenizar o cartão no navegador.
- O backend recebe o token, a bandeira, o emissor, as parcelas e o e-mail do pagador; o número do cartão não é enviado ao Seolleda.
- A cobrança usa o ciclo de reserva, confirmação por webhook, revisão e baixa transacional já aplicado ao Pix.
- `createCardPayment`, `createPixPayment`, `mercadoPagoWebhook` e o Hosting foram publicados em `seolleda-dev` (HML).
- O usuário confirmou uma venda de cartão aprovada no ambiente homologado.
- A configuração de credenciais do provedor permanece administrada pelo usuário; nenhum segredo foi registrado na documentação.
- O usuário autorizou manter credenciais de produção do Mercado Pago em HML; as cobranças são reais. Essa decisão não altera a identificação do projeto Firebase `seolleda-dev` como HML.
- Validações anteriores ao fechamento: builds frontend/backend, lint backend e 20 testes de pagamentos aprovados; 6 testes de estoque aprovados. Avisos conhecidos do frontend e de tamanho do bundle permanecem.
- No fechamento, os 4 testes de regras passaram no emulador do Firestore; diff sem erros de whitespace.
- Fechamento de repositório autorizado pelo usuário: commit na `main` e tag anotada `release-1o` para identificar esta entrega.

## 1N — Testes automatizados de regras e fluxo — Em desenvolvimento

- Testes no emulador do Firestore cobrem papéis, bloqueio de escritas diretas, escopo por loja e acesso global do administrador.
- O comando `test:business` reúne os 17 testes de Pix e 6 testes de estoque, incluindo concorrência, idempotência e transações sem mutação parcial.
- O comando `test:all` executa regras e fluxo de negócio em sequência.
- Build frontend aprovado e Hosting publicado em `seolleda-dev` com `Deploy complete`; suíte automatizada local passou com 4 testes de regras e 23 testes de negócio. Usuário confirmou a homologação funcional da 1N.

## 1M — Relatórios processados no backend — Em desenvolvimento

- Indicadores de vendas, produtos por volume e resumo de estoque passam a ser agregados pela Function autenticada `getAdminReport`.
- O frontend recebe somente o resultado agregado, sem carregar a coleção de vendas para calcular o relatório no navegador.
- Períodos e limite de 5.000 vendas continuam sendo validados no backend, com escopo de loja aplicado.
- Frontend e backend compilados, lint aprovado, `getAdminReport` e Hosting publicados em `seolleda-dev` com `Deploy complete`. Homologação funcional pendente.

## 1L — Escopo administrativo por loja — Em desenvolvimento

- Claims `storeIds` passam a representar as lojas atribuídas a cada usuário administrativo.
- Estoque e consulta de vendas validam o acesso à loja no backend; administradores continuam com acesso global.
- Regras de leitura de estoque e movimentações também exigem a loja atribuída.
- Script `set-user-stores.mjs` prepara a atribuição de lojas sem alterar credenciais.
- A operação atual permanece com uma loja e seus terminais; cadastro de novas lojas e vínculo de usuários ficam adiados para uma etapa futura.
- Frontend e backend compilados, lint aprovado, Functions de estoque e vendas, regras, índice e Hosting publicados em `seolleda-dev` com `Deploy complete`. Homologação funcional pendente.

## 1K — Unicidade de SKU e código de barras no backend — Em desenvolvimento

- Cadastro, edição e ativação de produtos passam pela Function autenticada `manageProducts`.
- Chaves únicas transacionais impedem concorrência com o mesmo SKU normalizado ou código de barras.
- As regras do Firestore bloqueiam gravações diretas na coleção de produtos e nas chaves de unicidade.
- Frontend e backend compilados, lint aprovado, `manageProducts`, regras e Hosting publicados em `seolleda-dev` com `Deploy complete`. Usuário confirmou a homologação funcional da 1K.

## 1J — Auditoria operacional — Publicada em HML

- Nova consulta administrativa somente leitura para alterações de lojas e terminais.
- O histórico identifica data, usuário, alvo e campos alterados sem permitir edição ou exclusão.
- O pagamento por cartão permanece adiado para uma etapa posterior.
- Frontend e backend compilados, lint aprovado e `listSettingsAudit` mais Hosting publicados em `seolleda-dev` com `Deploy complete`. Usuário confirmou a homologação funcional da 1J.

## 1I — Operação de pagamentos em revisão — Homologada e publicada em HML

- A tela de Vendas passa a apresentar uma fila de triagem com totais de pagamentos pendentes, revisões de pagamento e revisões de estoque no período carregado.
- Atalhos filtram diretamente as revisões de pagamento e estoque; o detalhe identifica o motivo registrado para a revisão.
- Esta etapa é somente leitura: não aprova pagamentos, não faz estornos e não altera estoque automaticamente.
- Build frontend aprovado, lint sem erros bloqueantes e Hosting publicado em `seolleda-dev` com `Deploy complete`. Usuário confirmou a homologação funcional da 1I.

## 1H — Proteção de dados de vendas — Homologada e publicada em HML

- A coleção `sales` deixa de ser lida diretamente pelo frontend.
- Nova Function autenticada `listAdminSales` exige papel de vendas ou relatórios e retorna somente os campos operacionais necessários.
- CPF e e-mail do cliente nunca são enviados ao painel; o identificador do Mercado Pago só é retornado ao administrador.
- Paginação, período e filtros continuam sendo aplicados no backend, reduzindo a exposição e a transferência de dados.
- Regras do Firestore bloqueiam leituras diretas de `sales`. Commit `a44991b` enviado para `main`; `listAdminSales`, regras e Hosting publicados em `seolleda-dev` com `Deploy complete` em 07/09/2026. Usuário confirmou a homologação funcional da 1H.

## 1G — Reserva transacional de estoque — Publicada em HML

- Venda pendente reserva unidades dentro da mesma transação que cria a venda, considerando `quantity - reservedQuantity` como saldo disponível.
- Checkout consulta somente o saldo disponível; movimentações administrativas não podem consumir unidades já reservadas.
- Pagamento aprovado consome a reserva e a unidade física na transação do webhook.
- Function agendada `releaseExpiredReservations` libera reservas de vendas vencidas a cada cinco minutos e marca a venda como expirada.
- Frontend/backend compilados, lint do backend aprovado e 23 testes aprovados, incluindo bloqueio de movimentação sobre unidades reservadas. Commit `a89a43e` enviado para `main`. Functions e Hosting publicados em `seolleda-dev` com `Deploy complete` em 07/09/2026; o deploy criou o job do Cloud Scheduler para a limpeza periódica. Usuário confirmou a homologação funcional da reserva, consumo e liberação do estoque.

## 1F — Segurança administrativa por papéis — Publicada em HML

- Modelo de papéis no token do Firebase: `admin`, `catalog`, `inventory`, `sales`, `reports` e `settings`.
- Rotas e navegação administrativas passam a filtrar Produtos, Categorias, Estoque, Vendas, Relatórios e Configurações conforme o papel.
- `manageInventory` exige `inventory` ou `admin`; `manageSettings` exige `settings` ou `admin`.
- Regras do Firestore deixam de usar apenas autenticação e passam a exigir o papel correspondente para leitura e escrita.
- Conta `jpbelooo@gmail.com` cadastrada no projeto `seolleda-dev` com claim `roles: ["admin"]`; é necessário sair e entrar novamente para renovar o token.
- Frontend/backend compilados, lint do backend aprovado e suíte existente com 22 testes aprovados. Regras compiladas e liberadas; `manageInventory` e `manageSettings` atualizadas em `southamerica-east1`; Hosting publicado em `seolleda-dev` com `Deploy complete` em 07/09/2026.
- Commit publicado: `bb2f0a2`. Usuário confirmou a homologação pós-deploy da 1F. Migração de outros usuários permanece pendente. Tag `release-1f` ainda não criada.

## 1E — Preferências de alertas de estoque — Publicada em HML

- Configurações para exibir/ocultar alertas de estoque baixo, zerado e negativo; todos habilitados por padrão e botão para restaurá-los.
- Preferências locais por navegador e projeto Firebase, compartilhadas pelos usuários desse navegador; atualização entre abas. Não sincronizadas entre dispositivos.
- Aplicação na situação do Estoque e nos indicadores da Visão geral. Saldos continuam visíveis; alerta oculto não é apresentado como estoque normal.
- Saldo negativo identificado separadamente de estoque baixo. Mínimos, backend, regras e pagamento preservados.
- Usuário confirmou teste funcional e homologação da 1E, além de lint e build do frontend sem erros.
- Lint do backend reportou 124 erros de quebra de linha em src/index.ts e src/sales/manageSettings.ts. Arquivos normalizados de CRLF para LF, sem alteração de lógica; execução posterior concluída sem erros.
- Usuário enviou resultado de 22 testes aprovados, sem falhas, e saída do diff-check contendo apenas avisos de conversão LF/CRLF. Adicionados .gitattributes e .editorconfig para preservar LF nos arquivos TypeScript/JavaScript do backend e evitar recorrência do erro de lint.
- Usuário confirmou a validação final sem erros, incluindo lint/build do backend e 22 testes aprovados. Commit c835075 enviado para main. Hosting publicado em seolleda-dev (HML), com saída Deploy complete e URL https://seolleda-dev.web.app. Tag de fechamento ainda não criada.

## 1D — Configurações — Publicada em HML

- Usuário homologou o fluxo inicial. Ajuste posterior: identificação de novos terminais gerada automaticamente no backend; IDs existentes preservados. Identificação automática testada com sucesso pelo usuário.

- Edição das lojas existentes: nome, endereço e contato.
- Cadastro e edição de terminais: identificação, nome, loja e ativação/desativação.
- Callable autenticada manageSettings, com validação e registro de alterações em settingsAudit na mesma transação.
- Mantém o padrão de acesso administrativo existente (usuário autenticado); não introduz papéis. Sem mudanças nas regras.
- Novos terminais começam inativos. ID existente não pode ser renomeado. Cadastro não configura o dispositivo; checkout ainda usa VITE_TERMINAL_ID.
- Cartão adiado. Validações e homologação confirmadas pelo usuário. Hosting publicado no seolleda-dev (HML), conforme saída Deploy complete. manageSettings já havia sido publicada para homologação. Commit e tag não verificados nesta confirmação.

## 1C.1 — Responsividade e logo oficial — Publicada em HML

- Logo oficial também no ícone da aba; título Seolleda e idioma da página pt-BR.

- Logo oficial fornecida pelo usuário aplicada no cabeçalho, menu administrativo, início da compra e login. JPG original preservado; enquadramento visual das margens brancas pelo CSS.

- Segunda revisão após teste: CPF/e-mail em layout horizontal, carrinho empilhado até 1000px e Pix em duas colunas em paisagem; rolagem dos diálogos pela altura útil. Teste no tablet confirmado pelo usuário.

- Indicadores com colunas flexíveis e quebra de valores longos.
- Carrinho e painel ajustados para larguras de 821 a 1280 pixels.
- Espaçamentos e diálogos ajustados para orientação horizontal com pouca altura.
- Usuário confirmou homologação, build e lint sem erros (seis avisos). Deploy somente do Hosting em seolleda-dev (HML) confirmado pela saída Deploy complete. Commit e tag não verificados nesta confirmação.

## 1C — Relatórios e dashboard — Publicada em HML

- Indicadores por período de criação da compra, horário local e todas as lojas.
- Receita, ticket médio e unidades apenas de vendas PAID/APPROVED sem revisão de pagamento; não são indicadores de lucro ou caixa por recebimento.
- Relatórios diários e produtos ordenados por unidades vendidas.
- Dashboard com estoque atual, alertas e atalhos administrativos.
- Paginação automática; períodos excessivos são recusados sem exibir totais parciais (até 93 dias e limite conservador de 5.000 compras).
- Apenas leitura; nenhum backend ou regra alterado. Usuário confirmou testes funcionais, lint e build sem erros. Publicação somente do Hosting em seolleda-dev (HML) confirmada pela saída Deploy complete enviada pelo usuário. Commit e tag não verificados nesta confirmação.

## 1B — Vendas — Publicada em HML

- Consulta por período de criação (horário local), em páginas de 100 vendas.
- Busca por venda, terminal ou pagamento e filtro de situação sobre os registros carregados.
- Detalhes dos itens, valores e datas, com alertas de revisão de pagamento e estoque.
- Prazo encerrado é uma indicação local; não representa cancelamento no provedor.
- Consulta administrativa somente leitura; regras e backend preservados.
- Usuário confirmou validações e testes funcionais com sucesso. Publicação somente do Hosting em seolleda-dev confirmada pela saída Deploy complete enviada pelo usuário. Site: https://seolleda-dev.web.app. Commit e tag não verificados nesta confirmação.
- Indicador de versão identifica seolleda-dev como HML. Ajuste do rótulo posterior à homologação, ainda sem nova validação.

## 1A — Publicada em HML (seolleda-dev) — 07/09/2026

Código publicado: 9d5a33af90ca7a92a2464b94173b0b67c9ed39e8. Projeto: seolleda-dev. Site: https://seolleda-dev.web.app. Tag de fechamento: release-1a (inclui registro documental pós-deploy).

- Base existente de autenticação, categorias, produtos e checkout.
- Pix implementado; usuário confirmou sua implementação.
- Estoque administrativo transferido para manageInventory, com transação e proteção contra reenvio da mesma operação.
- manageInventory publicada em seolleda-dev em 07/09/2026; estoque homologado com sucesso pelo usuário.
- Versão funcional centralizada e exibida no canto inferior esquerdo de todas as telas.
- Processo permanente de fases, hotfixes, validação e publicação documentado.

Validação anterior do estoque: cinco testes simulados de estoque e 17 testes Pix aprovados. Builds/lints sem erros; avisos existentes de frontend. Validação final: 22 testes aprovados, builds/lints sem erros e diff-check aprovado. Hosting e createSale, createPixPayment, getSalePaymentStatus, mercadoPagoWebhook e manageInventory publicados com sucesso. Regras não alteradas. HTTP 200 e HTML correspondente ao build confirmados. Homologação funcional pós-publicação ainda não realizada; estoque havia sido homologado pelo usuário antes do deploy.

## Próximas versões

- Fase atual: 1W — expansão administrativa para múltiplas lojas, homologada e publicada em HML.
- Última versão funcional: 1W — múltiplas lojas, revisão visual e separação entre administrador master e administrador.
- Último hotfix: 1V.1 — saneamento técnico dos avisos do frontend, homologado e publicado em HML; commit `1a2db9d` e tag `release-1v.1` confirmados.
- Versão anterior: 1V — gestão administrativa de usuários e permissões, homologada e publicada em HML; commit `e23ea16` e tag `release-1v` confirmados.
- Versão anterior à 1V: 1U — fechamento financeiro e exportação de relatórios, homologada e publicada em HML; commit `e19c243` e tag `release-1u` confirmados.
