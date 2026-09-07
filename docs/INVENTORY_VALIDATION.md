# Validação do estoque administrativo

Implementação local de 07/09/2026: entradas, saídas, ajustes e estoque mínimo usam a Callable manageInventory, autenticada, em southamerica-east1. As regras continuam bloqueando escritas diretas. A identidade do responsável e os dados do produto são obtidos pelo backend. O modelo de acesso mantém o padrão atual do projeto: usuário autenticado; não há novos papéis administrativos.

Builds frontend/backend e lints passaram (frontend mantém quatro avisos existentes). Cinco testes simulados de estoque e 17 testes Pix passaram. Os testes simulados não substituem homologação no Firestore.

## Homologação com frontend local atualizado

1. Entrar no painel e abrir Estoque. Usar produto de teste e anotar o saldo inicial.
2. Registrar entrada de duas unidades com motivo; conferir saldo e histórico.
3. Registrar saída de uma unidade; conferir saldo e responsável no histórico.
4. Tentar saída maior que o saldo: deve recusar e preservar saldo/histórico.
5. Ajustar a contagem para o saldo inicial e conferir a movimentação.
6. Alterar estoque mínimo e recarregar: deve persistir sem alterar o saldo.

Publicar apenas a Function não atualiza o frontend do Hosting. Usar o frontend local que contém a correção.

Deploy confirmado em 07/09/2026: manageInventory criada com sucesso no seolleda-dev. Homologação manual pendente.
