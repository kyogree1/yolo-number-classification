from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import importlib
from pathlib import Path

app = Flask(__name__)
CORS(app)

model = None
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / 'ModelMalwareLegitHengker2025.pt'

BACKGROUND_THRESHOLD = 190
RESAMPLE_FILTER = Image.Resampling.LANCZOS if hasattr(Image, 'Resampling') else Image.LANCZOS


def preprocess_to_black_background(image: Image.Image, target_size: int = 280) -> Image.Image:
    """Normalisasi gambar agar latar belakang hitam untuk input YOLOv8."""
    image_rgb = image.convert('RGB')
    image_resized = image_rgb.resize((target_size, target_size), RESAMPLE_FILTER)

    pixels = image_resized.load()
    width, height = image_resized.size

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            luminance = (0.299 * r) + (0.587 * g) + (0.114 * b)

            if luminance >= BACKGROUND_THRESHOLD:
                pixels[x, y] = (0, 0, 0)

    return image_resized


def parse_prediction(result):
    """Ekstrak label dan confidence dari mode klasifikasi atau deteksi."""
    if hasattr(result, 'probs') and result.probs is not None:
        top_class_id = result.probs.top1
        confidence = float(result.probs.top1conf)
        class_name = result.names[top_class_id]
        return class_name, confidence

    if len(result.boxes) > 0:
        box = result.boxes[0]
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])
        class_name = result.names[class_id]
        return class_name, confidence

    return 'Tidak terdeteksi', 0.0


def get_model():
    """Load model YOLO secara lazy agar import aman pada environment editor."""
    global model

    if model is not None:
        return model

    try:
        yolo_class = importlib.import_module('ultralytics').YOLO
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Paket 'ultralytics' belum terpasang. Jalankan: pip install ultralytics"
        ) from exc

    if not MODEL_PATH.exists():
        raise RuntimeError(f"File model tidak ditemukan di: {MODEL_PATH}")

    model = yolo_class(str(MODEL_PATH))
    return model

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'Tidak ada file yang dikirim'}), 400
        
    file = request.files['file']
    
    try:
        image = Image.open(io.BytesIO(file.read()))
        processed_image = preprocess_to_black_background(image)

        yolo_model = get_model()
        results = yolo_model.predict(processed_image, conf=0.25)
        result = results[0]
        class_name, confidence = parse_prediction(result)

        return jsonify({
            'label': str(class_name),
            'confidence': round(confidence, 4)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)