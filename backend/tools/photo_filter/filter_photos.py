import argparse
import json
import sys
import urllib.request

try:
    import cv2
    import numpy as np
except ImportError:
    sys.stderr.write("opencv or numpy not available; skipping vision filter.\n")
    print("{}")
    sys.exit(0)


def download_image(url: str, timeout: float = 4.0, retries: int = 1):
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                return resp.read()
        except Exception:
            if attempt >= retries:
                return None
    return None


def analyze_image(data, blur_threshold: float):
    img_array = np.asarray(bytearray(data), dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    image_area = float(img.shape[0] * img.shape[1]) if img is not None else 1.0

    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40)) if not face_cascade.empty() else []

    face_max_frac = 0.0
    for (_, _, w, h) in faces:
        face_area = float(w * h)
        face_max_frac = max(face_max_frac, face_area / image_area)

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_portrait = face_max_frac >= 0.22
    is_blurry = blur_score < blur_threshold

    return {
        "faceMaxFrac": face_max_frac,
        "faceCount": int(len(faces)),
        "blurScore": blur_score,
        "isPortrait": bool(is_portrait),
        "isBlurry": bool(is_blurry),
    }


def main():
    parser = argparse.ArgumentParser(description="Filter photos by face prominence and blur")
    parser.add_argument("--blur-threshold", type=float, default=60.0)
    args = parser.parse_args()

    try:
        payload = sys.stdin.read()
        items = json.loads(payload or "[]")
    except Exception:
        print("{}")
        return

    results = {}
    for item in items:
        photo_id = item.get("id")
        url = item.get("url")
        if not photo_id or not url:
            continue
        data = download_image(url, timeout=4.0, retries=1)
        if data is None:
            continue
        analysis = analyze_image(data, args.blur_threshold)
        if analysis is None:
            continue
        results[photo_id] = analysis

    print(json.dumps(results))


if __name__ == "__main__":
    main()
