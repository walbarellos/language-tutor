#!/usr/bin/env python3
"""Laboratório da língua: servidor local.  Uso: uv run --with edge-tts python leitor_local.py"""
import asyncio, base64, hashlib, html, json, os, re, threading, urllib.error, urllib.parse, urllib.request, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import edge_tts
import difflib, tempfile, unicodedata

try:
    import pykakasi  # leitura (furigana/romaji) do japonês
except ImportError:
    pykakasi = None

try:  # opcional: sem ele o laboratório funciona, só sem frequência e detecção automática
    import wordfreq
except ImportError:
    wordfreq = None

PASTA = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(PASTA, "cache")
PORTA = 8765  # acima de 1024 não pede administrador; número pouco usado por outros programas
os.makedirs(CACHE, exist_ok=True)
if "HF_HOME" not in os.environ or not os.path.exists(os.environ["HF_HOME"]):
    os.environ["HF_HOME"] = os.path.join(CACHE, "hf")


class TTSEngine:  # contrato: trocar de motor de voz = criar outra subclasse
    def synth(self, text, voice):
        raise NotImplementedError  # devolve (áudio mp3, [{"t","d","text"}]) em milissegundos


class EdgeTTS(TTSEngine):
    async def _go(self, text, voice):
        try:  # edge-tts 7+ precisa pedir tempo por palavra
            com = edge_tts.Communicate(text, voice, boundary="WordBoundary")
        except TypeError:
            com = edge_tts.Communicate(text, voice)
        audio, words = bytearray(), []
        async for c in com.stream():
            if c["type"] == "audio":
                audio += c["data"]
            elif c["type"] == "WordBoundary":  # unidades de 100 ns; /10 000 = ms
                words.append({"t": c["offset"] / 10000, "d": c["duration"] / 10000, "text": c["text"]})
        return bytes(audio), words

    def synth(self, text, voice):
        return asyncio.run(self._go(text, voice))


class CachedTTS(TTSEngine):  # guarda em disco: a 2ª leitura é instantânea e funciona offline
    def __init__(self, inner):
        self.inner = inner

    def synth(self, text, voice):
        base = os.path.join(CACHE, hashlib.sha1(f"{voice}|{text}".encode()).hexdigest())
        if os.path.exists(base + ".mp3"):
            with open(base + ".mp3", "rb") as a, open(base + ".json") as w:
                return a.read(), json.load(w)
        audio, words = self.inner.synth(text, voice)
        if audio:
            with open(base + ".mp3", "wb") as a, open(base + ".json", "w") as w:
                a.write(audio); json.dump(words, w)
        return audio, words


ENGINE = CachedTTS(EdgeTTS())  # velocidade NÃO entra na chave: o navegador muda a velocidade


UA = {"User-Agent": "LaboratorioDaLingua/0.2 (uso pessoal)"}  # a Wikimedia exige identificar o programa


def http_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
        return json.load(r)


def em_cache(chave, fn):  # qualquer consulta externa fica em disco: não repete e funciona offline depois
    p = os.path.join(CACHE, "q_" + hashlib.sha1(chave.encode()).hexdigest() + ".json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    v = fn()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(v, f, ensure_ascii=False)
    return v


def dicionario(palavra, lang):
    """Definições do Wiktionary em inglês (a edição inglesa é a mais completa para italiano)."""
    def buscar():
        try:
            d = http_json("https://en.wiktionary.org/api/rest_v1/page/definition/" + urllib.parse.quote(palavra.lower()))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []  # palavra não existe no Wiktionary: resposta válida, não erro
            raise
        saida = []
        for e in d.get(lang, []):
            defs = []
            for x in e.get("definitions", [])[:3]:
                raw_d = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", x["definition"], flags=re.DOTALL|re.IGNORECASE)
                clean_d = html.unescape(re.sub(r"<[^>]+>", "", raw_d)).strip()
                if clean_d:
                    defs.append(clean_d)
            saida.append({"pos": e.get("partOfSpeech", ""), "defs": defs})
        return saida
    return em_cache(f"w|{lang}|{palavra.lower()}", buscar)


def pedacos(texto, n=450):
    """O MyMemory aceita ~500 caracteres por pedido; quebramos em vírgulas/pontos e vírgulas, com folga (450)."""
    partes, atual = [], ""
    for p in re.split(r"(?<=[,;:.])\s+", texto):
        if atual and len(atual) + len(p) + 1 > n:
            partes.append(atual); atual = p
        else:
            atual = (atual + " " + p).strip()
    return partes + [atual] if atual else partes


def traduzir(texto, src, dst):
    def buscar():
        out = []
        for p in pedacos(texto):
            q = urllib.parse.urlencode({"q": p, "langpair": f"{src}|{dst}"})
            out.append(html.unescape(http_json("https://api.mymemory.translated.net/get?" + q)["responseData"]["translatedText"]))
        return " ".join(out)
    return em_cache(f"t|{src}|{dst}|{texto}", buscar)


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


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def parecidas(palavra, lang):
    """Palavras parecidas em português e inglês (cognatos prováveis). Só para escrita latina."""
    if not all(unicodedata.name(c, "").startswith("LATIN") for c in palavra if c not in "'’-"):
        return []
    saida = []
    for dst, nome in (("pt-BR", "pt"), ("en", "en")):
        if lang == nome:
            continue
        tr = traduzir(palavra, lang, dst).strip().lower()
        if not tr or " " in tr:
            continue
        # 0,65: pega sicuro~seguro (0,67) e amato~amado (0,83) sem aceitar palavras só vagamente parecidas
        s = difflib.SequenceMatcher(None, sem_acento(palavra), sem_acento(tr)).ratio()
        if s >= 0.65:
            saida.append({"lang": nome, "word": tr, "sim": round(s, 2)})
    return saida


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
            "kanji": bool(re.search(r"[\u4e00-\u9fff々]", w)),  # só palavras com kanji precisam de furigana
        }
    return saida


