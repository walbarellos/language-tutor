"""Consultas externas (Wiktionary, MyMemory). Tudo fica em disco: não repete e funciona offline depois."""
import difflib, hashlib, html, json, os, re, unicodedata, urllib.error, urllib.parse, urllib.request

from . import config

UA = {"User-Agent": "LaboratorioDaLingua/0.2 (uso pessoal)"}  # a Wikimedia exige identificar o programa


def http_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
        return json.load(r)


def em_cache(chave, fn):
    p = os.path.join(config.CACHE, "q_" + hashlib.sha1(chave.encode()).hexdigest() + ".json")
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
                raw_d = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", x["definition"], flags=re.DOTALL | re.IGNORECASE)
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
