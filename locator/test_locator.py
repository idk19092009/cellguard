"""Behavior tests for single-location selection and class-dependent inference."""

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from locate import LargeTumourLocator, body_outline, locate_scan, select_large_override, select_location
from server import Handler


def candidate(x=100, y=200, score=0.6, support=8):
    return {"x": x, "y": y, "detector_score": score, "model_support": support, "inside_body": True}


def prediction(candidates):
    return {"width": 400, "height": 500, "candidates": candidates}


class SelectionTests(unittest.TestCase):
    def test_box_belongs_to_selected_point_in_original_image_pixels(self):
        first = {**candidate(score=.4), "box": [80, 175, 120, 225]}
        second = {**candidate(300, 100, .7), "box": [265, 65, 335, 135]}
        location = select_location(prediction([first, second]))["location"]
        self.assertEqual(location["box"], second["box"])
        self.assertEqual((location["x"], location["y"]), (300, 100))

    def test_box_is_clipped_and_invalid_box_does_not_fabricate_an_area(self):
        location = select_location(prediction([{**candidate(), "box": [-5, -10, 420, 510]}]))["location"]
        self.assertEqual(location["box"], [0, 0, 400, 500])
        for box in (None, [], [0, 0, float("nan"), 500], [120, 200, 80, 220], [1, 1, 20, 20]):
            with self.subTest(box=box):
                location = select_location(prediction([{**candidate(), "box": box}]))["location"]
                self.assertEqual(location["x"], 100)
                self.assertNotIn("box", location)

    def test_returns_one_strongest_supported_point_with_original_image_geometry(self):
        result = select_location(prediction([candidate(score=.4), candidate(300, 100, .7), candidate(20, 40, .9, 1)]))
        self.assertEqual(result["location"], {"x": 300, "y": 100, "x_percent": 75, "y_percent": 20})
        self.assertNotIn("candidates", result)

    def test_abstains_on_empty_weak_or_unstable_evidence(self):
        for values in ([], [candidate(score=.02)], [candidate(support=1)]):
            with self.subTest(values=values):
                result = select_location(prediction(values))
                self.assertEqual(result["status"], "unconfirmed")
                self.assertIsNone(result["location"])

    def test_invalid_coordinates_cannot_become_a_target(self):
        for point in (candidate(x=-1), candidate(x=400), candidate(y=500), candidate(x=float("nan"))):
            self.assertIsNone(select_location(prediction([point]))["location"])

    def test_exterior_detection_cannot_become_a_target(self):
        point = candidate()
        point["inside_body"] = False
        self.assertIsNone(select_location(prediction([point]))["location"])

    def test_body_outline_excludes_table_and_preserves_dark_lung_interior(self):
        scan = np.zeros((512, 512, 3), dtype=np.uint8)
        cv2.ellipse(scan, (256, 240), (190, 150), 0, 0, 360, (200, 200, 200), -1)
        cv2.ellipse(scan, (195, 230), (45, 85), 0, 0, 360, (35, 35, 35), -1)
        cv2.rectangle(scan, (15, 430), (497, 450), (230, 230, 230), -1)
        outline = body_outline(scan)
        self.assertIsNotNone(outline)
        self.assertGreaterEqual(cv2.pointPolygonTest(outline, (195, 230), False), 0)
        self.assertLess(cv2.pointPolygonTest(outline, (256, 440), False), 0)
        self.assertLess(cv2.pointPolygonTest(outline, (40, 250), False), 0)
        self.assertIsNone(body_outline(np.zeros_like(scan)))


class StubLocator:
    def __init__(self):
        self.calls = 0

    def predict(self, path):
        self.calls += 1
        return prediction([candidate(), candidate(300, 100, .4)])


class EmptyLocator:
    def predict(self, path):
        return prediction([])


class StubTumourLocator:
    def __init__(self):
        self.calls = 0

    def locate(self, path):
        self.calls += 1
        return select_location(prediction([candidate(150, 250)]))