_WHISPER = None
_TRAVA = threading.Lock()  # o modelo atende um pedido por vez; dois ao mesmo tempo disputariam a memória


def transcrever(audio, lang):
    """Reconhece a fala com Whisper local (faster-whisper): sua voz nunca sai do computador."""
    global _WHISPER
    try:
        import av
        _orig_av_open = av.open
        def _patched_av_open(*a, **kw):
            try:
                return _orig_av_open(*a, **kw)
            except TypeError as e:
                if "metadata_errors" in str(e):
                    kw.pop("metadata_errors", None)
                    return _orig_av_open(*a, **kw)
                raise
        av.open = _patched_av_open
    except Exception:
        pass
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("Falta o pacote faster-whisper. Rode com: --with faster-whisper (baixa ~500 MB na 1ª vez)")
    with _TRAVA:
        if _WHISPER is None:
            # "small": boa precisão em vários idiomas com CPU comum; int8 usa menos memória com perda mínima
            _WHISPER = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
        with tempfile.NamedTemporaryFile(suffix=".webm") as f:
            f.write(audio); f.flush()
            segs, _ = _WHISPER.transcribe(f.name, language=lang, vad_filter=True)  # vad_filter corta silêncio: evita texto inventado
            return " ".join(s.text.strip() for s in segs)


TRILHAS = os.path.join(PASTA, "trilhas")
PROGRESSO = os.path.join(PASTA, "dados", "progresso.json")


def ler_json(arq, padrao):
    try:
        with open(arq, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return padrao


def salvar_json(arq, obj):
    os.makedirs(os.path.dirname(arq), exist_ok=True)
    with open(arq + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(arq + ".tmp", arq)
    return {"ok": True}


def ler_trilha(lang):  # só letras no nome do arquivo: impede caminhos como ../
    return ler_json(os.path.join(TRILHAS, re.sub(r"[^a-z]", "", lang.lower()) + ".json"), {"situacoes": []})


ARQ = os.path.join(PASTA, "dados", "palavras.json")  # arquivo seu: dá para copiar, versionar e abrir em qualquer editor


def ler_cartas():
    try:
        with open(ARQ, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def salvar_cartas(cartas):
    os.makedirs(os.path.dirname(ARQ), exist_ok=True)
    tmp = ARQ + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cartas, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ARQ)  # troca atômica: queda de energia no meio não corrompe o arquivo
    return {"ok": True}


class H(BaseHTTPRequestHandler):
    def _send(self, code, kind, body):
        self.send_response(code); self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def _json(self, fn):
        try:
            out = fn()
        except urllib.error.URLError:
            out = {"error": "Sem internet para esta consulta (só a primeira vez; depois fica em cache)."}
        except Exception as e:
            out = {"error": str(e)}
        self._send(200, "application/json", json.dumps(out, ensure_ascii=False).encode())

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/trilha":
            return self._json(lambda: ler_trilha(urllib.parse.parse_qs(u.query)["lang"][0]))
        if u.path == "/api/progress":
            return self._json(lambda: {"progress": ler_json(PROGRESSO, {})})
        if u.path == "/api/cognate":
            q = urllib.parse.parse_qs(u.query)
            return self._json(lambda: {"similar": parecidas(q["w"][0], q["lang"][0])})
        if u.path == "/api/cards":
            return self._json(lambda: {"cards": ler_cartas()})
        if u.path == "/api/word":
            q = urllib.parse.parse_qs(u.query)
            return self._json(lambda: {"entries": dicionario(q["w"][0], q.get("lang", ["it"])[0])})
        html_path = os.path.join(PASTA, "leitor-italiano.html")
        if not os.path.exists(html_path):
            html_path = os.path.join(PASTA, "index.html")
        with open(html_path, "rb") as f:
            self._send(200, "text/html; charset=utf-8", f.read())

    def do_POST(self):
        n = int(self.headers["Content-Length"])
        if self.path.startswith("/api/asr"):
            lang = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)["lang"][0]
            audio = self.rfile.read(n)
            return self._json(lambda: {"text": transcrever(audio, lang)})
        d = json.loads(self.rfile.read(n))
        if self.path == "/api/reading":
            return self._json(lambda: {"reads": leituras(d["words"])})
        if self.path == "/api/progress":
            return self._json(lambda: salvar_json(PROGRESSO, d["progress"]))
        if self.path == "/api/freq":
            return self._json(lambda: {"ranks": posicoes(d["lang"], d["words"])})
        if self.path == "/api/detect":
            return self._json(lambda: {"langs": detectar(d["texts"], d["cands"])})
        if self.path == "/api/cards":
            return self._json(lambda: salvar_cartas(d["cards"]))
        if self.path == "/translate":
            return self._json(lambda: {"text": traduzir(d["text"], d["src"], d["dst"])})
        def tts():
            audio, words = ENGINE.synth(d["text"], d["voice"])
            if not audio:
                raise RuntimeError("a Microsoft não devolveu áudio (sem internet?)")
            return {"audio": base64.b64encode(audio).decode(), "words": words}
        self._json(tts)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    url = f"http://localhost:{PORTA}"
    print("Abra", url, "(Ctrl+C para sair)")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    ThreadingHTTPServer(("127.0.0.1", PORTA), H).serve_forever()  # só o seu computador acessa
