from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
from PIL import Image, ImageOps, ImageStat # <-- Tambahkan ImageOps dan ImageStat
import io

app = Flask(__name__)
CORS(app)

model = YOLO('ModelMalwareLegitHengker2025.pt') 

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({"error": "Tidak ada file yang dikirim"}), 400
        
    file = request.files['file']
    
    try:
        # Buka gambar
        image = Image.open(io.BytesIO(file.read())).convert('RGB')
        
        # ==========================================
        # TAMBAHAN AUTO-INVERT UNTUK GAMBAR UPLOAD
        # ==========================================
        # Ubah sementara ke Grayscale untuk ngecek kecerahan
        grayscale_img = image.convert('L')
        stat = ImageStat.Stat(grayscale_img)
        avg_brightness = stat.mean[0] # Rata-rata pixel (0 = gelap, 255 = putih terang)
        
        # Kalau gambarnya terang (kemungkinan foto kertas putih dengan tinta hitam)
        if avg_brightness > 127:
            # Balik warnanya! Background jadi hitam, tulisan jadi putih
            image = ImageOps.invert(image)
        # ==========================================
        
        # Jalankan prediksi dengan YOLOv8
        results = model.predict(image, conf=0.25)
        
        # Ekstrak hasil
        result = results[0]
        
        if hasattr(result, 'probs') and result.probs is not None:
            top_class_id = result.probs.top1
            confidence = float(result.probs.top1conf)
            class_name = result.names[top_class_id]
        elif len(result.boxes) > 0:
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