class CombinationTests(unittest.TestCase):
    def test_supported_point_is_preserved_without_calling_new_model(self):
        fallback = StubTumourLocator()
        result = locate_scan(StubLocator(), Path("unused"), fallback)
        self.assertEqual(result["location"]["x"], 100)
        self.assertEqual(fallback.calls, 0)

    def test_new_model_is_used_only_when_original_abstains(self):
        fallback = StubTumourLocator()
        result = locate_scan(EmptyLocator(), Path("unused"), fallback)
        self.assertEqual(result["location"]["x"], 150)
        self.assertEqual(fallback.calls, 1)
        self.assertNotIn("candidates", result)

    def test_large_region_replaces_a_tiny_distant_malignant_point(self):
        current = {"status": "located", "width": 512, "height": 512,
                   "location": {"x": 185, "y": 346, "box": [181, 342, 189, 350]},
                   "review_required": True}
        proposal = {"x": 330, "y": 264, "box": [297, 223, 369, 321],
                    "score": .989, "width": 512, "height": 512}
        replaced = select_large_override(current, proposal)
        self.assertEqual((replaced["location"]["x"], replaced["location"]["y"]), (330, 264))
        self.assertEqual(replaced["location"]["box"], proposal["box"])
        nearby = {**current, "location": {"x": 330, "y": 264, "box": [325, 259, 335, 269]}}
        self.assertIs(select_large_override(nearby, proposal), nearby)
        small = {**proposal, "box": [300, 240, 350, 290]}
        self.assertIs(select_large_override(current, small), current)

    def test_reported_large_mass_example_uses_the_visible_region(self):
        workspace = Path(__file__).resolve().parent.parent
        image = workspace / "The IQ-OTHNCCD lung cancer dataset/Malignant cases/Malignant case (290).jpg"
        weights = Path(__file__).resolve().parent / "weights/cellguard_large_tumour_v1.pt"
        if not image.is_file() or not weights.is_file():
            self.skipTest("Saved regression image and weights are unavailable")
        proposal = LargeTumourLocator(weights).propose(image)
        self.assertIsNotNone(proposal)
        self.assertLess(proposal["x"], 380)
        self.assertGreater(proposal["x"], 290)
        self.assertGreater(proposal["y"], 220)
        self.assertLess(proposal["y"], 340)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = StubLocator()
        cls.handler = type("TestHandler", (Handler,), {"locator": cls.stub,
                                                      "log_message": lambda *args: None})
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), cls.handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, scan_class):
        request = urllib.request.Request(self.base + "/api/locate", data=b"test-image",
                                         headers={"Content-Type": "image/png", "X-Scan-Class": scan_class})
        with urllib.request.urlopen(request) as response:
            return json.load(response)

    def test_normal_never_runs_the_locator(self):
        before = self.stub.calls
        result = self.post("normal")
        self.assertEqual(self.stub.calls, before)
        self.assertEqual(result["status"], "skipped")
        self.assertIsNone(result["location"])

    def test_benign_and_malignant_use_the_same_single_location_api(self):
        before = self.stub.calls
        benign = self.post("benign")
        malignant = self.post("malignant")
        self.assertEqual(benign, malignant)
        self.assertEqual(self.stub.calls - before, 2)
        self.assertEqual(benign["status"], "located")
        self.assertNotIn("candidates", benign)

    def test_unknown_class_is_rejected(self):
        before = self.stub.calls
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.post("unknown")
        self.assertEqual(error.exception.code, 400)
        error.exception.close()
        self.assertEqual(self.stub.calls, before)

    def test_tumour_fallback_runs_for_malignant_only(self):
        fallback = StubTumourLocator()
        with patch.object(self.handler, "locator", EmptyLocator()), patch.object(self.handler, "tumour_locator", fallback):
            self.assertEqual(self.post("normal")["status"], "skipped")
            self.assertEqual(self.post("benign")["status"], "unconfirmed")
            self.assertEqual(fallback.calls, 0)
            self.assertEqual(self.post("malignant")["status"], "located")
            self.assertEqual(fallback.calls, 1)

    def test_sample_endpoint_is_removed(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.base + "/sample/malignant.jpg")
        self.assertEqual(error.exception.code, 404)
        error.exception.close()

    def test_3d_scene_and_local_modules_are_served(self):
        for route, expected_type in (
            ("/3d/", "text/html"),
            ("/3d/app.js", "text/javascript"),
            ("/3d/arm-kinematics.js", "text/javascript"),
            ("/3d/three.module.js", "text/javascript"),
            ("/3d/OrbitControls.js", "text/javascript"),
            ("/3d/RoomEnvironment.js", "text/javascript"),
            ("/3d/assets/patient-transparent.png", "image/png"),
            ("/handoff.js", "text/javascript"),
        ):
            with self.subTest(route=route), urllib.request.urlopen(self.base + route) as response:
                self.assertEqual(response.status, 200)
                self.assertTrue(response.headers["Content-Type"].startswith(expected_type))


if __name__ == "__main__":
    unittest.main(verbosity=2)
