# Versões e publicação do Seolleda

## Convenção

Usamos a versão funcional por fase do Santa Fé: 1A, 1B, 1C. Uma correção da mesma fase usa 1A.1, 1A.2. Uma nova etapa maior poderá iniciar 2A mediante definição do escopo.

A fonte única da versão exibida é src/lib/appVersion.ts. A versão técnica 0.0.0 do package.json não identifica a entrega funcional. Nunca alterar a versão apenas no texto da tela.

## Sequência acordada

| Versão | Escopo | Situação |
| --- | --- | --- |
| 1A | Base existente: cadastros, checkout, Pix, estoque administrativo e indicador de versão | Publicada em seolleda-dev em 07/09/2026; estoque homologado |
| 1B | Gestão de vendas: consulta, filtros, detalhes e identificação de pendências | Homologada e publicada em HML; deploy confirmado pelo usuário |
| 1C | Relatórios e dashboard com dados reais | Homologada e publicada em HML; deploy confirmado pelo usuário |
| 1D | Configurações de loja e terminais | Homologada e publicada em HML; deploy confirmado pelo usuário |
| 1E | Preferências de exibição dos alertas de estoque | Publicada em HML; deploy do Hosting confirmado |
| 1F | Segurança administrativa por papéis | Homologada e publicada em HML; regras, Functions e Hosting confirmados |
| 1G | Reserva transacional de estoque | Homologada e publicada em HML; Functions, Scheduler e Hosting confirmados |
| 1H | Proteção de dados de vendas | Homologada e publicada em HML; Function, regras e Hosting confirmados |
| 1I | Operação de pagamentos em revisão | Homologada e publicada em HML; Hosting confirmado |
| 1J | Auditoria operacional | Homologada e publicada em HML; Function e Hosting confirmados |
| 1K | Unicidade de SKU e código de barras no backend | Homologada e publicada em HML; Function, regras e Hosting confirmados |
| 1L | Escopo administrativo por loja | Publicada em HML; preparação para expansão futura; operação atual mantém uma loja |
| 1M | Relatórios processados no backend | Publicada em HML; homologação pendente |
| 1N | Testes automatizados de regras e fluxo | Homologada e publicada em HML; Hosting e suíte automatizada confirmados |
| 1O | Pagamento por cartão online | Homologada e publicada em HML; Functions, webhook e Hosting confirmados |
| 1P | Confiabilidade de reservas e paginação | Homologada e publicada em HML; Functions, índice do Firestore e Hosting confirmados |
| 1Q | Operações de pagamentos em revisão, cancelamento e reembolso | Homologada e publicada em HML; Functions e Hosting confirmados |
| 1R | Devoluções e resolução de pendências de estoque | Homologada e publicada em HML; Functions e Hosting confirmados |
| 1S | Conciliação de reservas de estoque inconsistentes | Homologada e publicada em HML; commit `c44f283` e tag `release-1s` confirmados |
| 1S.1 | Contenção de custos Firebase | Homologada e publicada em HML; commit `d7ee849` e tag `release-1s.1` confirmados |
| 1T | Reembolsos e devoluções parciais | Homologada e publicada em HML; commit `56c9b8c` e tag `release-1t` confirmados |
| 1U | Fechamento financeiro e exportação de relatórios | Homologada e publicada em HML; commit `e19c243` e tag `release-1u` confirmados |
| 1V | Gestão administrativa de usuários e permissões | Homologada e publicada em HML; commit `e23ea16` e tag `release-1v` confirmados |
| 1V.1 | Saneamento técnico dos avisos do frontend | Homologada e publicada em HML; commit `1a2db9d` e tag `release-1v.1` confirmados |
| 1W | Expansão administrativa para múltiplas lojas | Homologada e publicada em HML; commit `db1a21c` e tag `release-1w` confirmados |
| 1W.1 | Cartão de crédito exclusivamente à vista | Homologada e publicada em HML; commit `d65f3d5`, merge `aad97a1` e tag `release-1w.1` confirmados |

Não tratar fases planejadas como implementadas. A identificação 1A foi adotada e publicada em 07/09/2026. Histórico em docs/CHANGELOG.md.

## Tags históricas a partir da 1E

Tags anotadas criadas e enviadas ao GitHub em 08/09/2026, após autorização explícita do usuário. Push atômico das oito tags concluído com sucesso.

| Tag | Commit | Observação |
| --- | --- | --- |
| release-1e | 14468f7 | Inclui registro da publicação em HML; código da entrega c835075 |
| release-1f | 4fd26fd | Inclui registro da homologação; código da entrega bb2f0a2 |
| release-1g | 91eecb6 | Inclui registro da homologação; código da entrega a89a43e |
| release-1h | c0dd318 | Inclui registro da homologação; código da entrega a44991b |
| release-1i | 3ff0cce | Triagem operacional de pagamentos |
| release-1j | 21be469 | Auditoria operacional |
| release-1k | 3d0b901 | Unicidade de produtos |
| release-1n | 9fb6e72 | Commit acumulado das fases 1L, 1M e 1N |

Não foram criadas tags separadas para 1L e 1M: o histórico não contém commits com essas versões isoladas. A tag 1N identifica o conjunto acumulado, sem alterar os registros de homologação de cada fase. As tags anteriores foram preservadas.

O usuário autorizou o commit da integração de cartão na `main`, seu envio e a criação/envio da tag anotada `release-1o`. Essa tag identifica o commit de fechamento da 1O, incluindo código e documentação. O cache gerado do Hosting e as credenciais locais não integram o commit.

## Ciclo de cada versão

1. Definir escopo, critérios de aceite e versão; criar branch codex/fase-<versão em minúsculas> quando apropriado. A branch review-codex atual será preservada até revisão das alterações existentes.
2. Atualizar appVersion.ts e abrir entrada no changelog como em desenvolvimento.
3. Implementar apenas a fase atual; executar verificações focadas.
4. Homologar com o usuário. Se precisar publicar backend em DEV para homologação, registrar como publicação parcial, com autorização e alvos específicos.
5. Fechar com lint e build do frontend e backend, testes de estoque/Pix e demais suítes existentes, revisão de diff e git diff --check. Registrar avisos conhecidos e corrigir erros.
6. Apresentar arquivos e resultado; com autorização, criar commit e enviar branch. Com autorização compatível, integrar à main e criar tag anotada release-1a (ou release-1a.1). A tag identifica o commit, não comprova deploy.
7. Preparar o build do commit aprovado, apresentar ambiente e alvos exatos; publicar após autorização. Não publicar alterações locais fora da versão revisada.
8. Registrar commit, tag, data, projeto Firebase, alvos, resultado e homologação pós-deploy. Só declarar a versão publicada quando todos os alvos previstos tiverem sucesso; falhas ou deploys parciais ficam explícitos.

seolleda-dev é o ambiente de HOMOLOGAÇÃO (HML). Produção ainda não existe e será criada posteriormente em projeto Firebase separado. Todas as publicações anteriores mencionadas como DEV são publicações em HML. O modo production do build Vite não significa ambiente de produção. Não reutilizar projetos, tags ou comandos de deploy do Santa Fé.

## Validação atual

```text
npm run lint
npm run build
npm --prefix functions run lint
npm --prefix functions run build
node --test functions/tests/*.test.cjs
git diff --check
```

Testes simulados não substituem homologação remota. Não refazer testes sem motivo depois de aprovados, salvo mudança posterior ou checkpoint de publicação.
