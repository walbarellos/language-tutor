"""Caminhos e constantes. Quem precisa de um caminho lê `config.X` NA HORA da chamada (assim os testes podem trocá-lo)."""
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(RAIZ, "cache")
WEB = os.path.realpath(os.path.join(RAIZ, "web"))
TRILHAS = os.path.join(RAIZ, "trilhas")
PROGRESSO = os.path.join(RAIZ, "dados", "progresso.json")
ARQ = os.path.join(RAIZ, "dados", "palavras.json")  # arquivo seu: dá para copiar, versionar e abrir em qualquer editor
PORTA = 8765  # acima de 1024 não pede administrador; número pouco usado por outros programas
HOSTS_OK = {"localhost", "127.0.0.1", "::1"}  # nomes pelos quais o navegador pode chegar aqui
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon"}

os.makedirs(CACHE, exist_ok=True)
if "HF_HOME" not in os.environ or not os.path.exists(os.environ["HF_HOME"]):
    os.environ["HF_HOME"] = os.path.join(CACHE, "hf")
