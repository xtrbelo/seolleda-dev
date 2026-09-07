# Seolleda

## Objetivo

Sistema de self-checkout/autovenda para produtos físicos.

O cliente:

- inicia a compra;
- escolhe opcionalmente informar CPF;
- escolhe opcionalmente informar e-mail;
- escaneia produtos por código de barras;
- monta o carrinho;
- escolhe a forma de pagamento;
- futuramente poderá pagar por Pix e cartão.

## Tecnologias

Frontend:

- React 19;
- TypeScript;
- Vite;
- React Router;
- Firebase Web SDK.

Backend:

- Firebase Cloud Functions 2nd Gen;
- TypeScript;
- Node.js 22;
- Firebase Admin SDK.

Firebase:

- Firestore;
- Authentication;
- Storage inicializado no frontend;
- Hosting posteriormente (ainda não configurado em `firebase.json`);
- Secret Manager para segredos das Functions.

Projeto Firebase DEV: `seolleda-dev`.

Região das Callable/HTTP Functions: `southamerica-east1`.

## Estrutura

- `src/`: aplicação web React.
- `src/components/`: componentes compartilhados, proteção de rotas e componentes do checkout.
- `src/components/checkout/`: leitor de código de barras, itens e resumo do carrinho e interface Pix.
- `src/contexts/`: contexto de autenticação administrativa.
- `src/layouts/`: layouts do checkout e da área administrativa.
- `src/lib/`: inicialização do Firebase e configuração da navegação administrativa.
- `src/pages/`: login, dashboard, categorias, produtos, estoque e checkout. Vendas, relatórios e configurações ainda são páginas provisórias.
- `src/services/`: acesso ao Firestore e chamadas às Cloud Functions para lojas, categorias, produtos, estoque, vendas e pagamentos.
- `src/types/`: tipos TypeScript do domínio.
- `functions/src/`: backend em Cloud Functions.
- `functions/src/checkout/getCheckoutProduct.ts`: consulta segura de produto/estoque por código de barras e terminal.
- `functions/src/sales/createSale.ts`: criação de venda pendente.
- `functions/src/payments/`: criação de cobrança Pix, cliente HTTP do Mercado Pago e webhook em desenvolvimento.
- `firestore.rules`: regras de acesso do Firestore.
- `firebase.json`: configuração de Firestore e Functions; Hosting ainda não está configurado.
- `.firebaserc`: seleciona `seolleda-dev` como projeto padrão.

## Funcionalidades concluídas

Funcionalidades efetivamente presentes no código:

- Firebase configurado no frontend e no backend;
- autenticação administrativa por e-mail e senha;
- rotas administrativas protegidas e redirecionamento de usuário autenticado;
- cadastro, edição, busca e ativação/desativação de categorias;
- cadastro, edição, busca e ativação/desativação de produtos;
- validação de SKU e código de barras duplicados no frontend administrativo;
- tela de estoque com consulta por loja/produto, estoque mínimo, entradas, saídas, ajustes e histórico de movimentações;
- loja principal criada/consultada como `stores/default-store` quando necessário;
- self-checkout;
- leitura de código de barras por leitor de teclado ou digitação manual;
- consulta de produto e estoque pela Callable Function `getCheckoutProduct`;
- carrinho com inclusão, remoção, ajuste de quantidade e validação de estoque disponível;
- identificação do terminal por `VITE_TERMINAL_ID` e validação do terminal no backend;
- fluxo `Bem-vindo -> CPF -> E-mail -> Checkout`;
- criação de venda pela Callable Function `createSale`;
- recálculo de preços, disponibilidade e total no backend;
- venda criada como `PENDING_PAYMENT`, sem baixa de estoque;
- expiração interna da venda em 15 minutos no momento da criação.

Observações do estado atual:

- as páginas administrativas de vendas, relatórios e configurações são apenas placeholders;
- as regras atuais do Firestore permitem leitura autenticada de estoque e movimentações, mas negam escritas diretas nessas coleções. O serviço administrativo de estoque tenta realizar essas escritas pelo frontend, portanto esse fluxo precisa ser compatibilizado com as regras ou movido para backend para funcionar no ambiente protegido.

