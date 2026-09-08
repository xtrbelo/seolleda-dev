# Histórico de versões

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

- 1B: gestão de Vendas.
- 1C: relatórios e dashboard.
- 1D: cartão, após definição da integração.
