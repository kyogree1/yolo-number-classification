from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
from PIL import Image
import io

app = Flask(__name__)
CORS(app) # Mengizinkan frontend (HTML) mengakses API ini

# Load model YOLOv8 Anda
# Ganti 'best.pt' dengan lokasi/nama file model .pt Anda
model = YOLO('ModelMalwareLegitHengker2025.pt') 

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({"error": "Tidak ada file yang dikirim"}), 400
        
    file = request.files['file']
    
    try:
        # Buka gambar menggunakan Pillow
        image = Image.open(io.BytesIO(file.read())).convert('RGB')
        
        # Jalankan prediksi dengan YOLOv8
        results = model.predict(image, conf=0.25) # Sesuaikan confidence threshold jika perlu
        
        # Ekstrak hasil (Asumsi model adalah Klasifikasi)
        # Jika Anda melatih model Deteksi Objek (Bounding Box), logikanya sedikit berbeda
        result = results[0]
        
        if hasattr(result, 'probs') and result.probs is not None:
            # Mode Klasifikasi YOLOv8 (yolov8-cls)
            top_class_id = result.probs.top1
            confidence = float(result.probs.top1conf)
            class_name = result.names[top_class_id]
        elif len(result.boxes) > 0:
            # Mode Deteksi YOLOv8 (yolov8)
            box = result.boxes[0]
            class_id = int(box.cls[0])
            confidence = float(box.conf[0])
            class_name = result.names[class_id]
        else:
            return jsonify({"label": "Tidak terdeteksi", "confidence": 0})

        return jsonify({
            "label": str(class_name),
            "confidence": round(confidence, 4)
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)