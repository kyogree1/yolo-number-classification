const API_URL = 'http://localhost:5000/predict';
const PREVIEW_MAX_SIZE = 150;
const MODEL_INPUT_SIZE = 280;
const BACKGROUND_THRESHOLD = 190;

const elements = {
    paintCanvas: document.getElementById('paint-canvas'),
    predictBtn: document.getElementById('predict-btn'),
    imageInput: document.getElementById('image-input'),
    statusText: document.getElementById('status-text').querySelector('span:nth-child(2)'),
    statusDot: document.getElementById('status-dot'),
    predictionLabel: document.getElementById('prediction-label'),
    predictionConfidence: document.getElementById('prediction-confidence'),
    logArea: document.getElementById('log-area'),
    previewCanvas: document.getElementById('preview-canvas'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    fileName: document.getElementById('file-name'),
    fileSize: document.getElementById('file-size'),
    fileType: document.getElementById('file-type')
};

const paintCtx = elements.paintCanvas.getContext('2d');
const previewCtx = elements.previewCanvas.getContext('2d');

const state = {
    isDrawing: false,
    uploadPreparedBlob: null,
    uploadPreparedFilename: null
};

function addLog(message) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerText = message;
    elements.logArea.appendChild(line);
    elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

function setStatus(message, isLoading) {
    elements.statusText.innerText = message;
    elements.statusDot.classList.toggle('loading', isLoading);
}

function resetPredictionResult() {
    elements.predictionLabel.innerText = 'Belum ada prediksi';
    elements.predictionLabel.style.color = 'var(--army-900)';
    elements.predictionConfidence.innerText = 'Confidence: -';
}

function resetPaintCanvasBackground() {
    paintCtx.fillStyle = '#000000';
    paintCtx.fillRect(0, 0, elements.paintCanvas.width, elements.paintCanvas.height);
}

function setupPaintCanvas() {
    resetPaintCanvasBackground();
    paintCtx.strokeStyle = '#ffffff';
    paintCtx.lineWidth = 18;
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';

    elements.paintCanvas.addEventListener('mousedown', startDrawing);
    elements.paintCanvas.addEventListener('mouseup', endDrawing);
    elements.paintCanvas.addEventListener('mousemove', drawStroke);
    elements.paintCanvas.addEventListener('mouseout', endDrawing);

    elements.paintCanvas.addEventListener('touchstart', (event) => {
        event.preventDefault();
        startDrawing(event);
    }, { passive: false });

    elements.paintCanvas.addEventListener('touchend', (event) => {
        event.preventDefault();
        endDrawing();
    }, { passive: false });

    elements.paintCanvas.addEventListener('touchmove', (event) => {
        event.preventDefault();
        drawStroke(event);
    }, { passive: false });
}

function getCanvasPoint(event) {
    const rect = elements.paintCanvas.getBoundingClientRect();
    const point = event.touches && event.touches.length > 0 ? event.touches[0] : event;

    return {
        x: point.clientX - rect.left,
        y: point.clientY - rect.top
    };
}

function startDrawing(event) {
    state.isDrawing = true;
    paintCtx.beginPath();
    drawStroke(event);
}

function endDrawing() {
    if (!state.isDrawing) {
        return;
    }

    state.isDrawing = false;
    paintCtx.beginPath();
    elements.predictBtn.disabled = false;
}

function drawStroke(event) {
    if (!state.isDrawing) {
        return;
    }

    const point = getCanvasPoint(event);
    paintCtx.lineTo(point.x, point.y);
    paintCtx.stroke();
    paintCtx.beginPath();
    paintCtx.moveTo(point.x, point.y);
}

function resizeContain(sourceWidth, sourceHeight, maxSize) {
    let width = sourceWidth;
    let height = sourceHeight;

    if (width <= maxSize && height <= maxSize) {
        return { width, height };
    }

    if (width > height) {
        height *= maxSize / width;
        width = maxSize;
    } else {
        width *= maxSize / height;
        height = maxSize;
    }

    return { width, height };
}

function drawImageOnBlackCanvas(ctx, canvas, image, targetSize) {
    canvas.width = targetSize;
    canvas.height = targetSize;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const fit = resizeContain(image.width, image.height, targetSize);
    const offsetX = (targetSize - fit.width) / 2;
    const offsetY = (targetSize - fit.height) / 2;
    ctx.drawImage(image, offsetX, offsetY, fit.width, fit.height);
}

function forceBlackBackground(ctx, canvas) {
    // Piksel terang dianggap background, lalu diubah jadi hitam penuh.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luminance >= BACKGROUND_THRESHOLD) {
            pixels[i] = 0;
            pixels[i + 1] = 0;
            pixels[i + 2] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Gagal membuat data gambar dari canvas.'));
                return;
            }

            resolve(blob);
        }, type, quality);
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('Gagal membaca file upload.'));
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Format gambar tidak valid atau rusak.'));
        image.src = src;
    });
}