## Fluxo inicial do checkout

```text
welcome
-> cpf
-> email
-> checkout
```

CPF:

- é opcional se o cliente selecionar NÃO;
- se selecionar SIM, torna-se obrigatório e deve ser válido;
- é validado no frontend e novamente em `createSale`.

E-mail:

- é opcional se o cliente selecionar NÃO;
- se selecionar SIM, torna-se obrigatório e deve ser válido;
- é validado no frontend e novamente em `createSale`.

CPF e e-mail ficam apenas no estado React durante a sessão. Não são persistidos em `localStorage` nem em `sessionStorage`.

Cancelar a compra executa a limpeza de:

- CPF;
- e-mail;
- carrinho;
- `saleId`;
- total retornado pelo backend;
- estado da etapa e do pagamento da sessão.

## Venda

`createSale` é uma Callable Cloud Function 2nd Gen na região `southamerica-east1`.

O frontend a chama com `httpsCallable` e envia somente:

- `terminalId`;
- `productId` e quantidade dos itens;
- CPF e e-mail, quando informados.

A venda é criada como `PENDING_PAYMENT`, com `paymentStatus: PENDING`.

O backend consulta novamente produtos e estoque, cria snapshots dos itens e recalcula preços e total. O frontend não é fonte confiável para preço ou total.

Os valores monetários persistidos na venda e nos itens da venda são armazenados em centavos (`unitPriceCents`, `totalCents` e `subtotalCents`).

O estoque não é baixado quando a venda está `PENDING_PAYMENT`.

## Firebase

Loja principal: `stores/default-store`.

Terminais: coleção `terminals`.

O terminal é identificado no frontend por `VITE_TERMINAL_ID`. O terminal deve existir, estar ativo e possuir um `storeId` válido.

Variáveis com prefixo `VITE_` são incorporadas ao frontend e nunca devem conter segredos.

## Segurança

Nunca colocar no frontend:

- Mercado Pago Access Token;
- Webhook Secret;
- credenciais privadas;
- credenciais do Firebase Admin.

Segredos devem usar Secret Manager. Existe o secret `MERCADO_PAGO_ACCESS_TOKEN`; seu valor não deve ser escrito neste arquivo nem em código.

As Functions Pix agora declaram MERCADO_PAGO_ACCESS_TOKEN, alinhado ao nome informado neste contexto. O webhook também declara MP_WEBHOOK_SECRET. A existência, as versões habilitadas e as permissões desses secrets no ambiente remoto ainda precisam ser verificadas, sem expor valores.

As operações sensíveis de venda e consulta pública do checkout são feitas por Functions com Firebase Admin. O frontend não envia preço ou total ao criar a venda ou a cobrança Pix.

## Mercado Pago

A integração Pix está em desenvolvimento.

Decisão atual: não usar Store/POS do Mercado Pago. A implementação iniciada usa integração direta pela Payments API.

Fluxo desejado:

```text
createSale
-> createPixPayment
-> Mercado Pago
-> QR Pix
-> mercadoPagoWebhook
-> confirmar pagamento
-> PAID
-> baixar estoque
-> stockMovement SALE
```

Responsabilidades definidas:

- `createPixPayment` não deve marcar a venda como `PAID` nem baixar estoque;
- `mercadoPagoWebhook` deve confirmar o pagamento consultando o Mercado Pago;
- somente após confirmação válida o webhook deve marcar `PAID`, baixar estoque e criar movimentação `SALE`.

### Estado atual da integração Pix

Correção implementada e publicada em DEV em 03/09/2026, com autorização do usuário. Deploy limitado a createPixPayment e mercadoPagoWebhook, Node.js 22 / 2nd Gen / southamerica-east1. Firebase CLI confirmou sucesso nas duas atualizações. Não houve commit nem publicação do Hosting. Homologação de pagamento ainda pendente.

URL confirmada pelo deploy: https://mercadopagowebhook-oddoieafaa-rj.a.run.app

