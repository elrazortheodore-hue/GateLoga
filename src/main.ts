// ================================================================
// SYSTEM ENVIRONMENT CONFIGURATION
// ================================================================
const CLOUDINARY_API_KEY: string = import.meta.env.VITE_CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET: string = import.meta.env.VITE_CLOUDINARY_API_SECRET || "";
const CLOUDINARY_CLOUD_NAME: string = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";

const MAX_UPLOADS = 20;

let scannedImages: File[] = [];
let currentFile: File | null = null;
let currentRotation = 0;
let captureMode: 'camera' | 'file' = 'camera';
let objectUrlsToRevoke: string[] = [];

// Custom alert toast system
function showAlert(message: string): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translate(-50%, 20px);
        background: var(--surface); color: var(--text);
        border: 1px solid var(--border); border-left: 4px solid var(--accent);
        padding: 12px 18px; border-radius: var(--radius);
        box-shadow: var(--shadow); z-index: 9999;
        font-size: 13px; font-weight: 500; width: 90%; max-width: 350px;
        display: flex; align-items: center; gap: 10px;
        opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    
    // Trigger paint to animate
    toast.offsetHeight;
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// Register PWA Service Worker
window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('ServiceWorker registration successful with scope: ', reg.scope))
            .catch(err => console.error('ServiceWorker registration failed: ', err));
    }
});

// Netbadge Connection Listeners
window.addEventListener('online', () => {
    const badge = document.getElementById('net-badge');
    const txt = document.getElementById('net-text');
    if (badge && txt) {
        badge.className = 'net-badge online';
        txt.textContent = 'Online';
    }
});

window.addEventListener('offline', () => {
    const badge = document.getElementById('net-badge');
    const txt = document.getElementById('net-text');
    if (badge && txt) {
        badge.className = 'net-badge offline';
        txt.textContent = 'Offline';
    }
});

// Theme Management
const savedTheme = localStorage.getItem('gateloga_theme') || 'light';
function applyTheme(t: string): void {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : '');
    const sunIcon = document.getElementById('icon-sun');
    const moonIcon = document.getElementById('icon-moon');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = t === 'dark' ? 'none' : 'block';
        moonIcon.style.display = t === 'dark' ? 'block' : 'none';
    }
    localStorage.setItem('gateloga_theme', t);
}
applyTheme(savedTheme);

document.getElementById('btn-theme')?.addEventListener('click', () => {
    const current = localStorage.getItem('gateloga_theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// Navigation Functions
function showScreen(id: string): void {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}

// System Loader Gate
window.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('loading-gate');
    if (gate) {
        gate.style.display = 'block';
        gate.style.pointerEvents = 'all';
        gate.classList.add('gate-closed');
        setTimeout(() => {
            gate.classList.remove('gate-closed');
            setTimeout(() => {
                gate.style.display = 'none';
                gate.style.pointerEvents = 'none';
            }, 800);
        }, 1200);
    }
    updateAutoName();
});

// Capture Mode Controls
const fileInput = document.getElementById('file-input') as HTMLInputElement;

document.getElementById('mode-camera')?.addEventListener('click', () => {
    captureMode = 'camera';
    document.getElementById('mode-camera')?.classList.add('active');
    document.getElementById('mode-file')?.classList.remove('active');
    const desc = document.getElementById('source-desc');
    if (desc) desc.textContent = 'Camera capture active';
});

document.getElementById('mode-file')?.addEventListener('click', () => {
    captureMode = 'file';
    document.getElementById('mode-file')?.classList.add('active');
    document.getElementById('mode-camera')?.classList.remove('active');
    const desc = document.getElementById('source-desc');
    if (desc) desc.textContent = 'Device photo upload active';
});

document.getElementById('viewfinder')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#preview-container') || target.closest('.viewfinder-overlay-controls')) return;
    if (fileInput) {
        if (captureMode === 'camera') {
            fileInput.setAttribute('capture', 'environment');
        } else {
            fileInput.removeAttribute('capture');
        }
        fileInput.click();
    }
});

document.getElementById('btn-scan')?.addEventListener('click', () => {
    document.getElementById('viewfinder')?.click();
});