async function prepareUploadImage(file) {
    const dataUrl = await readFileAsDataURL(file);
    const image = await loadImage(dataUrl);

    const processingCanvas = document.createElement('canvas');
    const processingCtx = processingCanvas.getContext('2d');

    drawImageOnBlackCanvas(processingCtx, processingCanvas, image, MODEL_INPUT_SIZE);
    forceBlackBackground(processingCtx, processingCanvas);

    const preparedBlob = await canvasToBlob(processingCanvas, 'image/jpeg', 1.0);
    state.uploadPreparedBlob = preparedBlob;
    state.uploadPreparedFilename = `processed-${file.name.replace(/\s+/g, '-').toLowerCase()}.jpg`;

    drawPreviewFromCanvas(processingCanvas);
}

function drawPreviewFromCanvas(sourceCanvas) {
    const fit = resizeContain(sourceCanvas.width, sourceCanvas.height, PREVIEW_MAX_SIZE);

    elements.previewCanvas.width = fit.width;
    elements.previewCanvas.height = fit.height;
    previewCtx.clearRect(0, 0, fit.width, fit.height);
    previewCtx.drawImage(sourceCanvas, 0, 0, fit.width, fit.height);

    elements.previewPlaceholder.style.display = 'none';
    elements.previewCanvas.style.display = 'block';
}

function bindUploadHandler() {
    elements.imageInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        try {
            await prepareUploadImage(file);
            elements.predictBtn.disabled = false;
            resetPredictionResult();

            elements.fileName.innerText = `Sumber: ${file.name}`;
            elements.fileSize.innerText = `Ukuran: ${(file.size / 1024).toFixed(1)} KB`;
            elements.fileType.innerText = `Tipe: ${file.type}`;

            addLog(`[INFO] Gambar ${file.name} dimuat dan background diubah menjadi hitam.`);
        } catch (error) {
            addLog(`[ERROR] ${error.message}`);
            alert(error.message);
        }
    });
}

async function createPayloadForCurrentMode() {
    const isUploadActive = document.querySelector('.tab-btn:nth-child(1)').classList.contains('active');
    const formData = new FormData();

    if (isUploadActive) {
        if (!state.uploadPreparedBlob) {
            throw new Error('Pilih file gambar terlebih dahulu!');
        }

        formData.append('file', state.uploadPreparedBlob, state.uploadPreparedFilename || 'processed-upload.jpg');
        addLog('[INFO] Mengirim gambar upload (sudah diproses ke background hitam)...');
        return formData;
    }

    addLog('[INFO] Menyiapkan gambar dari papan tulis...');
    const canvasBlob = await canvasToBlob(elements.paintCanvas, 'image/jpeg', 1.0);
    formData.append('file', canvasBlob, 'canvas-digit.jpg');
    return formData;
}

function bindPredictHandler() {
    elements.predictBtn.addEventListener('click', async () => {
        try {
            const payload = await createPayloadForCurrentMode();
            elements.predictBtn.disabled = true;
            setStatus('Memproses dengan YOLOv8...', true);

            const response = await fetch(API_URL, {
                method: 'POST',
                body: payload
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            if (result.error) {
                throw new Error(result.error);
            }

            const confidencePercent = (result.confidence * 100).toFixed(2);
            elements.predictionLabel.innerText = `Angka: ${result.label}`;
            elements.predictionLabel.style.color = 'var(--army-900)';
            elements.predictionConfidence.innerText = `Confidence: ${confidencePercent}%`;
            addLog(`[SUCCESS] Deteksi selesai: Angka ${result.label} (${confidencePercent}%)`);
        } catch (error) {
            console.error('Terjadi kesalahan:', error);
            elements.predictionLabel.innerText = 'Gagal memproses';
            elements.predictionLabel.style.color = '#a35c4c';
            elements.predictionConfidence.innerText = 'Pastikan terminal Flask menyala.';
            addLog(`[ERROR] ${error.message}`);
        } finally {
            elements.predictBtn.disabled = false;
            setStatus('Selesai.', false);
        }
    });
}

window.clearCanvas = function clearCanvas() {
    resetPaintCanvasBackground();
    elements.predictBtn.disabled = true;
    resetPredictionResult();
    addLog('[INFO] Papan tulis dibersihkan.');
};

function initialize() {
    setupPaintCanvas();
    bindUploadHandler();
    bindPredictHandler();
}

initialize();