# Seolleda — regras permanentes

## Trabalho por versão

- Ler docs/RELEASES.md e a entrada atual de docs/CHANGELOG.md antes de iniciar uma fase ou fechar uma versão.
- Trabalhar em uma fase por vez, com escopo definido. Não iniciar a fase seguinte antes de concluir o fechamento da atual ou receber orientação explícita do usuário.
- Versão funcional centralizada em src/lib/appVersion.ts, no padrão 1A, 1B e hotfix 1A.1, seguindo o modelo de fases do Santa Fé. Não usar package.json como versão funcional.
- Atualizar versão visível e changelog juntos ao iniciar uma nova fase; informar que a versão está em desenvolvimento até a publicação confirmada.
- Para novas branches, usar codex/fase-1b ou codex/hotfix-1a.1. Preservar a branch e alterações existentes durante a transição inicial.
- Fazer testes focados durante o trabalho; no fechamento, validar frontend e backend, testes existentes e diff. Não encerrar com erros.
- Registrar homologação do usuário, commit, tag, ambiente, alvos publicados e resultado real. Nunca declarar publicação pelo número exibido ou apenas pelo build.
- Revisar o diff e selecionar arquivos explicitamente. Não atribuir todas as alterações existentes à fase atual sem revisão.
- Commit/push, merge/tag e deploy exigem autorização explícita compatível com a ação. Respeitar autorizações já dadas; não pedir novamente a mesma autorização.
- Antes da autorização de publicação, apresentar versão, escopo, validações, ambiente e alvos concretos. Publicar só os alvos autorizados.
- Nunca usar push forçado, descartar trabalho do usuário, expor segredos ou alterar .env.local.
- Preservar regras de segurança, arquitetura e confirmação de pagamento no backend.

## Estado inicial

Base funcional identificada como 1A; fechamento Git e publicação completa ainda pendentes. Estoque homologado pelo usuário. Próxima fase planejada: 1B — Vendas. Detalhes em docs/RELEASES.md.
