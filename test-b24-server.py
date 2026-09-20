# Server di test B24: serve cookiewx-cdn e riceve i POST /collect del beacon.
# Uso: python test-b24-server.py  (poi Chrome headless sulle pagine test-b24-*)
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
LOG = ROOT / "test-b24-collect.log"
PORT = 8924


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path == "/collect":
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n).decode("utf-8", "replace")
            with LOG.open("a", encoding="utf-8") as f:
                f.write(body + "\n")
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/test-b24-attivo.html"
        f = ROOT / path.lstrip("/")
        if f.is_file() and f.suffix in (".html", ".js"):
            data = f.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type",
                             "text/html; charset=utf-8" if f.suffix == ".html"
                             else "application/javascript")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    LOG.write_text("", encoding="utf-8")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"READY {PORT}", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
