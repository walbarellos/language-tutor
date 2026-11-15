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

O servidor iniciará automaticamente em `http://localhost:8765` e abrirá a página no navegador padrão.

> **Nota:** Na primeira vez em que a gravação for utilizada, o `faster-whisper` fará o download local do modelo `small` (~500 MB) e o manterá em cache (`cache/hf/`). Para máquinas com menor capacidade de memória, defina `WHISPER_MODEL=base` ou `tiny` antes de rodar.

---

## Estrutura do Projeto

```
language-tutor/
├── leitor_local.py           # Servidor local HTTP, integração Edge-TTS, Whisper e APIs
├── leitor-italiano.html      # Interface web SPA (HTML5 / CSS moderno / Vanilla JS)
├── index.html               # Cópia compatível para servidores web estáticos
├── validar_trilhas.py       # Script de validação automática de consistência das traduções
├── trilhas/                 # Trilhas situacionais por idioma (JSON)
│   ├── it.json              # 17 situações em italiano (Nível 1 e 2)
│   ├── ja.json              # 5 situações em japonês (com furigana)
│   └── es.json              # 4 situações em espanhol
└── .gitignore               # Ignora diretórios de cache e dados locais
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
