# Pasta local de vídeos da LabHub TV

A TV não chama a Drive API. O Google Drive para computador, conectado à conta dedicada da TV, mantém a pasta sincronizada; a LabHub TV valida a leitura dos arquivos e copia a mídia para o armazenamento local do aplicativo para reprodução.

## Configuração por máquina

1. Instale o Google Drive para computador pelo [site oficial](https://www.google.com/drive/download/), abra-o e entre com a conta dedicada da TV.
2. Adicione a pasta compartilhada **LabHub TV — Vídeos** ao Meu Drive (como atalho, se necessário) e aguarde os arquivos ficarem disponíveis. Com espelhamento do Meu Drive, os arquivos ficam no disco mesmo sem internet.
3. No primeiro início do LabHub TV, confirme a conta e selecione a pasta no assistente. O app só salva a configuração depois de abrir e ler os arquivos de mídia compatíveis. O caminho é salvo em `%APPDATA%\br.com.labhub.tv\drive-sync.json`:

```json
{
  "sync_folder_path": "C:\\Users\\Public\\Google Drive\\My Drive\\LabHub TV - Vídeos"
}
```

O caminho acima é somente exemplo: use o caminho que o Drive para computador mostrar nessa máquina. O status da TV informa o caminho exato do arquivo de configuração.

## Comportamento

- A TV lista arquivos diretamente na pasta, em ordem alfabética, e reconhece MP4, M4V, MOV, WebM, MKV e AVI.
- Arquivos com nome (ignorando maiúsculas/minúsculas) e tamanho em bytes iguais aparecem uma única vez. O conteúdo é só lido pelo player; nenhum upload, download adicional ou remoção é feito pelo backend da TV.
- Arquivos que ainda foram modificados nos últimos três segundos bloqueiam a sincronização nessa rodada para evitar copiar mídia parcial; tente novamente quando o Drive terminar.
- Quando o Drive para computador sincronizar uma inclusão ou remoção, o player atualiza a lista em até 30 segundos.
- O protocolo de assets do Tauri recebe permissão em execução para cada vídeo listado, sem liberar a pasta inteira.
- Uma sincronização vazia ou com falhas de leitura/cópia não remove o cache anterior. A remoção de mídias que desapareceram da pasta só ocorre depois de uma sincronização completa bem-sucedida.
