"""Find lung-nodule locations on one CT slice.

This uses the single-slice LUNA16 detector described in README.md. Coordinates
are in the original image's pixel grid, with the origin at the top left.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from research.unet_candidate import TumourUNet


HERE = Path(__file__).resolve().parent
DEFAULT_WEIGHTS = HERE / "weights" / "luna16_2d_fold0.pt"
ENSEMBLE_WEIGHTS = [HERE / "weights" / f"luna16_2d_fold{i}.pt" for i in range(10)]
LOCATION_MIN_SCORE = 0.075
LOCATION_MIN_SUPPORT = 5


def body_outline(image):
    """Estimate the enclosing torso outline, excluding table and edge artifacts.

    This is a coarse image-content check, not lung or lesion segmentation.
    A scan without a usable outline cannot produce an accepted location.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    size = max(3, round(min(width, height) / 100) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        fraction = cv2.contourArea(contour) / (width * height)
        if .10 <= fraction <= .95 and cv2.pointPolygonTest(contour, (width / 2, height / 2), False) >= 0:
            return contour
    return None


def select_location(result: dict, *, min_score: float = LOCATION_MIN_SCORE,
                    min_support: int = LOCATION_MIN_SUPPORT) -> dict:
    """Return one supported image location, or abstain.

    These are engineering acceptance rules, not calibrated clinical thresholds.
    An image-level class does not identify which nodule is malignant.
    """
    width, height = result["width"], result["height"]
    if width <= 0 or height <= 0:
        raise ValueError("Invalid image dimensions")
    for candidate in sorted(result["candidates"], key=lambda c: c["detector_score"], reverse=True):
        x, y = candidate["x"], candidate["y"]
        if (not all(math.isfinite(v) for v in (x, y, candidate["detector_score"]))
                or not (0 <= x < width and 0 <= y < height)
                or candidate["detector_score"] < min_score
                or candidate.get("model_support", 0) < min_support
                or not candidate.get("inside_body", False)):
            continue
        location = {"x": x, "y": y,
                    "x_percent": round(100 * x / width, 2),
                    "y_percent": round(100 * y / height, 2)}
        box = candidate.get("box")
        if isinstance(box, (list, tuple)) and len(box) == 4 and all(math.isfinite(v) for v in box):
            left, top, right, bottom = box
            left, top = max(0, left), max(0, top)
            right, bottom = min(width, right), min(height, bottom)
            if left < right and top < bottom and left <= x <= right and top <= y <= bottom:
                location["box"] = [left, top, right, bottom]
        return {
            "status": "located", "width": width, "height": height,
            "location": location,
            "review_required": True,
        }
    return {"status": "unconfirmed", "width": width, "height": height,
            "location": None, "review_required": True}


class NoduleLocator:
    def __init__(self, weights: Path = DEFAULT_WEIGHTS):
        if not weights.is_file():
            raise FileNotFoundError(f"Detector weights missing: {weights}")
        self.model = YOLO(str(weights))

    def predict(self, image_path: Path, *, min_score: float = 0.01, max_candidates: int = 50) -> dict:
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")
        height, width = image.shape[:2]
        result = self.model.predict(
            image,
            imgsz=512,
            conf=min_score,
            iou=0.4,
            max_det=max_candidates,
            device="cpu",
            verbose=False,
        )[0]
        candidates = []
        for box, confidence in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist()):
            left, top, right, bottom = (float(v) for v in box)
            x, y = (left + right) / 2, (top + bottom) / 2
            candidates.append({
                "x": round(x, 2),
                "y": round(y, 2),
                "x_percent": round(100 * x / width, 2),
                "y_percent": round(100 * y / height, 2),
                "box": [round(v, 2) for v in (left, top, right, bottom)],
                "detector_score": round(float(confidence), 5),
            })
        return {
            "image": str(image_path.resolve()),
            "width": width,
            "height": height,
            "candidates": candidates,
        }


