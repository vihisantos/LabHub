# Atualização do LabHub TV por GitHub Releases

O atualizador nativo consulta a release estável mais recente do repositório público, sem servidor intermediário. O download é preparado em segundo plano; a instalação é solicitada ao terminar a sequência de reprodução. A checagem ocorre no início do player e a cada 30 minutos. Builds sem chave pública compilada não atualizam automaticamente.

## Primeira configuração (uma vez)

1. No computador do proprietário, execute `npx tauri signer generate -w ~/.tauri/labhub-tv.key`. Guarde a chave privada e a senha com backup seguro. Não compartilhe nem faça commit.
2. Em Settings → Secrets and variables → Actions, configure a variável `LABHUB_TV_UPDATER_PUBLIC_KEY` com o conteúdo da chave pública e os secrets `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` com a chave privada e a senha.
3. Aumente a versão em `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml` (ex.: 2.4.1), mantendo o lockfile consistente.
4. Após merge e CI verde, execute manualmente o workflow **LabHub TV signed updater package (manual)** na main.
5. Baixe o artefato `labhub-tv-signed-release`. Instale o primeiro build com atualizador manualmente nas TVs, porque a versão 2.4.0 existente não tem esse mecanismo.

## Próximas versões

Crie uma GitHub Release estável com tag exata `tv-v<VERSÃO>`, anexe o instalador, sua assinatura e `latest.json` do artefato gerado. Publique e marque como latest somente depois de testar. Não use release Electron, prerelease ou instalador sem assinatura como latest. O workflow não publica nada automaticamente.

O pacote verifica a assinatura nativa do Tauri. Não altere a chave a cada release. A atualização não deve solicitar limpeza dos dados; se a ativação local ficar inválida, o fluxo normal do USB continua sendo exigido. Não há remoção proposital da credencial.

## Homologação obrigatória

- Regenerar Cargo.lock para a dependência opcional e executar CI com signed-updater.
- Testar instalação física Windows, sem elevação, preservação de pasta, programação, ativação e autostart; validar reinício após instalação.
- Testar release inexistente, rede indisponível, assinatura inválida, versão antiga e atualização no limite da sequência.
- Testar duas versões assinadas de verdade antes de publicar latest.
