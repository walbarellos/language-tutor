import http.client, json, os, sys, tempfile, threading, types, unittest
sys.modules.setdefault("edge_tts", types.ModuleType("edge_tts"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from servidor import config, rotas, voz
from servidor.tts import TTSEngine


class MotorFalso(TTSEngine):
    def synth(self, text, voice):
        return (b"ID3" + text.encode(), [{"t": 0, "d": 10, "text": text}]) if text else (b"", [])


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        cls._old = (config.PROGRESSO, config.ARQ, voz.ENGINE)
        config.PROGRESSO = os.path.join(cls.dir, "p.json"); config.ARQ = os.path.join(cls.dir, "c.json"); voz.ENGINE = MotorFalso()
        cls.srv = rotas.servir(0); cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); config.PROGRESSO, config.ARQ, voz.ENGINE = cls._old

    def req(self, metodo, path, corpo=None, headers=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port)
        h = {"Host": host if host is not None else f"localhost:{self.port}", **(headers or {})}
        c.putrequest(metodo, path, skip_host=True); [c.putheader(k, v) for k, v in h.items()]
        if corpo is not None:
            corpo = corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode(); c.putheader("Content-Length", str(len(corpo)))
        c.endheaders(corpo)
        r = c.getresponse(); b = r.read(); c.close(); return r.status, r.getheader("Content-Type"), b

    def post(self, path, corpo, **kw):
        s, t, b = self.req("POST", path, corpo, **kw)
        return s, (json.loads(b) if t and "json" in t else b)


class TestEstaticos(Base):
    def test_raiz_serve_index(self):
        s, t, b = self.req("GET", "/"); self.assertEqual(s, 200); self.assertIn("text/html", t); self.assertIn(b"main.js", b)

    def test_modulos_es_com_mime_de_javascript(self):
        s, t, _ = self.req("GET", "/js/main.js"); self.assertEqual((s, t.split(";")[0]), (200, "text/javascript"))
        s, t, _ = self.req("GET", "/css/app.css"); self.assertEqual((s, t.split(";")[0]), (200, "text/css"))

    def test_S3_nao_escapa_da_pasta_web(self):
        for p in ("/../leitor_local.py", "/js/../../leitor_local.py", "/%2e%2e/leitor_local.py", "/..%2fleitor_local.py", "//etc/passwd", "/../servidor/config.py"):
            s, _, b = self.req("GET", p); self.assertEqual(s, 404, p); self.assertNotIn(b"import", b)

    def test_inexistente_404(self):
        self.assertEqual(self.req("GET", "/nao-existe.js")[0], 404)


class TestSeguranca(Base):
    def test_S1_host_de_fora_e_negado_em_get_e_post(self):
        for h in ("evil.com", "evil.com:8765", "localhost.evil.com", "10.0.0.5:8765", ""):
            self.assertEqual(self.req("GET", "/api/cards", host=h)[0], 403, h)
            self.assertEqual(self.req("POST", "/api/cards", {"cards": []}, host=h)[0], 403, h)

    def test_S1_hosts_locais_passam(self):
        for h in (f"localhost:{self.port}", f"127.0.0.1:{self.port}", f"[::1]:{self.port}", "localhost"):
            self.assertEqual(self.req("GET", "/api/cards", host=h)[0], 200, h)

    def test_S2_origem_de_outro_site_nao_grava(self):
        antes = self.req("GET", "/api/cards")[2]
        for o in ("https://evil.com", "http://evil.com:8765", "http://localhost:1", f"http://127.0.0.1:{self.port}", "null"):
            s, _, _ = self.req("POST", "/api/cards", {"cards": [{"id": "x"}]}, headers={"Origin": o}); self.assertEqual(s, 403, o)
        self.assertEqual(self.req("GET", "/api/cards")[2], antes, "nada foi gravado")

    def test_S2_mesma_origem_e_sem_origin_passam(self):
        s, r = self.post("/api/cards", {"cards": [{"id": "a"}]}, headers={"Origin": f"http://localhost:{self.port}"}); self.assertEqual((s, r), (200, {"ok": True}))
        s, r = self.post("/api/cards", {"cards": [{"id": "b"}]}); self.assertEqual((s, r), (200, {"ok": True}))   # curl/scripts: sem Origin


class TestRotas(Base):
    def test_cartas_ida_e_volta_e_arquivo_sem_tmp(self):
        cartas = [{"id": "it|ciao", "word": "ciao", "ease": 2.5}]
        self.assertEqual(self.post("/api/cards", {"cards": cartas})[1], {"ok": True})
        s, t, b = self.req("GET", "/api/cards"); self.assertEqual(json.loads(b), {"cards": cartas})
        self.assertEqual([f for f in os.listdir(self.dir) if f.endswith(".tmp")], [])

    def test_progresso_ida_e_volta(self):
        self.post("/api/progress", {"progress": {"it": {"cafe": True}}}); self.assertEqual(json.loads(self.req("GET", "/api/progress")[2]), {"progress": {"it": {"cafe": True}}})

    def test_trilha_real_carrega_e_nome_malicioso_nao_sai_da_pasta(self):
        j = json.loads(self.req("GET", "/api/trilha?lang=it")[2]); self.assertGreaterEqual(len(j["situacoes"]), 10)
        self.assertEqual(json.loads(self.req("GET", "/api/trilha?lang=../servidor/config")[2]), {"situacoes": []})

    def test_tts_devolve_audio_base64_e_palavras(self):
        s, r = self.post("/tts", {"text": "Ciao a tutti", "voice": "v"}); self.assertEqual(s, 200)
        import base64; self.assertEqual(base64.b64decode(r["audio"]), b"ID3Ciao a tutti"); self.assertEqual(r["words"][0]["text"], "Ciao a tutti")

    def test_tts_sem_audio_vira_erro_legivel(self):
        s, r = self.post("/tts", {"text": "", "voice": "v"}); self.assertIn("Microsoft", r["error"])

    def test_post_desconhecido_404_e_json_quebrado_vira_erro(self):
        self.assertEqual(self.req("POST", "/nao-existe", {"a": 1})[0], 404)
        s, r = self.post("/api/cards", b"{quebrado"); self.assertIn("error", r)

    def test_erro_de_dependencia_opcional_chega_como_mensagem(self):
        s, r = self.post("/api/asr?lang=it", b"RIFF"); self.assertEqual(s, 200); self.assertIn("error", r)   # sem faster-whisper no teste


if __name__ == "__main__":
    unittest.main()