class EnsembleLocator:
    """Combine ten independently trained LUNA16 folds by spatial consensus."""

    def __init__(self, weights: list[Path] = ENSEMBLE_WEIGHTS):
        missing = [str(path) for path in weights if not path.is_file()]
        if missing:
            raise FileNotFoundError(f"Detector weights missing: {missing}")
        self.models = [YOLO(str(path)) for path in weights]

    def predict(self, image_path: Path, *, min_score: float = 0.01, max_candidates: int = 50) -> dict:
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")
        height, width = image.shape[:2]
        radius = 12 * min(width, height) / 512
        outline = body_outline(image)
        all_candidates = []
        for model_number, model in enumerate(self.models):
            result = model.predict(image, imgsz=512, conf=min_score, iou=0.4,
                                   max_det=max_candidates, device="cpu", verbose=False)[0]
            for box, confidence in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist()):
                left, top, right, bottom = (float(v) for v in box)
                all_candidates.append({"model": model_number, "score": float(confidence),
                                       "box": [left, top, right, bottom],
                                       "x": (left + right) / 2, "y": (top + bottom) / 2})
        all_candidates.sort(key=lambda item: item["score"], reverse=True)
        clusters: list[dict] = []
        for candidate in all_candidates:
            nearest = None
            nearest_distance = radius
            for cluster in clusters:
                if candidate["model"] in cluster["models"]:
                    continue
                distance = ((candidate["x"] - cluster["x"]) ** 2 +
                            (candidate["y"] - cluster["y"]) ** 2) ** 0.5
                if distance < nearest_distance:
                    nearest, nearest_distance = cluster, distance
            if nearest is None:
                clusters.append({"x": candidate["x"], "y": candidate["y"],
                                 "box": candidate["box"].copy(), "score_sum": candidate["score"],
                                 "models": {candidate["model"]}})
            else:
                old = nearest["score_sum"]
                new = old + candidate["score"]
                for field in ("x", "y"):
                    nearest[field] = (nearest[field] * old + candidate[field] * candidate["score"]) / new
                nearest["box"] = [(a * old + b * candidate["score"]) / new
                                  for a, b in zip(nearest["box"], candidate["box"])]
                nearest["score_sum"] = new
                nearest["models"].add(candidate["model"])
        clusters.sort(key=lambda item: item["score_sum"], reverse=True)
        candidates = []
        for cluster in clusters[:max_candidates]:
            candidates.append({
                "x": round(cluster["x"], 2), "y": round(cluster["y"], 2),
                "x_percent": round(100 * cluster["x"] / width, 2),
                "y_percent": round(100 * cluster["y"] / height, 2),
                "box": [round(v, 2) for v in cluster["box"]],
                "detector_score": round(cluster["score_sum"] / len(self.models), 5),
                "model_support": len(cluster["models"]),
                "inside_body": outline is not None and cv2.pointPolygonTest(
                    outline, (cluster["x"], cluster["y"]), False) >= 0,
            })
        return {"image": str(image_path.resolve()), "width": width, "height": height,
                "candidates": candidates}


class TumourLocator:
    """A separately trained primary-tumour detector used only to fill gaps."""

    def __init__(self, weights: Path, threshold: float = .35):
        if not weights.is_file() or not 0 < threshold <= 1:
            raise ValueError("Invalid tumour locator configuration")
        self.model = YOLO(str(weights))
        self.threshold = threshold

    def locate(self, image_path: Path) -> dict:
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Cannot read image")
        height, width = image.shape[:2]
        outline = body_outline(image)
        result = self.model.predict(image, imgsz=384, conf=.01, iou=.4, max_det=50,
                                    device="cpu", verbose=False)[0]
        candidates = []
        for box, score in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist()):
            x1, y1, x2, y2 = box
            x, y = (x1+x2)/2, (y1+y2)/2
            candidates.append({"x":x, "y":y, "box":box, "detector_score":float(score), "model_support":1,
                               "inside_body":outline is not None and cv2.pointPolygonTest(outline,(x,y),False)>=0})
        return select_location({"width":width,"height":height,"candidates":candidates},
                               min_score=self.threshold, min_support=1)