// Image Loader Events (Binary file handling)
fileInput?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    currentFile = file;
    currentRotation = 0;
    
    // Revoke old single preview url if any
    const previewImg = document.getElementById('preview-img') as HTMLImageElement;
    if (previewImg.src && previewImg.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewImg.src);
    }

    const objectUrl = URL.createObjectURL(file);
    applyImageTransformations(objectUrl);
    
    const previewCont = document.getElementById('preview-container');
    const placeholder = document.getElementById('viewfinder-placeholder');
    const actions = document.getElementById('preview-actions');
    const scanBtn = document.getElementById('btn-scan');
    
    if (previewCont) previewCont.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    if (actions) actions.classList.add('show');
    if (scanBtn) scanBtn.style.display = 'none';
    
    target.value = '';
});

function applyImageTransformations(url?: string): void {
    const previewImg = document.getElementById('preview-img') as HTMLImageElement;
    if (previewImg) {
        if (url) previewImg.src = url;
        previewImg.style.transform = `rotate(${currentRotation}deg)`;
    }
}

function resetViewfinder(): void {
    const previewCont = document.getElementById('preview-container');
    const previewImg = document.getElementById('preview-img') as HTMLImageElement;
    const placeholder = document.getElementById('viewfinder-placeholder');
    const actions = document.getElementById('preview-actions');
    const scanBtn = document.getElementById('btn-scan');
    
    if (previewCont) previewCont.style.display = 'none';
    if (previewImg) {
        if (previewImg.src.startsWith('blob:')) {
            URL.revokeObjectURL(previewImg.src);
        }
        previewImg.src = '';
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (actions) actions.classList.remove('show');
    if (scanBtn) scanBtn.style.display = '';
    
    currentFile = null;
    currentRotation = 0;
}
document.getElementById('btn-retake')?.addEventListener('click', resetViewfinder);

document.getElementById('btn-rotate')?.addEventListener('click', () => {
    currentRotation = (currentRotation + 90) % 360;
    applyImageTransformations();
});

// Keeping Frames with Upload Limits
document.getElementById('btn-keep')?.addEventListener('click', () => {
    if (!currentFile) return;
    if (scannedImages.length >= MAX_UPLOADS) {
        showAlert(`Scan limit reached. Maximum pages allowed is ${MAX_UPLOADS}.`);
        return;
    }
    
    // Store raw file directly
    scannedImages.push(currentFile);
    rebuildStrip();
    document.getElementById('upload-section')?.classList.add('show');
    
    // Do not revoke here because rebuildStrip will manage the rendering URLs
    currentFile = null;
    resetViewfinder();
});

// Clean and allocate object URLs for preview strip to prevent memory leaks
function clearOldObjectUrls(): void {
    objectUrlsToRevoke.forEach(url => URL.revokeObjectURL(url));
    objectUrlsToRevoke = [];
}

// Rebuilding gallery viewports using temporary object URLs
function rebuildStrip(): void {
    const strip = document.getElementById('scan-strip');
    if (!strip) return;
    strip.innerHTML = '';
    clearOldObjectUrls();
    
    scannedImages.forEach((file, idx) => {
        const objectUrl = URL.createObjectURL(file);
        objectUrlsToRevoke.push(objectUrl);

        const imgWrap = document.createElement('div');
        imgWrap.className = 'scan-thumb';
        imgWrap.innerHTML = `
            <img src="${objectUrl}">
            <button class="scan-thumb-remove" data-idx="${idx}">&times;</button>
            <div class="scan-thumb-reorder">
                <button class="reorder-btn reorder-prev" data-idx="${idx}">&lt;</button>
                <button class="reorder-btn reorder-next" data-idx="${idx}">&gt;</button>
            </div>
        `;
        
        // Remove trigger
        imgWrap.querySelector('.scan-thumb-remove')?.addEventListener('click', (e) => {
            const btn = e.target as HTMLElement;
            const removeIdx = parseInt(btn.dataset.idx || '0');
            scannedImages.splice(removeIdx, 1);
            rebuildStrip();
            if (scannedImages.length === 0) {
                document.getElementById('upload-section')?.classList.remove('show');
            }
        });
        
        // Move Prev trigger
        imgWrap.querySelector('.reorder-prev')?.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('button');
            const i = parseInt(btn?.dataset.idx || '0');
            if (i > 0) {
                const temp = scannedImages[i];
                scannedImages[i] = scannedImages[i - 1];
                scannedImages[i - 1] = temp;
                rebuildStrip();
            }
        });
        
        // Move Next trigger
        imgWrap.querySelector('.reorder-next')?.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('button');
            const i = parseInt(btn?.dataset.idx || '0');
            if (i < scannedImages.length - 1) {
                const temp = scannedImages[i];
                scannedImages[i] = scannedImages[i + 1];
                scannedImages[i + 1] = temp;
                rebuildStrip();
            }
        });
        
        strip.appendChild(imgWrap);
    });
}

