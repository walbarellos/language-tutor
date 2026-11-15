"""Leitura e escrita dos seus dados (cartões, progresso, trilhas). Escrita sempre atômica."""
import json, os, re

from . import config


def ler_json(arq, padrao):
    try:
        with open(arq, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return padrao


def salvar_json(arq, obj):
    os.makedirs(os.path.dirname(arq), exist_ok=True)
    tmp = arq + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, arq)  # troca atômica: queda de energia no meio não corrompe o arquivo
    return {"ok": True}


def ler_trilha(lang):  # só letras no nome do arquivo: impede caminhos como ../
    return ler_json(os.path.join(config.TRILHAS, re.sub(r"[^a-z]", "", lang.lower()) + ".json"), {"situacoes": []})


def ler_cartas():
    return ler_json(config.ARQ, [])


def salvar_cartas(cartas):
    return salvar_json(config.ARQ, cartas)


def ler_progresso():
    return ler_json(config.PROGRESSO, {})


def salvar_progresso(p):
    return salvar_json(config.PROGRESSO, p)
