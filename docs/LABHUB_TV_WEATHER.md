# LabHub TV — Weather Slide 2.0

## Visão geral

O slide de clima usa:

- **Open-Meteo** (`https://open-meteo.com/en/docs`) para temperatura, sensação
  térmica, mínima/máxima, umidade, vento, `is_day`, `weather_code` e
  `precipitation_probability_max` (exibida como **previsão de chuva**).
- **Meteocons** (`https://github.com/basmilius/meteocons`, MIT) para os ícones
  SVG animados, copiados para `public/meteocons/` com a licença original.
- **Pixabay** (`https://pixabay.com/videos/search/weather/`) para os vídeos de
  fundo, armazenados **somente na pasta sincronizada do Drive**, nunca no
  repositório público.

A pasta do Drive descoberta nesta máquina é:

```text
G:\Meu Drive\LabHub -TV\Clima
```

Estrutura esperada (nomes exatos, extensão `.mp4`):

```text
ensolarado.mp4                    ensolarado-noite.mp4
parcialmente-nublado.mp4          parcialmente-nublado-noite.mp4
nublado.mp4                       nublado-noite.mp4
neblina.mp4                       neblina-noite.mp4
garoa.mp4                         garoa-noite.mp4
chuva.mp4                         chuva-noite.mp4
chuva-forte.mp4                   chuva-forte-noite.mp4
tempestade.mp4                    tempestade-noite.mp4
```

Nesta máquina os 16 arquivos foram baixados do Pixabay para essa pasta (392 MB
no total, todos com cabeçalho MP4 `ftyp` válido) e não foram adicionados ao
GitHub. A sincronização do Google Drive e a reprodução em TV ainda precisam ser
confirmadas na homologação.

A descoberta (`discoverWeatherVideos`) relê `list_synced_files` a cada exibição
do slide, então inclusões, substituições e remoções no Drive passam a valer no
próximo clima sem reiniciar o aplicativo. A pasta `Clima/` é explicitamente
excluída da fila acadêmica e da assinatura da biblioteca — trocar um vídeo do
clima não reinicia a programação dos cursos.

## Duração na programação

- Relógio: **20 s** na programação normal e **45 s** quando todos os vídeos
  acadêmicos estão em cooldown.
- Clima: **30 s** na programação normal e **60 s** na espera por cooldown.
- Fotos das galerias: **15 s** em qualquer caso.
- Se um vídeo voltar a ficar elegível, a espera termina no limite do slide
  atual e a vinheta do curso volta a abrir o conteúdo acadêmico.

## Mapeamento Open-Meteo

| `weather_code` | Condição | Vídeo (dia / noite) |
| --- | --- | --- |
| 0, 1 | Céu claro / poucas nuvens | `ensolarado` / `ensolarado-noite` |
| 2 | Parcialmente nublado | `parcialmente-nublado` / `parcialmente-nublado-noite` |
| 3 | Nublado | `nublado` / `nublado-noite` |
| 45, 48 | Neblina | `neblina` / `neblina-noite` |
| 51, 53, 55 | Garoa | `garoa` / `garoa-noite` |
| 61, 63, 80, 81 | Chuva | `chuva` / `chuva-noite` |
| 65, 82 | Chuva forte | `chuva-forte` / `chuva-forte-noite` |
| 95, 96, 99 | Tempestade | `tempestade` / `tempestade-noite` |
| 71, 73, 75, 77, 85, 86 | Neve/granizo | ícone Meteocons sobre fundo neutro |
| 56, 57, 66, 67 | Precipitação congelante | ícone Meteocons sobre fundo neutro |

`is_day === 0` seleciona sempre a variante `-noite`. Se o arquivo correspondente
não existir ou falhar ao carregar, o slide mantém o fundo neutro animado e o
ícone — sem travar e sem consumir a fase seguinte.

Cache: os dados são gravados em `localStorage.tv_weather_cache`, atualizados a
cada 15 minutos e identificados como **desatualizados** no rodapé quando a
leitura expira. Em offline, o último cache é exibido (mesmo expirado).

