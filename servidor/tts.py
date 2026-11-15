"""Motor de voz: Edge TTS + cache em disco.

Invariantes (spec):
  T1  Duas requisições iguais ao mesmo tempo geram UMA síntese (trava por chave).
  T2  O cache nunca é lido pela metade: o .mp3 é o marcador de "pronto" e só aparece por os.replace.
  T3  Arquivo de cache corrompido/vazio conta como ausente e é refeito.
"""
import asyncio, hashlib, json, os, threading

import edge_tts


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
    def __init__(self, inner, pasta):
        self.inner, self.pasta = inner, pasta
        self._locks, self._mx = {}, threading.Lock()
        os.makedirs(pasta, exist_ok=True)

    def _trava(self, chave):
        with self._mx:
            return self._locks.setdefault(chave, threading.Lock())

    def _ler(self, base):
        try:
            with open(base + ".mp3", "rb") as a, open(base + ".json", encoding="utf-8") as w:
                audio, words = a.read(), json.load(w)
            return (audio, words) if audio else None
        except (FileNotFoundError, ValueError):
            return None  # ausente ou corrompido (T3)

    @staticmethod
    def _gravar_atomico(caminho, dados, modo):
        tmp = f"{caminho}.{os.getpid()}.{threading.get_ident()}.tmp"
        with open(tmp, modo, **({"encoding": "utf-8"} if "b" not in modo else {})) as f:
            f.write(dados)
        os.replace(tmp, caminho)

    def synth(self, text, voice):
        chave = hashlib.sha1(f"{voice}|{text}".encode()).hexdigest()
        base = os.path.join(self.pasta, chave)
        with self._trava(chave):  # T1
            hit = self._ler(base)
            if hit:
                return hit
            audio, words = self.inner.synth(text, voice)
            if audio:  # json primeiro, mp3 por último (T2)
                self._gravar_atomico(base + ".json", json.dumps(words), "w")
                self._gravar_atomico(base + ".mp3", audio, "wb")
            return audio, words
