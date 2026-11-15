"""O motor de voz em uso. Trocar de motor = trocar esta linha."""
from . import config
from .tts import CachedTTS, EdgeTTS

ENGINE = CachedTTS(EdgeTTS(), config.CACHE)  # velocidade NÃO entra na chave: o navegador muda a velocidade