- criação e consulta usam exclusivamente /v1/payments; webhook aceita eventos payment;
- uma tentativa imutável por venda, registrada em transação antes da chamada externa; chave, e-mail e valor são reutilizados em chamadas simultâneas e retries;
- mercadoPagoPaymentId vincula cobrança e venda; metadata da tentativa permite vincular um webhook que chegue antes da resposta de criação;
- cobrança existente reutiliza QR completo, incluindo base64; persistência perdida pode ser recuperada com a mesma chave ou consulta do pagamento já vinculado;
- tentativas antigas sem payload persistido são bloqueadas para revisão, sem criar outra cobrança;
- status externo fica em mercadoPagoPaymentStatus; a criação nunca marca aprovação local;
- webhook verifica assinatura HMAC, consulta o pagamento e confere ID, referência, valor, moeda BRL e método Pix;
- somente aprovação confirmada e dentro do prazo libera PAID, baixa estoque e registra SALE em uma transação; notificações repetidas não repetem a baixa;
- comportamento anterior de estoque insuficiente preservado: saldo pode ficar negativo após pagamento, com stockReconciliationRequired;
- frontend recebe expiresAtMs, usa o prazo real, esconde QR/código/link ao expirar e reaproveita o e-mail informado;
- 14 testes locais com Firestore e HTTP simulados em functions/tests/pix.test.cjs; comando: npm --prefix functions run test:pix.

Pendências:

- usuário confirmou credenciais de teste, configuração de Webhooks no modo de teste para eventos de pagamento e nova versão de MP_WEBHOOK_SECRET; falta validar assinatura real e correspondência da configuração durante a homologação;
- homologar QR e transações no Firebase com as duas Functions corrigidas já publicadas em DEV;
- implementar acompanhamento seguro da confirmação na interface; ainda não há tela automática de sucesso;
- definir operação administrativa para PAYMENT_REVIEW_REQUIRED, incluindo eventual reembolso; não existe reembolso automático;
- cancelamento da sessão no navegador ainda não cancela a cobrança no provedor.

Roteiro de validação: docs/PIX_VALIDATION.md.

## Expiração

createSale mantém expiresAt de 15 minutos. A criação Pix não sobrescreve esse campo, bloqueia venda vencida e limita o prazo de vendas legadas a createdAt + 15 minutos.

A validade externa do QR é separada da validade interna. A Payments API documenta mínimo de 30 minutos para date_of_expiration e padrão de 24 horas quando omitido. O cliente continua omitindo esse campo; o prazo retornado pelo provedor é registrado separadamente em mercadoPagoExpiresAt. Esconder o QR após 15 minutos não cancela um código já copiado.

O webhook compara date_approved com o prazo interno, não com o horário de chegada da notificação. Aprovação tardia ou sem data válida registra PAYMENT_REVIEW_REQUIRED e paymentReconciliationRequired, sem baixar estoque nem marcar a venda como PAID. Um pagamento aprovado no prazo pode ser processado mesmo com webhook atrasado.

Fonte: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix

## Git

Antes de mudanças relevantes:

- verificar `git status`;
- fazer mudanças pequenas;
- rodar build e lint;
- somente depois considerar commit.

Nunca fazer commit ou deploy automaticamente, salvo se explicitamente solicitado.

O repositório está atualmente na branch `review-codex` e já possui alterações não commitadas relacionadas ao fluxo Pix. Elas devem ser preservadas e analisadas antes de qualquer edição futura.

## Regras de trabalho para agentes

1. Antes de alterar, analisar o código existente.
2. Não reconstruir módulos que já funcionam.
3. Fazer mudanças pequenas.
4. Não alterar `.env.local`.
5. Nunca revelar secrets.
6. Não implementar funcionalidades além das solicitadas.
7. Sempre rodar build após alterações relevantes.
8. Rodar lint.
9. Não fazer deploy automaticamente.
10. Não fazer commit automaticamente.
11. Explicar os arquivos modificados.
12. Preservar a arquitetura existente.
13. Não confiar no frontend para preços ou confirmação de pagamentos.

## Estado atual / Próximo passo

