"""Minimal LinkedIn API mock for visual QA: answers any POST with a URN id.

Mirrors the SMTP sink pattern (smtp_sink_and_run.py): run in the background
while the dev server has LINKEDIN_API_URL=http://127.0.0.1:8788, so engine
LinkedIn touches get deliveryStatus=delivered with a provider message id.
"""
import json
import http.server

COUNT = {"n": 0}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length)
        COUNT["n"] += 1
        print(f"[mock] POST {self.path} ({length}b): {body[:120]!r}", flush=True)
        payload = json.dumps({"id": f"urn:li:mock:{COUNT['n']}"}).encode()
        self.send_response(201)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    srv = http.server.HTTPServer(("127.0.0.1", 8788), Handler)
    print("[mock] LinkedIn API mock on 127.0.0.1:8788", flush=True)
    srv.serve_forever()
