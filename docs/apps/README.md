# Aplicações

> Índice das aplicações do LabHub.

Cada aplicação é uma unidade funcional independente da plataforma, com rotas, serviços e tema próprios. Elas podem ser habilitadas ou desabilitadas por workspace (ver [Workspaces](../platform/concepts/workspaces.md)).

| Aplicação | Identificador | O que faz | Documentação |
|-----------|---------------|-----------|--------------|
| **Chamados** | `chamados` | Abertura pública e gestão de chamados técnicos, com SLA, notificações e avaliação do atendimento | [`chamados/`](chamados/README.md) |
| **ReservaLab** | `reservalab` | Reserva de laboratórios e tablets, com dashboard de ocupação e lembretes | [`reservalab/`](reservalab/README.md) |
| **PC Care** | `pc-care` | Inventário, limpeza e manutenção preventiva de computadores | [`pc-care/`](pc-care/README.md) |
| **Estoque** | `stock` | Materiais e suprimentos, movimentações, kits e inventário cíclico | [`stock/`](stock/README.md) |
| **TV** | `tv` | Murais digitais: eventos, playlists de vídeo, música, avisos e galerias | [`tv/`](tv/README.md) |

Recursos que **não** são aplicações e pertencem à plataforma:

- **Dashboard** — métricas e atividade da plataforma
- **Administração** — gestão de usuários, workspaces e configurações do sistema
- **Registro Global de Ativos** — capacidade compartilhada em `core/assets`, consumida pelas aplicações
- **Música** — recurso interno da aplicação TV, não uma aplicação separada

## Adicionar uma nova aplicação

Novas aplicações entram em `docs/apps/<nova-aplicacao>/`, com o próprio `README.md` e subpastas conforme a necessidade. Nenhuma documentação existente precisa ser reorganizada. Veja [Criar uma nova aplicação](../guides/adding-application.md).
