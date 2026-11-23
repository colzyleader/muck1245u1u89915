"""Expose chain readiness without proxying wallet RPC."""
import json
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CLI = ["litecoin-cli", "-chain=main", "-conf=/dev/null", "-datadir=/var/data/litecoin"]


def synced():
    try:
        result = subprocess.run(
            CLI + ["getblockchaininfo"], capture_output=True, check=True, timeout=3
        )
        info = json.loads(result.stdout)
        return info["chain"] == "main" and info["initialblockdownload"] is False
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return False


class Readiness(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self.send_response(200 if synced() else 503)
        self.end_headers()

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 10000), Readiness).serve_forever()
