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
    height, width = img.shape[:2]
    image_area = float(height * width)

    # Load multiple cascades for better human detection
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    profile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    upper_body_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_upperbody.xml")
    full_body_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_fullbody.xml")

    # Detect frontal faces (very sensitive)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=2, minSize=(20, 20)) if not face_cascade.empty() else []
    
    # Detect profile faces (catches side views)
    profiles = profile_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=2, minSize=(20, 20)) if not profile_cascade.empty() else []
    
    # Also check flipped image for profiles facing the other way
    gray_flipped = cv2.flip(gray, 1)
    profiles_flipped = profile_cascade.detectMultiScale(gray_flipped, scaleFactor=1.05, minNeighbors=2, minSize=(20, 20)) if not profile_cascade.empty() else []
    
    # Detect upper bodies (catches people without clear face)
    upper_bodies = upper_body_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=2, minSize=(40, 40)) if not upper_body_cascade.empty() else []
    
    # Detect full bodies
    full_bodies = full_body_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=2, minSize=(40, 80)) if not full_body_cascade.empty() else []

    # Calculate total human presence
    total_face_area = 0.0
    face_max_frac = 0.0
    
    for detections in [faces, profiles, profiles_flipped]:
        for (_, _, w, h) in detections:
            face_area = float(w * h)
            total_face_area += face_area
            face_max_frac = max(face_max_frac, face_area / image_area)
    
    total_body_area = 0.0
    for detections in [upper_bodies, full_bodies]:
        for (_, _, w, h) in detections:
            body_area = float(w * h)
            total_body_area += body_area

    total_face_frac = total_face_area / image_area
    total_body_frac = total_body_area / image_area
    
    total_face_count = len(faces) + len(profiles) + len(profiles_flipped)
    total_body_count = len(upper_bodies) + len(full_bodies)

    # Skin tone detection (catches people even without face detection)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Multiple skin tone ranges to catch diverse skin colors
    skin_mask1 = cv2.inRange(hsv, np.array([0, 20, 70]), np.array([20, 255, 255]))
    skin_mask2 = cv2.inRange(hsv, np.array([0, 10, 60]), np.array([25, 150, 255]))
    skin_mask = cv2.bitwise_or(skin_mask1, skin_mask2)
    skin_pixels = cv2.countNonZero(skin_mask)
    skin_frac = skin_pixels / image_area

    # Blur detection
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    
    # Edge density - photos of locations typically have lots of edges (buildings, structures)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = cv2.countNonZero(edges) / image_area

    # Determine if this is a "people photo" - VERY strict
    is_portrait = (
        face_max_frac >= 0.03 or           # Any face taking 3%+ of image
        total_face_frac >= 0.05 or         # Multiple small faces totaling 5%+
        total_face_count >= 2 or           # 2+ faces detected
        total_body_frac >= 0.15 or         # Body taking 15%+ of image
        total_body_count >= 2 or           # 2+ bodies detected
        (skin_frac >= 0.12 and total_face_count >= 1) or  # Significant skin + any face
        (skin_frac >= 0.20)                # Very high skin content (likely close-up of person)
    )
    
    is_blurry = blur_score < blur_threshold

    return {
        "faceMaxFrac": face_max_frac,
        "totalFaceFrac": total_face_frac,
        "faceCount": total_face_count,
        "bodyCount": total_body_count,
        "totalBodyFrac": total_body_frac,
        "skinFrac": skin_frac,
        "edgeDensity": edge_density,
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
