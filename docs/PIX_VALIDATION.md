# Validação da correção Pix

## Situação

Em 03/09/2026, deploy autorizado de createPixPayment e mercadoPagoWebhook
concluído com sucesso no seolleda-dev. Nenhum commit, publicação do Hosting ou
cobrança real foi feito. Builds, lints e os 14 testes Pix passaram antes do deploy.
Functions v2, Node.js 22, região southamerica-east1 preservados.
O frontend local chama as Functions publicadas; iniciar Vite não publica nem
substitui o backend remoto. Não testar pagamento real antes da preparação abaixo.

## Teste local sem contas externas

No terminal, dentro de D:\Projetos\Seolleda:

```powershell
npm.cmd --prefix functions run test:pix
```

Os 14 testes executam os handlers compilados com HTTP falso e um adaptador de
transações em memória. Cobrem concorrência, retries, expiração, assinatura,
valores divergentes, aprovação duplicada, ordem dos eventos e falha de persistência.
Não substituem teste das transações no emulador/Firestore nem assinatura real.

## Preparação remota — próxima etapa, com autorização de publicação

1. Confirmar projeto seolleda-dev e terminal ativo vinculado à loja correta.
2. Verificar apenas nomes, versões habilitadas e acesso das Functions aos secrets
   MERCADO_PAGO_ACCESS_TOKEN e MP_WEBHOOK_SECRET. Nunca copiar valores para o chat.
3. Conferir no Mercado Pago a aplicação/conta e configuração de Webhooks para
   eventos payment, usando a URL efetiva da Function mercadoPagoWebhook.
   O código depende dessa configuração; não envia notification_url por cobrança.
4. Publicar Functions corrigidas somente quando autorizado. Usar também o
   frontend atualizado, pois a resposta Pix agora inclui expiresAtMs.
5. Preparar um produto e estoque de teste. As escritas administrativas de estoque
   continuam bloqueadas pelas regras; isso não foi alterado nesta correção.

## Roteiro de homologação

1. Iniciar uma venda nova, com produto e quantidade conhecidos. Anotar saleId,
   totalCents, estoque inicial e expiresAt, sem divulgar dados pessoais.
2. Gerar Pix: conferir QR, Copia e Cola, total e prazo restante de até 15 minutos
   desde a criação da venda. Estoque deve permanecer igual, venda PENDING_PAYMENT.
3. Voltar apenas para Outras formas de pagamento e selecionar Pix novamente,
   mantendo a mesma venda. Gerar novamente deve recuperar o mesmo paymentId e QR,
   sem reiniciar o prazo. Voltar ao carrinho e finalizar cria outra venda no fluxo
   atual; não usar isso como teste de repetição da mesma cobrança.
4. Após um pagamento de teste autorizado e aprovado no prazo, conferir no
   Firestore: PAID, paymentStatus APPROVED, paidAt, baixa correta e uma movimentação
   SALE por produto. A tela ainda não acompanha a confirmação automaticamente.
5. Reenviar a mesma notificação válida pelo provedor: estoque e movimentos devem
   permanecer iguais. Não simular aprovação editando a venda pelo navegador.
6. Em outra venda não paga, esperar o prazo: QR, código e link devem desaparecer.
   Outra chamada para a mesma venda deve recusar por expiração.

## Limites e decisões preservadas

- Expiração interna não cancela a cobrança externa. O provedor exige pelo menos
  30 minutos para expiração customizada e usa 24 horas quando omitida, como no
  cliente atual. Um QR já copiado pode ser pago depois dos 15 minutos.
- Aprovação após o prazo ou sem date_approved válido exige revisão:
  PAYMENT_REVIEW_REQUIRED, paymentReconciliationRequired, sem PAID/baixa de estoque.
  Não existe reembolso automático nem tela administrativa dessa revisão.
- Webhook atrasado usa a data real da aprovação, para aceitar pagamento no prazo.
- Tentativas legadas sem e-mail/valor imutáveis persistidos exigem revisão.
- Saldo insuficiente no momento da aprovação mantém o comportamento existente:
  saldo negativo sinalizado por stockReconciliationRequired. Reserva de estoque
  e tratamento operacional dessa situação não foram implementados aqui.
- Não há acompanhamento público do status, cancelamento externo automático,
  estornos automáticos ou mudança nas permissões administrativas nesta entrega.

## Arquivos desta correção

- functions/src/payments/createPixPayment.ts: tentativa atômica, retries e QR.
- functions/src/payments/mercadoPagoClient.ts: criação/consulta pela Payments API.
- functions/src/payments/mercadoPagoWebhook.ts: confirmação e baixa idempotente.
- functions/src/payments/pixPolicy.ts: prazo interno compartilhado.
- functions/src/types/sale.ts e src/services/paymentService.ts: contrato do Pix.
- src/components/checkout/PixPayment.tsx e src/pages/CheckoutPage.tsx: prazo real,
  limpeza do contador, bloqueio ao expirar e reaproveitamento do e-mail.
- functions/tests/pix.test.cjs e functions/package.json: testes locais.
- PROJECT_CONTEXT.md e este roteiro: estado atualizado e homologação pendente.

## Referências

- [Pix via Payments API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix)
- [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications)
