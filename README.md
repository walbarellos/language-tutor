# Language Tutor (Laboratório da Língua)

Plataforma inteligente para aprendizado ativo de idiomas com sintetização de voz neural multi-idioma (Edge TTS), sincronização de áudio palavra por palavra em tempo real, reconhecimento e transcrição local com Whisper (faster-whisper), suporte nativo a furigana/romaji no japonês, sistema de repetição espaçada (SRS SM-2), detecção de frequência de vocabulário e trilhas situacionais em frases completas do dia a dia.

---

## Principais Funcionalidades

- **Voz Neural com Troca Automática de Idioma:**
  - Alternância fluida entre explicações em português (`pt-BR-FranciscaNeural` / `pt-BR-AntonioNeural`) e falas no idioma de estudo via vozes neurais da Microsoft (Italiano, Japonês, Espanhol, Inglês, Francês, Alemão, Hebraico, Árabe).
  - Destaque palavra por palavra sincronizado via eventos `WordBoundary`.
  - Animação física suave com amortecimento (*squash & stretch*).

- **Shadowing e Gravação com Whisper Local:**
  - Prática ativa de pronúncia e escuta.
  - Gravação do microfone no navegador e transcrição em tempo real rodando 100% local com `faster-whisper`. Nenhum áudio de voz do usuário sai da máquina.
  - Avaliação automática da fala por distância de edição: sublinhado visual por palavra (**liso** para reconhecida, **tracejado** para parcial, **ondulado** para não compreendida).
  - Comparação imediata: áudio original vs. sua voz gravada.

- **Furigana e Romaji Nativos para Japonês:**
  - Conversão de kanji em furigana (`<ruby><rt>`) e romaji via `pykakasi`.
  - Tratamento fonético correto de partículas gramaticais (`は` → `wa`, `へ` → `e`, `を` → `o`).
  - Alternância rápida entre visualizações (furigana, romaji ou sem leitura).

- **Trilhas por Situação (Contexto Real):**
  - Cenas curtas em diálogos reais de sobrevivência e conversação (pedir café, transporte, restaurante, compras, emergências, rotina, opiniões).
  - Conteúdo modular em arquivos JSON (`trilhas/<idioma>.json`).
  - Traduções nativas e completas frase a frase.
  - Salva o diálogo inteiro como cartões de estudo com 1 clique (**★ Guardar todas as frases**).
  - Acompanhamento de progresso com marcação de concluído (**✓**).

- **Estudo Ativo e Repetição Espaçada:**
  - Cartões de revisão com algoritmo SM-2 (vencimento, facilidade, repetições).
  - Atalhos de teclado (1 a 4) e áudio embutido na revisão.
  - Exportação de baralhos para o **Anki** (.tsv).
  - Consulta instantânea ao Wiktionary em inglês com cache em disco.
  - Classificação de palavras por frequência de uso (Top 1.000 essencial, Top 3.000 comum via `wordfreq`).
  - Modo "Só ouvir" com texto borrado até a revelação manual e "Pausa para repetir" com shadowing cronometrado.

---

## Como Executar

