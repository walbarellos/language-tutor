"""HTTP: tabela de rotas + proteção contra páginas de outros sites.

Invariantes (tests/test_server.py):
  S1  Só atende se o `Host` for local (impede DNS rebinding).
  S2  POST vindo de um navegador só passa se o `Origin` for exatamente esta mesma origem
      (uma página qualquer aberta no seu navegador não consegue gravar seus cartões).
  S3  Arquivos estáticos nunca saem da pasta web/.
"""
import base64, json, os, urllib.error, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import armazem, config, consultas, fala, palavras, voz


def _tts(d):
    rate = d.get("rate", "+0%")
    if isinstance(rate, (int, float)):
        pct = round((rate - 1.0) * 100)
        rate = f"{pct:+d}%"
    try:
        audio, words = voz.ENGINE.synth(d["text"], d["voice"], rate=rate)
    except TypeError:
        audio, words = voz.ENGINE.synth(d["text"], d["voice"])
    if not audio:
        raise RuntimeError("a Microsoft não devolveu áudio (sem internet?)")
    return {"audio": base64.b64encode(audio).decode(), "words": words}


# q = parâmetros da URL (listas, como parse_qs).  d = corpo JSON.
GET = {
    "/api/trilha": lambda q: armazem.ler_trilha(q["lang"][0]),
    "/api/progress": lambda q: {"progress": armazem.ler_progresso()},
    "/api/cognate": lambda q: {"similar": consultas.parecidas(q["w"][0], q["lang"][0])},
    "/api/cards": lambda q: {"cards": armazem.ler_cartas()},
    "/api/word": lambda q: {"entries": consultas.dicionario(q["w"][0], q.get("lang", ["it"])[0])},
}
POST = {
    "/api/reading": lambda d: {"reads": palavras.leituras(d["words"])},
    "/api/progress": lambda d: armazem.salvar_progresso(d["progress"]),
    "/api/freq": lambda d: {"ranks": palavras.posicoes(d["lang"], d["words"])},
    "/api/detect": lambda d: {"langs": palavras.detectar(d["texts"], d["cands"])},
    "/api/cards": lambda d: armazem.salvar_cartas(d["cards"]),
    "/translate": lambda d: {"text": consultas.traduzir(d["text"], d["src"], d["dst"])},
    "/tts": _tts,
}


def host_ok(host):
    return (urllib.parse.urlsplit("//" + (host or "")).hostname or "") in config.HOSTS_OK


def origem_ok(host, origin):
    """Sem Origin = não é um navegador (curl, scripts seus): passa. Com Origin tem de ser a mesma origem."""
    if origin is None:
        return True
    return urllib.parse.urlsplit(origin).netloc == host and host_ok(host)


class H(BaseHTTPRequestHandler):
    def _send(self, code, kind, body):
        self.send_response(code); self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def _negar(self, msg):
        self._send(403, "text/plain; charset=utf-8", msg.encode())

    def _json(self, fn):
        try:
            out = fn()
        except urllib.error.URLError:
            out = {"error": "Sem internet para esta consulta (só a primeira vez; depois fica em cache)."}
        except Exception as e:
            out = {"error": str(e)}
        self._send(200, "application/json", json.dumps(out, ensure_ascii=False).encode())

    def do_GET(self):
        if not host_ok(self.headers.get("Host")):
            return self._negar("host nao permitido")                                   # S1
        u = urllib.parse.urlparse(self.path)
        if u.path in GET:
            q = urllib.parse.parse_qs(u.query)
            return self._json(lambda: GET[u.path](q))
        self._static(u.path)

    def _static(self, caminho):
        rel = caminho.lstrip("/") or "index.html"
        full = os.path.realpath(os.path.join(config.WEB, rel))
        if not full.startswith(config.WEB + os.sep) or not os.path.isfile(full):       # S3
            return self._send(404, "text/plain; charset=utf-8", b"nao encontrado")
        with open(full, "rb") as f:
            self._send(200, config.MIME.get(os.path.splitext(full)[1], "application/octet-stream"), f.read())

    def do_POST(self):
        host = self.headers.get("Host")
        if not host_ok(host):
            return self._negar("host nao permitido")                                   # S1
        if not origem_ok(host, self.headers.get("Origin")):
            return self._negar("origem nao permitida")                                 # S2
        n = int(self.headers.get("Content-Length") or 0)
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/asr":
            lang = urllib.parse.parse_qs(u.query)["lang"][0]; audio = self.rfile.read(n)
            return self._json(lambda: fala.transcrever_det(audio, lang))
        if u.path not in POST:
            self.rfile.read(n)
            return self._send(404, "text/plain; charset=utf-8", b"nao encontrado")
        try:
            d = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._json(lambda: (_ for _ in ()).throw(ValueError("corpo JSON inválido")))
        self._json(lambda: POST[u.path](d))

    def log_message(self, *a):
        pass


def servir(porta=config.PORTA):
    return ThreadingHTTPServer(("127.0.0.1", porta), H)  # só o seu computador acessa
