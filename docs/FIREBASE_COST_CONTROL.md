# Controle de custos do Firebase

## Objetivo

Manter o uso esperado dentro das franquias gratuitas do plano Blaze. O Blaze não oferece um teto rígido de cobrança: alertas avisam sobre gastos, mas não interrompem automaticamente os serviços.

## Proteções da aplicação

- Todas as Functions usam 256 MiB, CPU fracionária `gcf_gen1`, `minInstances: 0`, `maxInstances: 3` e concorrência 1.
- As consultas de pagamento começam a cada 3 segundos, passam para 10 segundos após um minuto e para 30 segundos após cinco minutos. Em aba oculta, o intervalo é sempre 30 segundos.
- Relatórios aceitam no máximo mil vendas por execução.
- As Functions callable exigem Firebase App Check. O webhook do Mercado Pago continua público e valida a assinatura do provedor.
- O Artifact Registry mantém a política automática de excluir artefatos com mais de um dia.

## Ativação obrigatória do App Check antes do deploy

Configuração concluída pelo usuário em 08/09/2026 no projeto `seolleda-dev` (HML). A chave pública também foi confirmada como presente e não vazia no `.env.local`, sem exposição do valor.

1. Criar uma chave reCAPTCHA Enterprise baseada em pontuação para `seolleda-dev.web.app`.
2. Registrar o aplicativo Web na seção App Check do projeto `seolleda-dev` e usar essa chave.
3. Configurar uma validade longa para o token em HML, reduzindo avaliações do reCAPTCHA.
4. Adicionar somente a chave pública em `VITE_FIREBASE_APPCHECK_SITE_KEY` no `.env.local`; esse arquivo não entra no Git.
5. Gerar o build e publicar todas as Functions callable junto com o Hosting. Não publicar somente o backend, pois clientes sem App Check serão recusados.

O reCAPTCHA oferece até 10 mil avaliações mensais gratuitas. Como `seolleda-dev` usa faturamento, avaliações acima dessa franquia podem ser cobradas; validade longa do token e acompanhamento mensal continuam necessários.

## Segredos

As Functions publicadas usam somente estas versões:

- `MERCADO_PAGO_ACCESS_TOKEN`: versão 7.
- `MP_WEBHOOK_SECRET`: versão 2.

Em 08/09/2026, após autorização explícita do usuário, foram destruídas permanentemente as versões antigas 4, 5 e 6 de `MERCADO_PAGO_ACCESS_TOKEN`, a versão 1 de `MP_WEBHOOK_SECRET` e as versões 1, 2 e 3 do segredo legado `MP_ACCESS_TOKEN`. A conferência final confirmou somente duas versões ativas: `MERCADO_PAGO_ACCESS_TOKEN` versão 7 e `MP_WEBHOOK_SECRET` versão 2.

## Verificação mensal

- Conferir custos reais e previsões no Cloud Billing.
- Conferir invocações e tempo de execução das Functions.
- Conferir leituras, escritas, armazenamento e tráfego do Firestore.
- Conferir armazenamento e tráfego do Hosting.
- Manter no máximo três tarefas do Cloud Scheduler por conta de faturamento.
- Manter até seis versões ativas no Secret Manager por conta de faturamento.
- Manter o Artifact Registry abaixo de 0,5 GiB por conta de faturamento.

Fontes oficiais: [Firebase Pricing](https://firebase.google.com/pricing), [Cloud Functions quotas](https://firebase.google.com/docs/functions/quotas), [Firestore pricing](https://firebase.google.com/docs/firestore/pricing), [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing), [Hosting usage and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing) e [App Check for Cloud Functions](https://firebase.google.com/docs/app-check/cloud-functions).
