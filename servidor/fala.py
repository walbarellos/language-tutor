"""Reconhecimento de fala com Whisper local (faster-whisper): sua voz nunca sai do computador."""
import os, tempfile, threading

_WHISPER = None
_TRAVA = threading.Lock()  # o modelo atende um pedido por vez; dois ao mesmo tempo disputariam a memória


def _remendar_av():
    """Algumas versões do PyAV rejeitam `metadata_errors`; repete a chamada sem ele."""
    try:
        import av
        orig = av.open
        def aberto(*a, **kw):
            try:
                return orig(*a, **kw)
            except TypeError as e:
                if "metadata_errors" in str(e):
                    kw.pop("metadata_errors", None)
                    return orig(*a, **kw)
                raise
        av.open = aberto
    except Exception:
        pass


def transcrever(audio, lang):
    return transcrever_det(audio, lang)["text"]


def transcrever_det(audio, lang):
    """Texto + palavras com início/fim (s) e confiança (0-1): base de ritmo, pausas e clareza."""
    global _WHISPER
    _remendar_av()
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
            # beam 1 = guloso, bem mais rápido para frases curtas; vad_filter corta silêncio e evita texto inventado
            segs, _ = _WHISPER.transcribe(f.name, language=lang, vad_filter=True, beam_size=int(os.environ.get("WHISPER_BEAM", "1")), word_timestamps=True)
            texto, palavras = [], []
            for s in segs:
                texto.append(s.text.strip())
                for w in (s.words or []):
                    palavras.append({"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.probability, 2)})
            return {"text": " ".join(texto), "words": palavras}
