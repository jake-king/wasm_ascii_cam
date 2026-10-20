"""Local development server for www/ with caching disabled.

Browsers cache ES modules aggressively; without this, a reload can run
stale JavaScript. Usage: python3 serve.py [port]  (default 8000)
"""
import functools
import http.server
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
handler = functools.partial(NoCacheHandler, directory="www")
print(f"Serving www/ at http://localhost:{port}")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
