import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def run(port=3000):
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, NoCacheHTTPRequestHandler)
    print(f"Serving HTTP on 0.0.0.0 port {port} (no-cache enabled)...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    run(p)
