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
| 1D | Configurações de loja e terminais | Implementada localmente; validação e homologação pendentes |
| A definir | Pagamento por cartão | Adiada pelo usuário; definir integração antes de implementar |

Não tratar fases planejadas como implementadas. A identificação 1A foi adotada e publicada em 07/09/2026. Histórico em docs/CHANGELOG.md.

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
