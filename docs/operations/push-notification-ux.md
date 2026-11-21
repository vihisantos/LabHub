# Web Push — identidade por módulo e lembretes insistentes

## Identificação da notificação

O texto **“from LabHub”** (ou equivalente) exibido pelo iOS em notificações de
PWAs é adicionado pelo sistema operacional, com base na instalação do app.
Não é parte do `title` nem do `body` enviado pelo LabHub, e não pode ser
removido via Service Worker/Web Push. Não modificar o `manifest.name` ou o
`manifest.id` só para tentar ocultá-lo: isso afetaria a instalação do PWA.

O Service Worker (`src/sw.ts`) identifica os módulos pela propriedade
`module` enviada pelo backend, com fallback para URL/título legado:

- 🚨 Chamados
- 📅 ReservaLab
- 📦 Estoque
- 🖥️ PC Care
- 🔐 Acesso

A identificação aparece **no título**; o logotipo do PWA continua sendo
o ícone padrão. Cada evento pode transportar um `tag` específico, preservado
para deduplicação visual daquele evento. Se não há tag, não se aplica uma
tag global: notificações de módulos/eventos diferentes não se substituem.

## Insistência dos lembretes de Chamados

O Workflow QStash faz até **10 checagens duráveis**, separadas por
`REMINDER_INTERVAL_SECONDS=120` (2 minutos), concordando com o limite
persistente `REMINDER_MAX_COUNT=10`. Se o técnico assumir o chamado, o
status deixar de ser `aberto` ou o ciclo mudar, o Workflow encerra. Após
a décima checagem, para automaticamente. Não é um loop infinito.

A linguagem evolui por onda: inicial → atenção → urgente → crítico. Cada
lembrete usa tag própria por chamado+ciclo+onda, para o iOS não substituir
visualmente as ondas anteriores. A Vibração do Service Worker é apenas
solicitação ao navegador: o iOS/Focus/ajustes do dispositivo controlam
sons, banners, agrupamento e vibração. O servidor só confirma aceite (2xx)
do provedor, nunca a exibição efetiva no dispositivo.

## Custo, limites e teste

O número de steps QStash cresce com o número de chamados elegíveis; monitorar
uso Free e respostas HTTP no painel Upstash. Uma execução completa de um
chamado consome até dez verificações, além dos sleeps, agendamento inicial e
operações do dispatcher. Não assumir uma correspondência de um step para
uma única mensagem cobrada: medir consumo real.

Campus de QA de Push em Production:
`labhub-teste-notificacoes`. Não utilizar outras unidades para teste. O
campus permite somente uma membership ativa de teste; a regra absoluta de
super admin do LabHub continua valendo. Ao testar, isolar mensagens por
`workspace_id` e `target_user_id`. Encerrar ou assumir chamados de teste
antes de eventual ativação em escala, se houver risco de cota.

Para diagnóstico, conferir outbox, `push_dedup_marks` e logs do QStash.
`accepted` apenas significa aceite do provedor — confirmação de exibição
deve vir do usuário no dispositivo.
