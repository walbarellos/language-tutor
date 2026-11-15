#!/usr/bin/env python3
"""Confere as traduções de uma trilha contra uma tradução automática independente (MyMemory).
Uso:  python3 validar_trilhas.py it        (precisa de internet; não instala nada)
Isto NÃO prova que uma frase está certa: só aponta onde a tradução escrita e a automática discordam muito."""
import difflib, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

PASTA = os.path.dirname(os.path.abspath(__file__))
LIMITE = 0.45  # duas traduções corretas da mesma frase costumam variar na escolha de palavras; só abaixo disso a discordância é forte


def norm(s):
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"\([^)]*\)", "", s).strip()  # ignora notas entre parênteses


def auto(texto, lang):
    q = urllib.parse.urlencode({"q": texto, "langpair": f"{lang}|pt-BR"})
    req = urllib.request.Request("https://api.mymemory.translated.net/get?" + q, headers={"User-Agent": "LaboratorioDaLingua/0.2"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["responseData"]["translatedText"]


def comparar(escrita, automatica):
    return difflib.SequenceMatcher(None, norm(escrita), norm(automatica)).ratio()


if __name__ == "__main__":
    lang = sys.argv[1] if len(sys.argv) > 1 else "it"
    with open(os.path.join(PASTA, "trilhas", lang + ".json"), encoding="utf-8") as f:
        sits = json.load(f)["situacoes"]
    total = suspeitas = 0
    for s in sits:
        for l in s["linhas"]:
            total += 1
            a = auto(l["t"], lang)
            sim = comparar(l["p"], a)
            if sim < LIMITE:
                suspeitas += 1
                print(f"[{s['titulo']}] {l['t']}\n   escrita:    {l['p']}\n   automática: {a}   (semelhança {sim:.2f})\n")
            time.sleep(0.3)  # gentileza com o serviço gratuito
    print(f"{suspeitas} de {total} frases para revisar com um falante ou outra IA.")
