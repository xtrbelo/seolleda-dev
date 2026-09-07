# Histórico de versões

## 1B — Vendas — Homologada; publicação pendente

- Consulta por período de criação (horário local), em páginas de 100 vendas.
- Busca por venda, terminal ou pagamento e filtro de situação sobre os registros carregados.
- Detalhes dos itens, valores e datas, com alertas de revisão de pagamento e estoque.
- Prazo encerrado é uma indicação local; não representa cancelamento no provedor.
- Consulta administrativa somente leitura; regras e backend preservados.
- Usuário confirmou execução das validações e testes funcionais com sucesso. Fechamento e publicação pendentes.
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

- 1B: gestão de Vendas.
- 1C: relatórios e dashboard.
- 1D: cartão, após definição da integração.
