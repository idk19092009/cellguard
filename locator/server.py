"""Serve the CellGuard interface and single-location inference API."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from locate import EnsembleLocator, LargeTumourLocator, TumourLocator, locate_scan


HERE = Path(__file__).resolve().parent
MODEL_DIR = HERE.parent / "3d model"
MAX_UPLOAD_BYTES = 10_000_000
STATIC_FILES = {
    "/": ("demo.html", "text/html; charset=utf-8"),
    "/demo.html": ("demo.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/app.css": ("app.css", "text/css; charset=utf-8"),
    "/handoff.js": ("handoff.js", "text/javascript; charset=utf-8"),
}
MODEL_FILES = {
    "/3d/": ("index.html", "text/html; charset=utf-8"),
    "/3d/index.html": ("index.html", "text/html; charset=utf-8"),
    "/3d/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/3d/arm-kinematics.js": ("arm-kinematics.js", "text/javascript; charset=utf-8"),
    "/3d/three.module.js": ("three.module.js", "text/javascript; charset=utf-8"),
    "/3d/OrbitControls.js": ("OrbitControls.js", "text/javascript; charset=utf-8"),
    "/3d/RoomEnvironment.js": ("RoomEnvironment.js", "text/javascript; charset=utf-8"),
    "/3d/assets/patient-transparent.png": ("assets/patient-transparent.png", "image/png"),
}


class Handler(BaseHTTPRequestHandler):
    locator: EnsembleLocator
    tumour_locator: TumourLocator | None = None
    large_tumour_locator: LargeTumourLocator | None = None
    inference_lock = threading.Lock()

    def send_data(self, status: int, data: bytes, content_type: str) -> None:
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A newer upload may have cancelled this request.

    def send_json(self, status: int, body: dict) -> None:
        self.send_data(status, json.dumps(body).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self) -> None:
        route = STATIC_FILES.get(self.path)
        directory = HERE
        if route is None:
            route = MODEL_FILES.get(self.path.split("?", 1)[0])
            directory = MODEL_DIR
        if route is None:
            self.send_json(404, {"error": "Not found"})
            return
        filename, content_type = route
        self.send_data(200, (directory / filename).read_bytes(), content_type)

    def do_POST(self) -> None:
        if self.path != "/api/locate":
            self.send_json(404, {"error": "Not found"})
            return
        scan_class = self.headers.get("X-Scan-Class", "").strip().lower()
        if scan_class not in ("normal", "benign", "malignant"):
            self.send_json(400, {"error": "A valid scan classification is required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            length = -1
        if length < 1 or length > MAX_UPLOAD_BYTES:
            self.send_json(413, {"error": "Choose an image smaller than 10 MB"})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0] not in (
            "image/jpeg", "image/png", "application/octet-stream"
        ):
            self.send_json(415, {"error": "Choose a JPEG or PNG image"})
            return
        data = self.rfile.read(length)
        if len(data) != length:
            self.send_json(400, {"error": "The image upload was incomplete"})
            return
        if scan_class == "normal":
            self.send_json(200, {"status": "skipped", "location": None, "review_required": False})
            return
        try:
            with tempfile.TemporaryDirectory(prefix="cellguard-scan-") as directory:
                path = Path(directory) / "scan.png"
                path.write_bytes(data)
                with self.inference_lock:
                    result = locate_scan(self.locator, path,
                                         self.tumour_locator if scan_class == "malignant" else None,
                                         self.large_tumour_locator if scan_class == "malignant" else None)
            self.send_json(200, result)
        except (ValueError, OSError):
            self.send_json(400, {"error": "The image could not be analyzed. Choose a valid CT image."})
        except Exception:
            self.log_error("Location inference failed")
            self.send_json(500, {"error": "Location analysis failed. Please try again."})


def main() -> None:
    parser = argparse.ArgumentParser(description="Start CellGuard")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()
    Handler.locator = EnsembleLocator()
    config_path = HERE / "weights" / "locator_config.json"
    if config_path.is_file():
        config = json.loads(config_path.read_text())
        weights = (config_path.parent / config["file"]).resolve()
        if weights.parent != config_path.parent.resolve() or hashlib.sha256(weights.read_bytes()).hexdigest() != config["sha256"]:
            raise ValueError("Tumour locator weights do not match the verified configuration")
        Handler.tumour_locator = TumourLocator(weights, threshold=float(config["threshold"]))
    large_config_path = HERE / "weights" / "large_tumour_config.json"
    if large_config_path.is_file():
        large_config = json.loads(large_config_path.read_text())
        large_weights = (large_config_path.parent / large_config["file"]).resolve()
        if (large_weights.parent != large_config_path.parent.resolve() or
                hashlib.sha256(large_weights.read_bytes()).hexdigest() != large_config["sha256"]):
            raise ValueError("Large-tumour weights do not match the verified configuration")
        Handler.large_tumour_locator = LargeTumourLocator(large_weights)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"CellGuard ready at http://localhost:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