## Fontes dos vídeos (Pixabay)

Licença: [Pixabay Content License](https://pixabay.com/service/license/) — uso
gratuito, sem atribuição obrigatória. Os arquivos originais **não** entram no
GitHub; apenas as URLs de origem são registradas aqui.

| Arquivo na pasta `Clima/` | Página de origem |
| --- | --- |
| `ensolarado.mp4` | https://pixabay.com/videos/sky-clouds-blue-clouds-sky-nature-15320/ |
| `parcialmente-nublado.mp4` | https://pixabay.com/videos/clouds-cumulus-sky-fluffy-outdoors-64767/ |
| `nublado.mp4` | https://pixabay.com/videos/cloud-sky-grey-clouds-cloudy-sky-9153/ |
| `neblina.mp4` | https://pixabay.com/videos/fog-mist-forest-autumnal-fall-347075/ |
| `garoa.mp4` | https://pixabay.com/videos/rain-raindrop-wet-water-window-28236/ |
| `chuva.mp4` | https://pixabay.com/videos/rain-road-waterdrop-thunderstorm-10747/ |
| `chuva-forte.mp4` | https://pixabay.com/videos/rain-storm-fall-sheets-nature-109409/ |
| `tempestade.mp4` | https://pixabay.com/videos/lightning-storm-thunderstorm-28067/ |
| `ensolarado-noite.mp4` | https://pixabay.com/videos/moon-clouds-stars-sky-night-space-209264/ |
| `parcialmente-nublado-noite.mp4` | https://pixabay.com/videos/moon-clouds-night-heaven-full-moon-42422/ |
| `nublado-noite.mp4` | https://pixabay.com/videos/moon-clouds-night-dark-4k-218016/ |
| `neblina-noite.mp4` | https://pixabay.com/videos/cabin-tree-scene-fog-storm-night-155160/ |
| `garoa-noite.mp4` | https://pixabay.com/videos/rain-water-window-wet-drops-11722/ |
| `chuva-noite.mp4` | https://pixabay.com/videos/rain-in-city-rain-night-city-storm-125627/ |
| `chuva-forte-noite.mp4` | https://pixabay.com/videos/rain-storm-wave-roof-stormy-night-125753/ |
| `tempestade-noite.mp4` | https://pixabay.com/videos/storm-lightning-night-weather-123347/ |

Critérios adotados: MP4 H.264 (`_large` do Pixabay, 1080p quando disponível),
sem áudio na reprodução (`muted`/`playsInline`), `loop` e fundo neutro como
fallback. A suavidade do loop e a ausência de faixa de áudio devem ser
confirmadas na homologação visual na TV; quando um clipe não atender, basta
substituir o arquivo na pasta `Clima/` pelo Drive — o slide passa a usar o novo
vídeo na próxima exibição, sem mudança de código.

## Ícones Meteocons

Estilo `fill`, distribuído em `public/meteocons/`:

- `clear-day.svg`, `clear-night.svg`, `partly-cloudy-day.svg`,
  `partly-cloudy-night.svg`, `cloudy.svg`, `fog-day.svg`, `fog-night.svg`,
  `drizzle.svg`, `rain.svg`, `extreme-rain.svg`, `sleet.svg`, `snow.svg`,
  `thunderstorms-day.svg`, `thunderstorms-night.svg`.
- Licença MIT em `public/meteocons/LICENSE`.

## Homologação

1. Confirmar que os 16 arquivos estão em `G:\Meu Drive\LabHub -TV\Clima` e que
   o Google Drive concluiu a sincronização (sem `.crdownload`).
2. Verificar visualmente cada condição na TV (dia/noite), legibilidade da
   temperatura e dos chips, e transição para o fundo neutro quando um vídeo é
   removido temporariamente.
3. Confirmar que o rodízio de `Cursos/` não reproduziu nenhum arquivo de
   `Clima/` e que a fila não reiniciou ao trocar um vídeo do clima.