function updateAutoName(): void {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    
    const docInput = document.getElementById('doc-name-input') as HTMLInputElement;
    if (docInput) {
        docInput.value = `LOG_${yyyy}-${mm}-${dd}_${hh}-${min}-${sec}`;
    }
}

// Client Side Cloudinary Signer (Web Crypto SHA-1)
async function signCloudinary(timestamp: string, secret: string): Promise<string> {
    const text = `timestamp=${timestamp}${secret}`;
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-1', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Upload raw File straight to Cloudinary REST endpoint
async function uploadToCloudinary(fileObject: File): Promise<string> {
    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const signature = await signCloudinary(timestamp, CLOUDINARY_API_SECRET);

    const formData = new FormData();
    formData.append("file", fileObject); // Send raw file object
    formData.append("api_key", CLOUDINARY_API_KEY);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const res = await fetch(endpoint, {
        method: "POST",
        body: formData
    });

    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || "Cloudinary Upload Failed");
    }

    const data = await res.json();
    return data.secure_url;
}

// // Ingestion Processing Sequence (Direct Cloudinary Upload & Register As Pending)
document.getElementById('btn-upload')?.addEventListener('click', async () => {
    if (scannedImages.length === 0) return;

    const btnUpload = document.getElementById('btn-upload') as HTMLButtonElement;
    const progressEl = document.getElementById('upload-progress');
    const fillEl = document.getElementById('progress-fill');
    const textEl = document.getElementById('progress-text');

    if (btnUpload) btnUpload.disabled = true;
    if (progressEl) progressEl.classList.add('show');
    
    let uploadFailures = 0;
    const docName = (document.getElementById('doc-name-input') as HTMLInputElement)?.value.trim() || 'LOG_BATCH';

    for (let i = 0; i < scannedImages.length; i++) {
        // Calculate monotonic increments
        const progressBase = (i / scannedImages.length) * 100;
        const progressRegister = ((i + 0.5) / scannedImages.length) * 100;
        const progressSync = ((i + 1) / scannedImages.length) * 100;

        const targetFile = scannedImages[i];

        if (textEl) textEl.textContent = `Uploading page ${i + 1} of ${scannedImages.length} to Cloudinary...`;
        if (fillEl) fillEl.style.width = `${progressBase}%`;

        try {
            // 1. Cloudinary upload (direct raw file)
            const cloudinaryUrl = await uploadToCloudinary(targetFile);

            if (textEl) textEl.textContent = `Registering page ${i + 1} of ${scannedImages.length} in database...`;
            if (fillEl) fillEl.style.width = `${progressRegister}%`;

            // 2. Call Vercel /api/add_pending to queue the scan
            const registerResponse = await fetch("/api/add_pending", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageUrl: cloudinaryUrl,
                    docName: docName
                })
            });

            if (!registerResponse.ok) {
                const errData = await registerResponse.json();
                throw new Error(errData.error || "Database registration failed.");
            }

            if (fillEl) fillEl.style.width = `${progressSync}%`;

        } catch (err: any) {
            console.error("Upload execution error:", err);
            uploadFailures++;
            showAlert(`Page ${i + 1} failed: ${err.message || err}`);
        }
    }

    if (textEl) {
        if (uploadFailures > 0) {
            textEl.textContent = `Completed with ${uploadFailures} failure(s).`;
        } else {
            textEl.textContent = 'All logbook pages uploaded successfully.';
        }
    }
    
    setTimeout(() => {
        showScreen('complete-screen');
        if (progressEl) progressEl.classList.remove('show');
        if (btnUpload) btnUpload.disabled = false;
    }, 1500);
});

document.getElementById('btn-new-session')?.addEventListener('click', () => {
    scannedImages = [];
    clearOldObjectUrls();
    rebuildStrip();
    resetViewfinder();
    document.getElementById('upload-section')?.classList.remove('show');
    const remark = document.getElementById('remark-input') as HTMLTextAreaElement;
    if (remark) remark.value = '';
    updateAutoName();
    showScreen('scanner-screen');
});
export {};
