# Reembolsos e devoluções parciais

## Fluxo financeiro

1. Um administrador abre uma venda paga e seleciona os produtos e as quantidades.
2. O backend valida a venda, desconta quantidades já incluídas em operações anteriores e calcula o valor pelos preços originais persistidos.
3. A operação é gravada antes do envio ao Mercado Pago. A mesma identificação é usada como chave de idempotência no provedor.
4. A confirmação compara `transaction_amount_refunded` com o valor acumulado esperado. Diferenças colocam o pagamento em revisão e impedem novas operações.
5. Enquanto ainda houver valor líquido, a venda permanece paga e aparece como **Estorno parcial**. Quando o acumulado alcança o total, a venda passa a **Estornada**.

Somente uma solicitação financeira pode permanecer aguardando confirmação por venda. São aceitas até 20 operações e 200 linhas acumuladas de itens por venda.

O endpoint utilizado é `POST /v1/payments/{id}/refunds`. O corpo contém `amount` para reembolso parcial, conforme a [referência oficial do Mercado Pago](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/create-refund/post).

## Fluxo físico

Cada reembolso confirmado abre uma conferência própria. O administrador informa quantas unidades voltaram em condição de venda; quantidade zero encerra o item sem reposição. Estoque, movimentações, operação e venda são atualizados na mesma transação.

Uma repetição com os mesmos dados devolve o resultado persistido. Outra decisão para uma operação já encerrada é recusada. A movimentação usa uma identificação composta pela venda, pelo reembolso e pelo produto, impedindo reposição duplicada.

## Relatórios

Receita, ticket médio, unidades e totais por produto descontam somente reembolsos parciais confirmados. A devolução física não altera o valor financeiro do relatório.

## Custo Firebase

A fase reutiliza `managePayment`, `mercadoPagoWebhook`, `resolveSaleStock`, `listAdminSales` e `getAdminReport`. Nenhuma nova Function, tarefa agendada, coleção consultada em lote ou instância mínima é adicionada.

## Homologação em HML

O projeto `seolleda-dev` usa credenciais reais do Mercado Pago por decisão do usuário. A homologação financeira deve usar uma venda controlada:

1. Reembolsar uma parte das unidades e conferir o valor no Mercado Pago.
2. Repetir a consulta e confirmar que o valor não é reembolsado novamente.
3. Registrar parte das unidades com reposição e parte sem reposição.
4. Conferir o histórico de estoque e os valores líquidos do relatório.
5. Fazer outra operação parcial sobre o saldo restante e confirmar que quantidades anteriores não ficam disponíveis.
