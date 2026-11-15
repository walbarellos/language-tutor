"""Análise de palavras: idioma da frase, frequência (wordfreq) e leitura do japonês (pykakasi). Ambos opcionais."""
import re

try:
    import pykakasi  # leitura (furigana/romaji) do japonês
except ImportError:
    pykakasi = None

try:  # opcional: sem ele o laboratório funciona, só sem frequência e detecção automática
    import wordfreq
except ImportError:
    wordfreq = None


def exige_wordfreq():
    if wordfreq is None:
        raise RuntimeError("Falta o pacote wordfreq. Rode: uv run --with edge-tts --with wordfreq python leitor_local.py (japonês: --with 'wordfreq[cjk]')")


def detectar(textos, cands):
    """Idioma de cada frase: soma da frequência das palavras em cada idioma candidato. Funciona para qualquer idioma do wordfreq."""
    exige_wordfreq()
    saida, prev = [], cands[0]
    for t in textos:
        pont = {}
        for c in cands:
            try:
                pont[c] = sum(wordfreq.zipf_frequency(w, c) for w in wordfreq.tokenize(t, c))
            except Exception:
                pont[c] = 0  # idioma sem tokenizador instalado
        melhor = max(pont.values())
        topo = [c for c, v in pont.items() if v == melhor]
        prev = topo[0] if len(topo) == 1 else prev  # empate: mantém o idioma anterior
        saida.append(prev)
    return saida


_RANK = {}


def posicoes(lang, palavras):
    exige_wordfreq()
    if lang not in _RANK:
        # 50 000 palavras: cobre quase todo o vocabulário do dia a dia e carrega em milissegundos
        _RANK[lang] = {w: i + 1 for i, w in reversed(list(enumerate(wordfreq.top_n_list(lang, 50000))))}
    return {w: _RANK[lang].get(w.lower(), 0) for w in palavras}  # 0 = fora das 50 mil


_KKS = None
# Partículas: は lê-se "wa", へ lê-se "e", を lê-se "o" quando são palavras sozinhas; o conversor devolveria ha/he/wo
PARTICULAS = {"は": "wa", "へ": "e", "を": "o"}


def leituras(palavras):
    global _KKS
    if pykakasi is None:
        raise RuntimeError("Falta o pacote pykakasi. Rode com: --with pykakasi")
    _KKS = _KKS or pykakasi.kakasi()
    saida = {}
    for w in palavras:
        partes = _KKS.convert(w)
        saida[w] = {
            "hira": "".join(p["hira"] for p in partes),
            "romaji": PARTICULAS.get(w) or "".join(p["hepburn"] for p in partes),
            "kanji": bool(re.search(r"[一-鿿々]", w)),  # só palavras com kanji precisam de furigana
        }
    return saida