Homologação em 03/09/2026: gerar Pix retornou HTTP 500. Logs da revisão createpixpayment-00003-qif confirmaram entrada na Callable e apenas a mensagem genérica de falha, sem causa identificável. Foi preparado localmente diagnóstico seguro da etapa, status HTTP e códigos numéricos do provedor, sem mensagens brutas, tokens ou dados pessoais. Builds/lints passaram e a suíte tem agora 16 testes aprovados, incluindo proteção dos logs. Essa instrumentação ainda não foi publicada; requer autorização de novo deploy de createPixPayment antes de repetir o teste. Não atribuir a falha às credenciais sem evidência.

O cadastro administrativo, o estoque, o self-checkout, a consulta por código de barras e a criação de vendas pendentes estão implementados. Vendas, relatórios e configurações administrativas continuam provisórios.

O contrato Payments API, a idempotência e a expiração interna foram corrigidos localmente. Builds e lints passaram, mantendo apenas os avisos anteriores do frontend; os 14 testes Pix simulados passaram. Isso não comprova o funcionamento remoto.

Deploy autorizado das duas Functions Pix concluído em 03/09/2026. Próximo passo: usar o frontend local atualizado para gerar o QR de uma venda nova e homologar o fluxo com credenciais de teste. Depois implementar acompanhamento da confirmação na tela e operação das vendas que exigem revisão.

## Atualização de estoque — 07/09/2026

Deploy autorizado e concluído: somente manageInventory, no seolleda-dev, Node.js 22 / 2nd Gen / southamerica-east1. Firebase CLI confirmou Successful create operation e Deploy complete. Hosting, regras e funções Pix não foram publicados nesta operação.

O frontend local de estoque agora usa essa Callable para movimentações e estoque mínimo. Ela grava saldo e histórico em transação, valida dados e usa a identidade autenticada. Cinco testes simulados de estoque e 17 testes Pix passaram; builds e lints sem erros. Homologação manual pendente, conforme docs/INVENTORY_VALIDATION.md. A observação anterior sobre escritas diretas bloqueadas foi resolvida no código local, mas o frontend do Hosting não foi atualizado neste deploy.

## Homologação e identificação de versão — 07/09/2026

Usuário confirmou teste do estoque concluído com sucesso. Próxima etapa funcional: gestão de Vendas.

Adicionado indicador fixo no canto inferior esquerdo em todas as telas, lendo a versão de package.json (atualmente 0.0.0). Alteração local em App.tsx e App.css, build e lint sem erros (avisos anteriores preservados), sem deploy do Hosting.

## Processo de versões — 07/09/2026

Por solicitação do usuário, seguir fases como no Santa Fé. A versão funcional agora vem de src/lib/appVersion.ts e começa em 1A; substitui a identificação anterior baseada em package.json. Regras permanentes em AGENTS.md, ciclo em docs/RELEASES.md e histórico em docs/CHANGELOG.md. A fase 1A está em consolidação, sem release Git ou Hosting publicada; estoque já homologado. Fechar 1A antes de iniciar 1B (Vendas), salvo nova orientação. Nenhum commit, tag ou deploy realizado nesta estruturação.

## Publicação 1A — 07/09/2026

Usuário autorizou publicação. Código 9d5a33af90ca7a92a2464b94173b0b67c9ed39e8, repositório https://github.com/xtrbelo/seolleda-dev. Hosting e cinco Functions (createSale, createPixPayment, getSalePaymentStatus, mercadoPagoWebhook, manageInventory) publicados com sucesso no seolleda-dev. Firebase confirmou Deploy complete. Site https://seolleda-dev.web.app respondeu HTTP 200 e entregou HTML idêntico ao build; bundle acessível com versão 1A. Sem alteração de regras. Validação final: 22 testes, builds/lints sem erros, diff-check aprovado. Estoque homologado previamente; teste funcional pós-publicação pendente. Documentação pós-deploy compõe o fechamento release-1a. Próxima fase: 1B, gestão de Vendas. Este registro substitui as pendências históricas de publicação 1A acima.
