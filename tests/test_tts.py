import os, sys, tempfile, threading, time, types, unittest, json
sys.modules.setdefault("edge_tts", types.ModuleType("edge_tts"))   # só a lógica de cache importa aqui
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from servidor.tts import CachedTTS, TTSEngine


class Lento(TTSEngine):
    def __init__(self, atraso=0.2, audio=b"ID3" + b"x" * 200_000):
        self.calls, self.atraso, self.audio = 0, atraso, audio
    def synth(self, text, voice):
        self.calls += 1
        time.sleep(self.atraso)
        return self.audio, [{"t": 0, "d": 100, "text": text}]


def rodar_em_paralelo(fn, atrasos):
    res, ts = [], []
    def go(d):
        time.sleep(d)
        try: res.append(fn())
        except Exception as e: res.append(e)
    ts = [threading.Thread(target=go, args=(d,)) for d in atrasos]
    [t.start() for t in ts]; [t.join() for t in ts]
    return res


class TestCachedTTS(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(); self.inner = Lento(); self.eng = CachedTTS(self.inner, self.dir)

    def test_T1_requisicoes_iguais_geram_uma_sintese(self):
        res = rodar_em_paralelo(lambda: self.eng.synth("ciao", "v"), [0, 0.02, 0.1, 0.25, 0.3])
        self.assertEqual(self.inner.calls, 1)
        self.assertTrue(all(not isinstance(r, Exception) and r[0] == self.inner.audio for r in res), res)

    def test_textos_diferentes_nao_se_bloqueiam(self):
        t0 = time.time()
        rodar_em_paralelo(lambda: self.eng.synth("a", "v"), [0]); rodar_em_paralelo(lambda: self.eng.synth("b", "v"), [0])
        res = []; ts = [threading.Thread(target=lambda x=x: res.append(self.eng.synth(x, "v2"))) for x in ("c", "d", "e")]
        t1 = time.time(); [t.start() for t in ts]; [t.join() for t in ts]
        self.assertLess(time.time() - t1, 0.45)   # 3 × 0,2 s em paralelo, não em fila

    def test_T2_leitor_nunca_ve_arquivo_pela_metade(self):
        self.eng.synth("x", "v")                                  # aquece
        base = next(os.path.join(self.dir, f[:-4]) for f in os.listdir(self.dir) if f.endswith(".mp3"))
        def reescreve():
            for _ in range(200):
                CachedTTS._gravar_atomico(base + ".json", json.dumps([{"t": 0, "d": 1, "text": "x"}]), "w")
                CachedTTS._gravar_atomico(base + ".mp3", self.inner.audio, "wb")
        w = threading.Thread(target=reescreve); w.start()
        ruins = 0
        while w.is_alive():
            r = self.eng._ler(base)
            if r is not None and r[0] != self.inner.audio: ruins += 1
        w.join(); self.assertEqual(ruins, 0)

    def test_T3_cache_corrompido_e_refeito(self):
        self.eng.synth("y", "v"); base = next(os.path.join(self.dir, f[:-4]) for f in os.listdir(self.dir) if f.endswith(".mp3"))
        open(base + ".json", "w").write("{quebrado"); n = self.inner.calls
        a, _ = self.eng.synth("y", "v"); self.assertEqual(self.inner.calls, n + 1); self.assertEqual(a, self.inner.audio)
        open(base + ".mp3", "wb").close(); a, _ = self.eng.synth("y", "v"); self.assertEqual(self.inner.calls, n + 2)

    def test_audio_vazio_nao_vai_para_o_cache(self):
        self.inner.audio = b""; self.eng.synth("z", "v"); self.eng.synth("z", "v"); self.assertEqual(self.inner.calls, 2)
        self.assertEqual([f for f in os.listdir(self.dir) if f.endswith(".mp3")], [])

    def test_sem_arquivos_tmp_sobrando(self):
        self.eng.synth("w", "v"); self.assertEqual([f for f in os.listdir(self.dir) if f.endswith(".tmp")], [])


if __name__ == "__main__":
    unittest.main()
