#!/usr/bin/env python3
"""Laboratório da língua: servidor local.
Uso: uv run --with edge-tts --with "wordfreq[cjk]" --with pykakasi --with faster-whisper python leitor_local.py"""
import threading, webbrowser

from servidor import config
from servidor.rotas import servir

if __name__ == "__main__":
    url = f"http://localhost:{config.PORTA}"
    print("Abra", url, "(Ctrl+C para sair)")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    servir().serve_forever()