### Pré-requisitos
Recomenda-se o uso do gerenciador de pacotes ultrarrápido [uv](https://github.com/astral-sh/uv) (ou `python 3.10+` com pip/venv).

### Execução com `uv` (recomendado)

```bash
uv run --with edge-tts --with "wordfreq[cjk]" --with pykakasi --with faster-whisper python leitor_local.py
```

(`WHISPER_BEAM=1` é o padrão: reconhecimento mais rápido para frases curtas; suba para 5 se quiser mais precisão.)

O servidor iniciará automaticamente em `http://localhost:8765` e abrirá a página no navegador padrão.

> **Nota:** Na primeira vez em que a gravação for utilizada, o `faster-whisper` fará o download local do modelo `small` (~500 MB) e o manterá em cache (`cache/hf/`). Para máquinas com menor capacidade de memória, defina `WHISPER_MODEL=base` ou `tiny` antes de rodar.

---

## Modo Treino (🎯, atalho `T`)

Conduz a prática sozinho, frase a frase, sem apertar nada: **ouvir devagar → ouvir normal → falar** (a gravação começa e **para sozinha** quando você cala) **→ nota → ≥ 80% avança, senão repete** (até 2 vezes, depois segue). Sem microfone, vira "ouvir + pausa para repetir". Parar o treino cancela áudio, gravação e esperas.

**Calibrar o fim de fala:** em ⚙ há dois controles. *Volume mínimo* (menor = mais sensível: use se o Treino não percebe que você falou) e *Silêncio para encerrar* (maior = espera mais antes de cortar: use se ele corta no meio da frase). Valem já na próxima gravação.

**Segurança local:** o servidor só atende `Host` local e só aceita POST da própria origem; uma página de outro site aberta no seu navegador não consegue gravar seus cartões.

Atalhos: `Espaço` tocar/pausar · `←` `→` frase · `↑` `↓` velocidade · `L` repetir · `T` treino · `R` revelar · `G` gravar. Clicar numa frase a toca e continua; clicar numa palavra toca só a palavra.

---

## Estrutura do Projeto

Sem build e sem framework: módulos ES nativos, cada um pequeno e com uma responsabilidade (o maior tem ~115 linhas). O servidor também é um pacote (`servidor/`), com o maior módulo em ~110 linhas.

```
language-tutor/
├── leitor_local.py        # porta de entrada (13 linhas): abre o servidor e o navegador
├── servidor/              # um módulo por responsabilidade
│   ├── rotas.py           # tabela de rotas + proteção Host/Origin
│   ├── tts.py, voz.py     # motor de voz + cache (trava por chave, escrita atômica)
│   ├── fala.py            # Whisper local
│   ├── palavras.py        # idioma da frase, frequência (wordfreq), furigana/romaji (pykakasi)
│   ├── consultas.py       # Wiktionary e tradução, com cache em disco
│   ├── armazem.py         # cartões, progresso e trilhas (escrita atômica)
│   └── config.py          # caminhos e constantes
├── validar_trilhas.py     # validador das traduções das trilhas
├── trilhas/               # trilhas situacionais por idioma (JSON)
├── web/
│   ├── index.html         # só a casca (HTML)
│   ├── css/app.css
│   └── js/
│       ├── main.js        # monta tudo e liga os botões (sem regra de negócio)
│       ├── audio.js       # AudioController: ÚNICA saída de som (1 voz, single-flight, pausa)
│       ├── player.js      # decide O QUE tocar (frase ativa, auto-avanço, loop, pausa p/ repetir)
│       ├── trainer.js     # Modo Treino (máquina de estados)
│       ├── recorder.js / vad.js / settings.js   # microfone, detector de fim de fala e sua calibração
│       ├── shadowing.js   # transcrição + nota por palavra
│       ├── srs.js         # cartões e SM-2 (Scheduler trocável)
│       ├── trilha.js, session.js, pipeline.js, languages.js
│       ├── render.js, wordpanel.js, dictionary.js, freq.js, clips.js, api.js, state.js, util.js
└── tests/                 # node:test (JS) + unittest (Python)
```

Invariantes de cada módulo (A1–A6 em `audio.js`, P1–P3 em `player.js`, R1–R3 em `trainer.js`, T1–T3 em `servidor/tts.py`, S1–S3 em `servidor/rotas.py`) estão no topo do arquivo e cada uma tem teste.

## Testes

```bash
npm install     # só instala o jsdom, usado no smoke test
npm test        # 62 testes JS + 21 Python
```

---

## Validador de Trilhas

Para testar e validar novas frases adicionadas a qualquer trilha:

```bash
python3 validar_trilhas.py it
python3 validar_trilhas.py ja
python3 validar_trilhas.py es
```

O script compara as traduções com uma referência independente e sinaliza discordâncias evidentes.