class LargeTumourLocator:
    """Propose a large primary-tumour region from the trained outline model."""

    def __init__(self, weights: Path):
        if not weights.is_file():
            raise FileNotFoundError(f"Large-tumour weights missing: {weights}")
        self.model = TumourUNet().eval()
        self.model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True)["model"])

    def propose(self, image_path: Path) -> dict | None:
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")
        height, width = image.shape[:2]
        outline = body_outline(image)
        if outline is None:
            return None
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, (256, 256), interpolation=cv2.INTER_AREA)
        tensor = torch.from_numpy(resized.astype(np.float32)[None, None] / 255.)
        with torch.inference_mode():
            probability = self.model(tensor).sigmoid()[0, 0].numpy()
        probability = cv2.resize(probability, (width, height), interpolation=cv2.INTER_LINEAR)
        binary = (probability >= .95).astype(np.uint8)
        count, components, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
        minimum_pixels = max(1, round(128 * width * height / (512 * 512)))
        ranked = sorted(range(1, count), key=lambda index: stats[index, cv2.CC_STAT_AREA], reverse=True)
        for index in ranked:
            if int(stats[index, cv2.CC_STAT_AREA]) < minimum_pixels:
                continue
            mask = components == index
            distances = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 3)
            y, x = np.unravel_index(int(distances.argmax()), mask.shape)
            if cv2.pointPolygonTest(outline, (float(x), float(y)), False) < 0:
                continue
            left, top, box_width, box_height, _ = stats[index]
            return {"x": float(x), "y": float(y),
                    "box": [int(left), int(top), int(left + box_width), int(top + box_height)],
                    "score": float(probability[mask].mean()),
                    "width": width, "height": height}
        return None


def select_large_override(current: dict, proposal: dict | None) -> dict:
    """Replace a tiny distant point only for a supported large tumour region."""
    if proposal is None or current["width"] != proposal["width"] or current["height"] != proposal["height"]:
        return current
    left, top, right, bottom = proposal["box"]
    area = (right - left) * (bottom - top)
    scaled_minimum = 4000 * proposal["width"] * proposal["height"] / (512 * 512)
    if area < scaled_minimum or proposal["score"] < .97:
        return current
    old = current["location"]
    if old is not None:
        old_box = old.get("box")
        old_area = ((old_box[2] - old_box[0]) * (old_box[3] - old_box[1])
                    if old_box is not None else 0)
        if old_area > .25 * area or (left <= old["x"] <= right and top <= old["y"] <= bottom):
            return current
    x, y = proposal["x"], proposal["y"]
    return {"status": "located", "width": proposal["width"], "height": proposal["height"],
            "location": {"x": x, "y": y,
                         "x_percent": round(100 * x / proposal["width"], 2),
                         "y_percent": round(100 * y / proposal["height"], 2),
                         "box": proposal["box"]},
            "review_required": True}


def locate_scan(locator, image_path: Path, tumour_locator=None, large_tumour_locator=None) -> dict:
    """Return one point, using a large-region proposal for a tiny distant point."""
    result = select_location(locator.predict(image_path))
    if result["status"] != "located" and tumour_locator is not None:
        result = tumour_locator.locate(image_path)
    if large_tumour_locator is not None:
        result = select_large_override(result, large_tumour_locator.propose(image_path))
    return result


def draw_candidates(image_path: Path, candidates: list[dict], output_path: Path, count: int = 5) -> None:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Cannot read image: {image_path}")
    for number, candidate in enumerate(candidates[:count], 1):
        left, top, right, bottom = (round(v) for v in candidate["box"])
        color = (0, 230, 0) if number == 1 else (0, 175, 255)
        cv2.rectangle(image, (left, top), (right, bottom), color, 2)
        cv2.circle(image, (round(candidate["x"]), round(candidate["y"])), 3, color, -1)
        cv2.putText(image, f"{number}: {candidate['detector_score']:.2f}",
                    (left, max(18, top - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), image):
        raise OSError(f"Could not write overlay: {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Locate nodule candidates in a CT slice")
    parser.add_argument("image", type=Path, help="PNG or JPEG CT slice")
    parser.add_argument("--weights", type=Path, default=DEFAULT_WEIGHTS)
    parser.add_argument("--overlay", type=Path, help="Save an image with the top candidates marked")
    parser.add_argument("--min-score", type=float, default=0.01)
    parser.add_argument("--ensemble", action="store_true", help="Use all ten LUNA16 folds")
    args = parser.parse_args()
    if not 0 < args.min_score <= 1:
        parser.error("--min-score must be between 0 and 1")
    locator = EnsembleLocator() if args.ensemble else NoduleLocator(args.weights)
    prediction = locator.predict(args.image, min_score=args.min_score)
    if args.overlay:
        draw_candidates(args.image, prediction["candidates"], args.overlay)
        prediction["overlay"] = str(args.overlay.resolve())
    print(json.dumps(prediction, indent=2))


if __name__ == "__main__":
    main()
