# Cartão de crédito — fase 1O

O checkout usa o Card Payment Brick do Mercado Pago. O navegador coleta os
dados do cartão e envia ao backend somente o token temporário, a bandeira, o
emissor, as parcelas e o e-mail do pagador. O backend usa o total calculado
na criação da venda e cria o pagamento com a chave privada guardada no Secret
Manager.

## Configuração HML

- `MERCADO_PAGO_ACCESS_TOKEN`: segredo já usado pelo Pix e pelo webhook.
- `MP_WEBHOOK_SECRET`: segredo usado para validar a assinatura do webhook.
- `VITE_MERCADO_PAGO_PUBLIC_KEY`: chave pública da mesma aplicação e ambiente
  do Access Token, incorporada ao frontend durante o build.

A chave pública não substitui o Access Token e não deve ser usada no backend.
Por decisão explícita do usuário, o projeto Firebase `seolleda-dev` permanece
HML utilizando credenciais de produção do Mercado Pago. As cobranças são reais.
O usuário confirmou uma venda de cartão aprovada com essa configuração.
Os valores das credenciais não fazem parte do repositório.

## Fluxo protegido

1. `createSale` reserva o estoque e calcula o total.
2. O Card Payment Brick tokeniza o cartão no navegador.
3. `createCardPayment` valida a venda, ignora qualquer total enviado pelo
   navegador e cria a cobrança com uma chave de idempotência por venda.
4. `mercadoPagoWebhook` confirma o pagamento, aplica o prazo da venda e baixa
   a reserva e o estoque em uma transação.
5. Pagamentos pendentes, recusados ou fora do prazo permanecem sem baixa e
   podem ir para revisão, como no Pix.

Referência oficial: [Card Payment Brick — envio do pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/payment-submission).
