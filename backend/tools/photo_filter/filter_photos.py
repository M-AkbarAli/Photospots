import argparse
import json
import sys
import urllib.request
import traceback

try:
    import cv2
    import numpy as np
    CV_AVAILABLE = True
except ImportError as e:
    sys.stderr.write(f"opencv or numpy not available: {e}\n")
    print("{}")
    sys.exit(0)


def download_image(url: str, timeout: float = 4.0, retries: int = 1):
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:
            if attempt >= retries:
                sys.stderr.write(f"Failed to download {url}: {e}\n")
                return None
    return None


def detect_animals(img, gray, image_area):
    """
    Detect animals using eye detection and texture analysis.
    Returns (has_animal: bool, confidence: float)
    """
    height, width = img.shape[:2]
    
    # Try eye detection (works for many animals)
    try:
        eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
        if not eye_cascade.empty():
            eyes = eye_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(10, 10))
            
            # If we detect 2 eyes that are roughly horizontally aligned, might be an animal
            if len(eyes) >= 2:
                # Check if eyes are in pairs (horizontally close)
                for i, (x1, y1, w1, h1) in enumerate(eyes):
                    for j, (x2, y2, w2, h2) in enumerate(eyes[i+1:], i+1):
                        # Check if roughly same y-coordinate (horizontal alignment)
                        y_diff = abs(y1 - y2)
                        x_dist = abs(x1 - x2)
                        if y_diff < h1 * 0.5 and 20 < x_dist < width * 0.4:
                            # Found eye pair - likely animal or person
                            eye_region_area = (w1 * h1 + w2 * h2) / image_area
                            if eye_region_area > 0.002:  # Small eyes = animal
                                return True, 0.7
    except Exception as e:
        sys.stderr.write(f"Eye detection failed: {e}\n")
    
    # Check for fur/feather texture patterns
    # Animals typically have high-frequency texture in localized regions
    try:
        # Apply Sobel edge detection to find texture
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        magnitude = np.sqrt(sobelx**2 + sobely**2)
        
        # Divide image into regions and check for localized high-texture areas
        h_third, w_third = height // 3, width // 3
        max_texture_density = 0.0
        
        for i in range(3):
            for j in range(3):
                region = magnitude[i*h_third:(i+1)*h_third, j*w_third:(j+1)*w_third]
                texture_density = np.mean(region > 20)  # Threshold for edge strength
                max_texture_density = max(max_texture_density, texture_density)
        
        # High localized texture = fur/feathers
        if max_texture_density > 0.3:
            return True, 0.5
            
    except Exception as e:
        sys.stderr.write(f"Texture analysis failed: {e}\n")
    
    # Check for small foreground subjects (common with wildlife photos)
    try:
        # Use GrabCut or simple thresholding to detect foreground
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            area_frac = area / image_area
            
            # Small to medium foreground object (5-30% of image)
            if 0.05 < area_frac < 0.3:
                # Check compactness (animals are often compact shapes)
                perimeter = cv2.arcLength(contour, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter ** 2)
                    # Animals and birds tend to have circularity between 0.3-0.8
                    if 0.3 < circularity < 0.8:
                        return True, 0.6
                        
    except Exception as e:
        sys.stderr.write(f"Contour analysis failed: {e}\n")
    
    return False, 0.0


def analyze_image(data, blur_threshold: float):
    try:
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

        # Detect animals (birds, wildlife, etc.)
        has_animal, animal_confidence = detect_animals(img, gray, image_area)

        # Determine if this is a "people photo" - VERY strict
        is_portrait = (
            face_max_frac >= 0.03 or           # Any face taking 3%+ of image
            total_face_frac >= 0.05 or         # Multiple small faces totaling 5%+
            total_face_count >= 2 or           # 2+ faces detected
            total_body_frac >= 0.15 or         # Body taking 15%+ of image
            total_body_count >= 2 or           # 2+ bodies detected
            (skin_frac >= 0.12 and total_face_count >= 1) or  # Significant skin + any face
            (skin_frac >= 0.20) or             # Very high skin content (likely close-up of person)
            (has_animal and animal_confidence > 0.5)  # Animal detected with confidence
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
            "hasAnimal": bool(has_animal),
            "animalConfidence": float(animal_confidence),
            "isPortrait": bool(is_portrait),
            "isBlurry": bool(is_blurry),
        }
    except Exception as e:
        sys.stderr.write(f"Image analysis failed: {e}\n")
        traceback.print_exc(file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description="Filter photos by face/animal prominence and blur")
    parser.add_argument("--blur-threshold", type=float, default=60.0)
    args = parser.parse_args()

    try:
        payload = sys.stdin.read()
        items = json.loads(payload or "[]")
        sys.stderr.write(f"Processing {len(items)} photos...\n")
    except Exception as e:
        sys.stderr.write(f"Failed to parse input: {e}\n")
        print("{}")
        return

    results = {}
    processed = 0
    failed = 0
    
    for item in items:
        photo_id = item.get("id")
        url = item.get("url")
        if not photo_id or not url:
            continue
            
        data = download_image(url, timeout=4.0, retries=1)
        if data is None:
            failed += 1
            continue
            
        analysis = analyze_image(data, args.blur_threshold)
        if analysis is None:
            failed += 1
            continue
            
        results[photo_id] = analysis
        processed += 1

    sys.stderr.write(f"Processed: {processed}, Failed: {failed}\n")
    print(json.dumps(results))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"Fatal error in main: {e}\n")
        traceback.print_exc(file=sys.stderr)
        print("{}")
