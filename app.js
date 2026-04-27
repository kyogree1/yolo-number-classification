// ==========================================
// 1. INISIALISASI ELEMEN
// ==========================================
const paintCanvas = document.getElementById('paint-canvas');
const ctx = paintCanvas.getContext('2d');
const predictBtn = document.getElementById('predict-btn');
const imageInput = document.getElementById('image-input');

// Elemen Hasil
const statusText = document.getElementById('status-text').querySelector('span:nth-child(2)');
const statusDot = document.getElementById('status-dot');
const predictionLabel = document.getElementById('prediction-label');
const predictionConfidence = document.getElementById('prediction-confidence');
const logArea = document.getElementById('log-area');

function addLog(message) {
    const p = document.createElement('div');
    p.className = 'log-line';
    p.innerText = message;
    logArea.appendChild(p);
    logArea.scrollTop = logArea.scrollHeight; // Auto-scroll ke bawah
}

// ==========================================
// 2. LOGIKA DRAWING CANVAS (PAPAN TULIS)
// ==========================================
let isDrawing = false;

// UBAH KE HITAM: Pastikan background hitam agar sesuai dengan dataset model
function resetCanvasBackground() {
    ctx.fillStyle = "#000000"; 
    ctx.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
}
resetCanvasBackground();

// UBAH KE PUTIH & LEBIH TEBAL: Pengaturan Kuas
ctx.strokeStyle = "#ffffff"; 
ctx.lineWidth = 18;          
ctx.lineCap = "round";       
ctx.lineJoin = "round";      

function startPosition(e) {
    isDrawing = true;
    ctx.beginPath(); // PENTING: Memulai garis baru
    draw(e);
}

function endPosition() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.beginPath(); // Memutus garis sebelumnya
    predictBtn.disabled = false; // Nyalakan tombol karena ada coretan
}

function draw(e) {
    if (!isDrawing) return;
    
    // Dapatkan posisi kanvas di layar
    const rect = paintCanvas.getBoundingClientRect();
    
    let clientX, clientY;
    
    // Cek apakah ini sentuhan jari (Touch) atau Mouse
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}

// Event Listener untuk Mouse
paintCanvas.addEventListener('mousedown', startPosition);
paintCanvas.addEventListener('mouseup', endPosition);
paintCanvas.addEventListener('mousemove', draw);
paintCanvas.addEventListener('mouseout', endPosition);

// Event Listener untuk Touch (Layar Sentuh/HP)
paintCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Cegah layar ikut ke-scroll
    startPosition(e);
}, { passive: false });

paintCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    endPosition();
}, { passive: false });

paintCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
}, { passive: false });

// Tombol Hapus Papan
window.clearCanvas = function() {
    resetCanvasBackground();
    predictBtn.disabled = true; 
    predictionLabel.innerText = "Belum ada prediksi";
    predictionLabel.style.color = "var(--army-900)";
    predictionConfidence.innerText = "Confidence: -";
    addLog("[INFO] Papan tulis dibersihkan.");
};


// ==========================================
// 3. LOGIKA UPLOAD & DRAG-DROP GAMBAR
// ==========================================
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const previewPlaceholder = document.getElementById('preview-placeholder');
const uploadArea = document.getElementById('upload-area'); // Tangkap elemen area upload

// Fungsi untuk memproses gambar (bisa dipakai oleh klik maupun drag-drop)
function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert("Tolong masukkan file gambar yang valid!");
        return;
    }

    predictBtn.disabled = false;
    document.getElementById('file-name').innerText = `Sumber: ${file.name}`;
    document.getElementById('file-size').innerText = `Ukuran: ${(file.size / 1024).toFixed(1)} KB`;
    document.getElementById('file-type').innerText = `Tipe: ${file.type}`;

    // Tampilkan ke dalam Preview Canvas
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            previewPlaceholder.style.display = 'none';
            previewCanvas.style.display = 'block';
            
            // Sesuaikan ukuran preview
            const maxSize = 150;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxSize) { height *= maxSize / width; width = maxSize; }
            } else {
                if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            }
            previewCanvas.width = width;
            previewCanvas.height = height;
            previewCtx.drawImage(img, 0, 0, width, height);
            addLog(`[INFO] Gambar ${file.name} dimuat.`);
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

// 1. Event Listener kalau klik manual (Browse File)
imageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    handleImageFile(file);
});

// 2. Event Listener untuk Drag & Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault(); // Wajib! Mencegah browser membuka gambar di tab baru
    uploadArea.classList.add('dragover'); // Tambah efek visual CSS
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover'); // Hapus efek visual
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');

    // Ambil file yang dijatuhkan
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        
        // Trik: Memasukkan file hasil drop ke dalam <input type="file">
        // Agar logika tombol Predict di bawahnya tidak perlu diubah
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;

        // Panggil fungsi preview
        handleImageFile(file);
    }
});


// ==========================================
// 4. LOGIKA PENGIRIMAN KE BACKEND YOLOV8
// ==========================================
predictBtn.addEventListener('click', async () => {
    // Tentukan mode apa yang sedang aktif (Upload atau Draw)
    const isUploadActive = document.querySelector('.tab-btn:nth-child(1)').classList.contains('active');
    let formData = new FormData();

    if (isUploadActive) {
        if (imageInput.files.length === 0) {
            alert("Pilih file gambar terlebih dahulu!");
            return;
        }
        formData.append('file', imageInput.files[0]);
        addLog(`[INFO] Mengirim gambar via Upload...`);
    } else {
        addLog("[INFO] Menyiapkan gambar dari kanvas...");
        // Ambil gambar dari papan tulis
        const canvasBlob = await new Promise(resolve => {
            paintCanvas.toBlob(resolve, 'image/jpeg', 1.0);
        });
        formData.append('file', canvasBlob, 'canvas-digit.jpg');
    }

    // Ubah status antarmuka menjadi "Loading"
    predictBtn.disabled = true;
    statusDot.classList.add('loading');
    statusText.innerText = "Memproses dengan YOLOv8...";
    
    try {
        // Tembak ke API Flask Backend Anda
        const response = await fetch('http://localhost:5000/predict', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        
        if (result.error) throw new Error(result.error);

        // Update Hasil Klasifikasi di Web
        predictionLabel.innerText = `Angka: ${result.label}`;
        predictionLabel.style.color = 'var(--army-900)';
        
        const confPercent = (result.confidence * 100).toFixed(2);
        predictionConfidence.innerText = `Confidence: ${confPercent}%`;
        
        addLog(`[SUCCESS] Deteksi Selesai: Angka ${result.label} (${confPercent}%)`);

    } catch (error) {
        console.error("Terjadi Kesalahan:", error);
        predictionLabel.innerText = "Gagal memproses";
        predictionLabel.style.color = "#a35c4c";
        predictionConfidence.innerText = "Pastikan terminal Flask menyala.";
        addLog(`[ERROR] ${error.message}`);
    } finally {
        predictBtn.disabled = false;
        statusDot.classList.remove('loading');
        statusText.innerText = "Selesai.";
    }
});