const App = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.stream = null;
    },

    cacheDOM() {
        this.screens = {
            welcome: document.getElementById('welcome-screen'),
            analysis: document.getElementById('analysis-screen'),
            loading: document.getElementById('loading-screen'),
            results: document.getElementById('results-screen')
        };

        this.btns = {
            start: document.getElementById('start-btn'),
            capture: document.getElementById('capture-btn'),
            analyze: document.getElementById('analyze-btn'),
            retake: document.getElementById('retake-btn'),
            reset: document.getElementById('reset-btn'),
            uploadTrigger: document.getElementById('upload-trigger-btn')
        };

        this.fileInput = document.getElementById('image-upload');

        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('photo-canvas');
        this.preview = document.getElementById('captured-preview');
        this.loadingText = document.getElementById('loading-text');
        this.progressFill = document.querySelector('.progress-fill');
        this.resultPhoto = document.getElementById('result-photo');
        this.resultOverlay = document.getElementById('result-overlay');
    },

    bindEvents() {
        this.btns.start.addEventListener('click', () => this.switchScreen('analysis', () => this.startCamera()));
        this.btns.capture.addEventListener('click', () => this.capturePhoto());
        this.btns.retake.addEventListener('click', () => this.retakePhoto());
        this.btns.analyze.addEventListener('click', () => this.runAnalysis());
        this.btns.reset.addEventListener('click', () => this.resetApp());
        this.btns.uploadTrigger.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    },

    switchScreen(target, callback) {
        Object.values(this.screens).forEach(screen => screen.classList.remove('active'));
        this.screens[target].classList.add('active');
        if (callback) callback();
    },

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1440 } } 
            });
            this.video.srcObject = this.stream;
        } catch (err) {
            alert('Camera access is required for skin analysis. Please enable permissions.');
            console.error(err);
        }
    },

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    },

    capturePhoto() {
        const context = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        context.drawImage(this.video, 0, 0);

        const dataUrl = this.canvas.toDataURL('image/jpeg');
        this.preview.style.backgroundImage = `url(${dataUrl})`;
        this.preview.style.display = 'block';
        this.resultPhoto.style.backgroundImage = `url(${dataUrl})`;

        this.btns.capture.style.display = 'none';
        this.btns.retake.style.display = 'inline-block';
        this.btns.analyze.style.display = 'inline-block';
    },

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const context = this.canvas.getContext('2d');
                this.canvas.width = img.width;
                this.canvas.height = img.height;
                context.drawImage(img, 0, 0);

                const dataUrl = this.canvas.toDataURL('image/jpeg');
                this.preview.style.backgroundImage = `url(${dataUrl})`;
                this.preview.style.display = 'block';
                this.resultPhoto.style.backgroundImage = `url(${dataUrl})`;

                this.btns.capture.style.display = 'none';
                this.btns.uploadTrigger.style.display = 'none';
                this.btns.retake.style.display = 'inline-block';
                this.btns.analyze.style.display = 'inline-block';
                
                this.stopCamera();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    },

    retakePhoto() {
        this.preview.style.display = 'none';
        this.btns.capture.style.display = 'block';
        this.btns.uploadTrigger.style.display = 'block';
        this.btns.retake.style.display = 'none';
        this.btns.analyze.style.display = 'none';
        this.fileInput.value = ''; // Clear file input
        this.startCamera();
    },

    // --- API Configuration ---
    CONFIG: {
        API_KEY: 'sk-J04QHHpH_0XV4umtvpG_6NEZJDJWR0nUFPYDpsdUVmU4ba1m9iqlFj9y8LfpxOY7', 
        BASE_URL: 'https://yce-api-01.makeupar.com/s2s/v2.1'
    },

    async runAnalysis() {
        if (this.CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
            alert('Please configure your API Key in app.js first.');
            this.switchScreen('analysis');
            return;
        }

        this.switchScreen('loading');
        this.stopCamera();

        try {
            // Step 1 & 2: Get Blob from Canvas and Initialize File Upload
            this.updateLoadingStatus("Preparing image...", 10);
            const blob = await this.getCanvasBlob();
            const fileName = `skin_analysis_${Date.now()}.png`;

            this.updateLoadingStatus("Initializing upload...", 25);
            const initResponse = await fetch(`${this.CONFIG.BASE_URL}/file/skin-analysis`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: [{
                        content_type: "image/png",
                        file_name: fileName,
                        file_size: blob.size
                    }]
                })
            });

            const initData = await initResponse.json();
            if (initData.status !== 200) throw new Error('Failed to initialize upload');

            const fileInfo = initData.data.files[0];
            const uploadUrl = fileInfo.requests[0].url;
            const fileId = fileInfo.file_id;

            // Step 4: Upload Image to Pre-signed URL
            this.updateLoadingStatus("Uploading to secure server...", 45);
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'image/png'
                    // Content-Length is set automatically by the browser for Blobs
                },
                body: blob
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                console.error('Upload Error:', errorText);
                throw new Error('Failed to upload image to secure storage');
            }

            // Step 5: Create AI Task
            this.updateLoadingStatus("Creating analysis task...", 65);
            const taskResponse = await fetch(`${this.CONFIG.BASE_URL}/task/skin-analysis`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    src_file_id: fileId,
                    dst_actions: ["wrinkle", "pore", "texture", "acne", "oiliness", "radiance", "eye_bag", "moisture"],
                    miniserver_args: {
                        enable_mask_overlay: true,
                        enable_dark_background_hd_pore: true,
                        color_dark_background_hd_pore: "3D3D3D",
                        opacity_dark_background_hd_pore: 0.4
                    },
                    format: "json",
                    pf_camera_kit: false
                })
            });

            const taskData = await taskResponse.json();
            if (taskData.status !== 200) {
                console.error('API Error Details:', taskData);
                throw new Error(`API Error: ${taskData.message || 'Failed to create task'}`);
            }

            const taskId = taskData.data.task_id;

            // Step 6: Poll Task Status
            this.updateLoadingStatus("AI is analyzing your skin...", 80);
            const results = await this.pollTaskStatus(taskId);
            
            // Step 7: Display Results
            this.displayResults(results);

        } catch (error) {
            console.error('Analysis Error:', error);
            alert(`Analysis failed: ${error.message}`);
            this.switchScreen('analysis');
        }
    },

    getCanvasBlob() {
        return new Promise(resolve => {
            const maxLongSide = 4096;
            const minShortSide = 480; // API requirement: at least 480px on short side
            
            const isUsingUploadedFile = this.preview.style.display === 'block';
            const source = isUsingUploadedFile ? this.canvas : this.video;
            
            let width = isUsingUploadedFile ? this.canvas.width : this.video.videoWidth;
            let height = isUsingUploadedFile ? this.canvas.height : this.video.videoHeight;
            
            let targetWidth = width;
            let targetHeight = height;

            // 1. Enforce Maximum (Downscale)
            if (width > height && width > maxLongSide) {
                targetWidth = maxLongSide;
                targetHeight = (height / width) * maxLongSide;
            } else if (height > width && height > maxLongSide) {
                targetHeight = maxLongSide;
                targetWidth = (width / height) * maxLongSide;
            }

            // 2. Enforce Minimum (Upscale if too small)
            const shortSide = Math.min(targetWidth, targetHeight);
            if (shortSide < minShortSide) {
                const scale = minShortSide / shortSide;
                targetWidth *= scale;
                targetHeight *= scale;
            }

            const resizeCanvas = document.createElement('canvas');
            resizeCanvas.width = targetWidth;
            resizeCanvas.height = targetHeight;
            const ctx = resizeCanvas.getContext('2d');
            
            // For better quality when upscaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

            resizeCanvas.toBlob(blob => resolve(blob), 'image/png');
        });
    },

    updateLoadingStatus(text, progress) {
        this.loadingText.innerText = text;
        this.progressFill.style.width = `${progress}%`;
    },

    async pollTaskStatus(taskId) {
        const poll = async (resolve, reject) => {
            try {
                const response = await fetch(`${this.CONFIG.BASE_URL}/task/skin-analysis/${taskId}`, {
                    headers: { 'Authorization': `Bearer ${this.CONFIG.API_KEY}` }
                });
                const data = await response.json();

                if (data.status === 200) {
                    const task = data.data;
                    const status = task.task_status || task.status; // Support both just in case

                    if (status === 'success') {
                        resolve(task.results.output);
                    } else if (status === 'error') {
                        const errorMsg = task.error || 'AI engine error';
                        // Provide user-friendly hint for common errors
                        if (errorMsg.includes('face_too_small')) {
                            reject(new Error('Face too small. Please move closer to the camera and ensure your face fills the guide.'));
                        } else {
                            reject(new Error(`AI Error: ${errorMsg}`));
                        }
                    } else {
                        // Still running, wait and poll again
                        setTimeout(() => poll(resolve, reject), 2000);
                    }
                } else {
                    reject(new Error(`Polling failed with status ${data.status}`));
                }
            } catch (err) {
                reject(err);
            }
        };

        return new Promise(poll);
    },

    displayResults(outputs) {
        const metricMap = {
            'pore': { label: 'Pores', rec: 'Use a clay mask once a week to deeply clean pores.', overlay: null },
            'texture': { label: 'Texture', rec: 'Exfoliate with a gentle AHA/BHA solution to smooth skin surface.', overlay: null },
            'acne': { label: 'Acne', rec: 'Apply benzoyl peroxide or salicylic acid to active spots.', overlay: null },
            'wrinkle': { label: 'Wrinkles', rec: 'Incorporate Retinol and SPF into your daily routine.', overlay: null },
            'moisture': { label: 'Hydration', rec: 'Use a hyaluronic acid serum and drink more water.', overlay: null },
            'oiliness': { label: 'Oiliness', rec: 'Use an oil-free moisturizer and blotting papers.', overlay: null },
            'radiance': { label: 'Radiance', rec: 'Add Vitamin C serum to your morning routine for glow.', overlay: null },
            'eye_bag': { label: 'Eye Bags', rec: 'Get enough sleep and use a caffeine-infused eye cream.', overlay: null }
        };

        let totalScore = 0;
        let count = 0;
        let recommendations = [];

        outputs.forEach(item => {
            const ui = metricMap[item.type];
            if (ui) {
                const score = item.ui_score;
                totalScore += score;
                count++;

                // Store overlay if available (Handle both single string and array from API)
                ui.overlay = (item.mask_urls && item.mask_urls[0]) || item.overlay_image_url || item.mask_image_url || null;

                const card = document.querySelector(`[data-metric="${item.type}"]`);
                if (card) {
                    const fill = card.querySelector('.fill');
                    const status = card.querySelector('.metric-status');
                    fill.style.width = `${score}%`;
                    status.innerText = this.getScoreStatus(score);
                    
                    if (score < 60) {
                        fill.classList.add('alert');
                        recommendations.push({ icon: '🧴', title: ui.label, text: ui.rec });
                    } else {
                        fill.classList.remove('alert');
                    }

                    // Add Hover Effect for Image Analysis
                    card.addEventListener('mouseenter', () => {
                        if (ui.overlay) {
                            this.resultOverlay.src = ui.overlay;
                            this.resultOverlay.classList.add('active');
                            card.classList.add('active');
                        }
                    });

                    card.addEventListener('mouseleave', () => {
                        this.resultOverlay.classList.remove('active');
                        card.classList.remove('active');
                    });
                }
            }
        });

        // Update Final Score
        const finalScore = Math.round(totalScore / count);
        document.querySelector('.score-value').innerText = finalScore;

        // Update Recommendations
        const recContainer = document.querySelector('.rec-list');
        if (recommendations.length > 0) {
            recContainer.innerHTML = recommendations.slice(0, 2).map(r => `
                <li>
                    <span class="rec-icon">${r.icon}</span>
                    <div class="rec-text">
                        <strong>${r.title} Support</strong>
                        <p>${r.text}</p>
                    </div>
                </li>
            `).join('');
        } else {
            recContainer.innerHTML = `
                <li>
                    <span class="rec-icon">✨</span>
                    <div class="rec-text">
                        <strong>Excellent Profile</strong>
                        <p>Your skin looks fantastic! Maintain your current routine and don't forget your SPF.</p>
                    </div>
                </li>
            `;
        }

        this.switchScreen('results');
    },

    getScoreStatus(score) {
        if (score > 85) return 'Excellent';
        if (score > 70) return 'Good';
        if (score > 50) return 'Fair';
        return 'Needs Attention';
    },

    resetApp() {
        this.preview.style.display = 'none';
        this.btns.capture.style.display = 'block';
        this.btns.retake.style.display = 'none';
        this.btns.analyze.style.display = 'none';
        this.progressFill.style.width = '0%';
        this.resultOverlay.src = '';
        this.resultOverlay.classList.remove('active');
        this.switchScreen('welcome');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
