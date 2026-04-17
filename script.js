/**
 * script.js
 *
 * Template strategy:
 *   Python: Image.open(template_path) — Pillow reads raw file bytes
 *   JS:     file.arrayBuffer() → stored as `templateBuffer` → createImageBitmap(new Blob([buffer]))
 *
 * Base64 is only kept for config.templateBase64 as a preview src for <img> tags.
 * Uploaded fonts are page-session only; browsers cannot safely keep raw file
 * handles in localStorage across refreshes.
 */

// ── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_TEMPLATE_URL = 'template.png';
const HARDCODED_NAME_X = 1000;
const HARDCODED_NAME_Y = 740;
const DEFAULT_CONFIG = {
    templateBase64: null,   // kept only for <img> preview + localStorage persistence
    nameX: HARDCODED_NAME_X,
    nameY: HARDCODED_NAME_Y,
    fontSize: 60,
    fontFamily: 'PlayfairDisplayCertificate',
    fontWeight: 'normal',
    fontItalic: true,
    textAlign: 'center',
    textCase: 'none',
    fontColor: '#000000',
    strokeWidth: 0,
    strokeColor: '#000000',
    participants: []
};

let config = { ...DEFAULT_CONFIG };

const UPLOADED_FONT_FAMILY = 'UploadedCertificateFont';
const HARDCODED_FONT_FAMILY = 'PlayfairDisplayCertificate';
const FONT_LOAD_TIMEOUT_MS = 5000;

let templateBuffer = null;   // raw template image bytes (ArrayBuffer)
let uploadedFont = {
    face: null,
    objectUrl: null,
    fileName: '',
    loaded: false
};

// ── DOM Element References ───────────────────────────────────────────────────
const els = {
    navBtns:            document.querySelectorAll('.nav-btn input'),
    viewDownload:       document.getElementById('viewDownload'),
    viewLogin:          document.getElementById('viewLogin'),
    viewAdmin:          document.getElementById('viewAdmin'),
    logoutBtn:          document.getElementById('logoutBtn'),

    // Download View
    userName:           document.getElementById('userName'),
    btnGenerate:        document.getElementById('btnGenerate'),
    downloadResult:     document.getElementById('downloadResult'),
    downloadCanvas:     document.getElementById('downloadCanvas'),
    btnDownload:        document.getElementById('btnDownload'),
    noTemplateWarning:  document.getElementById('noTemplateWarning'),
    participantError:   document.getElementById('participantError'),

    // Login
    loginForm:          document.getElementById('loginForm'),
    adminUser:          document.getElementById('adminUser'),
    adminPass:          document.getElementById('adminPass'),
    loginError:         document.getElementById('loginError'),

    // Admin View
    templateUpload:     document.getElementById('templateUpload'),
    templatePreview:    document.getElementById('templatePreview'),
    adminTemplateImg:   document.getElementById('adminTemplateImg'),
    btnAutoCenter:      document.getElementById('btnAutoCenter'),
    nameX:              document.getElementById('nameX'),
    nameY:              document.getElementById('nameY'),
    fontSize:           document.getElementById('fontSize'),
    fontSizeDisplay:    document.getElementById('fontSizeDisplay'),
    fontFamily:         document.getElementById('fontFamily'),
    fontUpload:         document.getElementById('fontUpload'),
    fontWeight:         document.getElementById('fontWeight'),
    fontItalic:         document.getElementById('fontItalic'),
    textAlign:          document.getElementById('textAlign'),
    textCase:           document.getElementById('textCase'),
    fontColor:          document.getElementById('fontColor'),
    strokeWidth:        document.getElementById('strokeWidth'),
    strokeWidthDisplay: document.getElementById('strokeWidthDisplay'),
    strokeColorGroup:   document.getElementById('strokeColorGroup'),
    strokeColor:        document.getElementById('strokeColor'),

    previewName:        document.getElementById('previewName'),
    adminPreviewCanvas: document.getElementById('adminPreviewCanvas'),

    newParticipant:     document.getElementById('newParticipant'),
    btnAddParticipant:  document.getElementById('btnAddParticipant'),
    bulkParticipants:   document.getElementById('bulkParticipants'),
    btnBulkAdd:         document.getElementById('btnBulkAdd'),
    participantList:    document.getElementById('participantList'),
    participantCount:   document.getElementById('participantCount'),

    btnSaveConfig:      document.getElementById('btnSaveConfig'),
    saveToast:          document.getElementById('saveToast'),

    // Mobile / Loader
    mobileMenuToggle:   document.getElementById('mobileMenuToggle'),
    loaderOverlay:      document.getElementById('loaderOverlay'),
    appContainer:       document.querySelector('.app-container'),
    sidebar:            document.querySelector('.sidebar'),

    btnHardcode:        document.getElementById('btnHardcode')
};

// ── Web Worker ───────────────────────────────────────────────────────────────
function waitWithTimeout(promise, ms, errorMessage) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// ── Font loading (main thread) ───────────────────────────────────────────────
/**
 * Registers the custom font in the main thread so CSS/canvas in the main
 * thread also sees it (e.g. for any future direct canvas2d usage).
 * Python equivalent: ImageFont.truetype(custom_font_path, size)
 * — we pass raw bytes directly, no conversion.
 */
function resetUploadedFont() {
    if (uploadedFont.face && document.fonts) {
        document.fonts.delete(uploadedFont.face);
    }
    if (uploadedFont.objectUrl) {
        URL.revokeObjectURL(uploadedFont.objectUrl);
    }

    uploadedFont = {
        face: null,
        objectUrl: null,
        fileName: '',
        loaded: false
    };
}

async function loadUploadedFont(file) {
    if (!file) return false;
    if (!('FontFace' in window) || !document.fonts) {
        throw new Error('This browser does not support uploaded fonts.');
    }

    resetUploadedFont();

    const objectUrl = URL.createObjectURL(file);
    const face = new FontFace(UPLOADED_FONT_FAMILY, `url("${objectUrl}")`);
    await waitWithTimeout(face.load(), FONT_LOAD_TIMEOUT_MS, 'Font loading timed out.');

    document.fonts.add(face);
    await document.fonts.load(`16px ${UPLOADED_FONT_FAMILY}`, 'Preview');
    await document.fonts.ready;

    uploadedFont = {
        face,
        objectUrl,
        fileName: file.name,
        loaded: true
    };

    return true;
}

function isUploadedFontActive() {
    return uploadedFont.loaded && config.fontFamily === UPLOADED_FONT_FAMILY;
}

function isHardcodedFontActive() {
    return config.fontFamily === HARDCODED_FONT_FAMILY;
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    loadConfig();
    
    // 1. Try restoring from localStorage
    if (config.templateBase64) {
        templateBuffer = await base64ToArrayBuffer(config.templateBase64);
    } 
    
    // 2. Fallback to default file if nothing was uploaded or restored
    if (!templateBuffer) {
        console.log('Loading default template from:', DEFAULT_TEMPLATE_URL);
        try {
            const response = await fetch(DEFAULT_TEMPLATE_URL);
            if (response.ok) {
                templateBuffer = await response.arrayBuffer();
                // Generate a base64 for the admin preview so it doesn't look empty
                config.templateBase64 = await arrayBufferToBase64(templateBuffer);
            } else {
                console.warn('Default template file not found on server.');
            }
        } catch (e) {
            console.error('Failed to fetch default template:', e);
        }
    }

    generateFallingEmojis();
    setupEventListeners();
    updateAdminUI();
    validateDownloadReady();
    renderPreview();
}

/**
 * Helper to convert ArrayBuffer back to Base64 for previewing
 */
async function arrayBufferToBase64(buffer) {
    const blob = new Blob([buffer]);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

/**
 * Converts a base64 data URL to an ArrayBuffer.
 * Used only for restoring a persisted template on page load.
 * Python equivalent: open(template_path, 'rb').read()
 */
/**
 * Robustly converts base64 (with or without data prefix) to an ArrayBuffer.
 * Uses fetch if possible, falls back to atob for reliability.
 */
async function base64ToArrayBuffer(base64) {
    if (!base64) return null;
    
    // Strategy 1: Fetch (efficient for large data URLs)
    if (base64.startsWith('data:')) {
        try {
            const res = await fetch(base64);
            return await res.arrayBuffer();
        } catch (e) {
            console.warn('Fetch failed for base64, falling back to manual conversion');
        }
    }

    // Strategy 2: Manual (atob)
    try {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (e) {
        console.error('Manual base64 conversion failed:', e);
        return null;
    }
}

// ── Persistence ──────────────────────────────────────────────────────────────
function loadConfig() {
    const saved = localStorage.getItem('certConfig');
    if (saved) {
        try {
            config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            if (
                !config.fontFamily ||
                config.fontFamily === 'Arial, sans-serif' ||
                config.fontFamily === 'CustomUserFont' ||
                config.fontFamily === UPLOADED_FONT_FAMILY
            ) {
                config.fontFamily = DEFAULT_CONFIG.fontFamily;
                config.fontItalic = DEFAULT_CONFIG.fontItalic;
            }
        } catch (e) {
            console.error('Failed to parse saved config:', e);
        }
    }
    config.nameX = HARDCODED_NAME_X;
    config.nameY = HARDCODED_NAME_Y;
}

function getPersistentConfig() {
    const toSave = { ...config };
    if (toSave.fontFamily === UPLOADED_FONT_FAMILY) {
        toSave.fontFamily = DEFAULT_CONFIG.fontFamily;
    }
    return toSave;
}

function saveConfig() {
    localStorage.setItem('certConfig', JSON.stringify(getPersistentConfig()));
    els.saveToast.classList.remove('hidden');
    setTimeout(() => els.saveToast.classList.add('hidden'), 3000);
    validateDownloadReady();
}

function validateDownloadReady() {
    if (!config.templateBase64) {
        els.noTemplateWarning.classList.remove('hidden');
    } else {
        els.noTemplateWarning.classList.add('hidden');
    }
}

// ── Falling Emojis ───────────────────────────────────────────────────────────
function generateFallingEmojis() {
    const container = document.getElementById('falling-emojis');
    const emojis = ['🪐', '💫', '☄️', '✨', '🛸', '🛰️', '🚀', '🕳️'];
    let html = '';
    for (let i = 0; i < 25; i++) {
        const emoji    = emojis[Math.floor(Math.random() * emojis.length)];
        const left     = (Math.random() * 96 + 2).toFixed(2);
        const delay    = (Math.random() * 15).toFixed(2);
        const duration = (Math.random() * 15 + 15).toFixed(2);
        const size     = (Math.random() * 1.6 + 1.2).toFixed(2);
        html += `<span class="falling-emoji" style="left:${left}%;animation-delay:${delay}s;animation-duration:${duration}s;font-size:${size}rem;">${emoji}</span>`;
    }
    container.innerHTML = html;
}

// ── Navigation ───────────────────────────────────────────────────────────────
function navigateTo(mode) {
    els.viewDownload.classList.remove('active');
    els.viewLogin.classList.remove('active');
    els.viewAdmin.classList.remove('active');
    els.navBtns.forEach(btn => btn.parentElement.classList.remove('active'));
    document.querySelector(`.nav-btn input[value="${mode}"]`).parentElement.classList.add('active');

    if (mode === 'download') {
        els.viewDownload.classList.add('active');
    } else if (mode === 'admin') {
        if (sessionStorage.getItem('adminAuth') === 'true') {
            els.viewAdmin.classList.add('active');
            els.logoutBtn.classList.remove('hidden');
            renderPreview();
        } else {
            els.viewLogin.classList.add('active');
            els.logoutBtn.classList.add('hidden');
        }
    }
    closeMobileMenu();
}

function closeMobileMenu() {
    els.sidebar.classList.remove('mobile-active');
    els.appContainer.classList.remove('sidebar-open');
}
function toggleMobileMenu() {
    els.sidebar.classList.toggle('mobile-active');
    els.appContainer.classList.toggle('sidebar-open');
}
function showLoader() { els.loaderOverlay.classList.remove('hidden'); }
function hideLoader() { els.loaderOverlay.classList.add('hidden'); }

// ── Certificate Drawing ───────────────────────────────────────────────────────
/**
 * Draws a certificate onto `canvas`.
 *
 * Python equivalent of how data flows:
 *   template_img  ← Image.open(template_path)     → here: templateBuffer (raw bytes)
 *
 * Uploaded fonts are loaded through document.fonts and rendered on this same
 * thread, which avoids worker-side FontFace compatibility problems.
 */
function getCanvasFont(configForRender) {
    const fontParts = [];
    if (configForRender.fontItalic) fontParts.push('italic');
    if (configForRender.fontWeight === 'bold') fontParts.push('bold');

    const fontSize = Math.floor(Number(configForRender.fontSize)) || 60;
    fontParts.push(`${fontSize}px`);
    fontParts.push(configForRender.fontFamily || DEFAULT_CONFIG.fontFamily);
    return fontParts.join(' ');
}

function getRenderedName(nameText, configForRender) {
    let finalName = nameText || '';
    if (configForRender.textCase === 'uppercase') finalName = finalName.toUpperCase();
    else if (configForRender.textCase === 'lowercase') finalName = finalName.toLowerCase();
    else if (configForRender.textCase === 'titlecase') {
        finalName = finalName.split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }
    return finalName;
}

async function drawCertificateOnMainThread(canvas, nameText) {
    if (!templateBuffer) {
        console.warn('drawCertificateOnMainThread: No templateBuffer available');
        return;
    }

    if ((isUploadedFontActive() || isHardcodedFontActive()) && document.fonts) {
        await document.fonts.load(getCanvasFont(config), getRenderedName(nameText, config));
        await document.fonts.ready;
    }

    let imgBitmap;
    try {
        imgBitmap = await createImageBitmap(new Blob([templateBuffer.slice(0)]));
    } catch (bitmapErr) {
        throw new Error(`Failed to decode template image: ${bitmapErr.message}`);
    }

    const width = Math.floor(Number(imgBitmap.width)) || 2000;
    const height = Math.floor(Number(imgBitmap.height)) || 1414;
    if (width <= 0 || height <= 0) {
        throw new Error(`Invalid image dimensions: ${width}x${height}`);
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(imgBitmap, 0, 0);

    ctx.font = getCanvasFont(config);
    ctx.fillStyle = config.fontColor;
    ctx.textAlign = config.textAlign || 'center';

    const finalName = getRenderedName(nameText, config);
    const x = Math.floor(Number(config.nameX)) || 0;
    const y = Math.floor(Number(config.nameY)) || 0;

    if (Number(config.strokeWidth) > 0) {
        ctx.strokeStyle = config.strokeColor;
        ctx.lineWidth = Number(config.strokeWidth);
        ctx.lineJoin = 'round';
        ctx.strokeText(finalName, x, y);
    }
    ctx.fillText(finalName, x, y);
}

/**
 * Draws a certificate onto `canvas` via the Web Worker.
 */
function drawCertificate(canvas, nameText) {
    return drawCertificateOnMainThread(canvas, nameText);
}

function renderPreview() {
    if (templateBuffer) {
        const name = els.previewName.value || 'John Doe';
        drawCertificate(els.adminPreviewCanvas, name).catch(err => {
            console.error('Preview failed:', err);
        });
    }
}

// ── Admin UI Sync ─────────────────────────────────────────────────────────────
function updateAdminUI() {
    if (config.templateBase64) {
        els.adminTemplateImg.src = config.templateBase64;
        els.templatePreview.classList.remove('hidden');
    }

    els.nameX.value              = config.nameX;
    els.nameY.value              = config.nameY;
    els.fontSize.value           = config.fontSize;
    els.fontSizeDisplay.textContent = config.fontSize + 'px';

    els.fontFamily.value = config.fontFamily === UPLOADED_FONT_FAMILY ? 'Custom Upload' : config.fontFamily;
    els.fontUpload.classList.toggle('hidden', els.fontFamily.value !== 'Custom Upload');

    els.fontWeight.value  = config.fontWeight;
    els.fontItalic.checked = config.fontItalic;
    els.textAlign.value   = config.textAlign;
    els.textCase.value    = config.textCase;
    els.fontColor.value   = config.fontColor;
    els.strokeWidth.value = config.strokeWidth;
    els.strokeWidthDisplay.textContent = config.strokeWidth + 'px';
    els.strokeColor.value = config.strokeColor;

    els.strokeColorGroup.style.display = config.strokeWidth > 0 ? 'flex' : 'none';

    renderParticipants();
}

function renderParticipants() {
    els.participantCount.textContent = config.participants.length;
    els.participantList.innerHTML = '';
    config.participants.forEach((p, idx) => {
        const li  = document.createElement('li');
        li.textContent = p;
        const btn = document.createElement('button');
        btn.innerHTML = '🗑️';
        btn.onclick = () => {
            config.participants.splice(idx, 1);
            saveConfig();
            renderParticipants();
        };
        li.appendChild(btn);
        els.participantList.appendChild(li);
    });
}

function syncConfigFromUI() {
    config.nameX       = HARDCODED_NAME_X;
    config.nameY       = HARDCODED_NAME_Y;
    els.nameX.value    = HARDCODED_NAME_X;
    els.nameY.value    = HARDCODED_NAME_Y;
    config.fontSize    = parseInt(els.fontSize.value)   || 60;

    if (els.fontFamily.value === 'Custom Upload') {
        // Python: if font_family == "Custom Upload" → use custom_font_path
        config.fontFamily = uploadedFont.loaded ? UPLOADED_FONT_FAMILY : DEFAULT_CONFIG.fontFamily;
    } else {
        config.fontFamily = els.fontFamily.value;
        // Switching away from custom upload clears it (Python: config['custom_font_path'] = None)
        resetUploadedFont();
    }

    config.fontWeight  = els.fontWeight.value;
    config.fontItalic  = els.fontItalic.checked;
    if (config.fontFamily === HARDCODED_FONT_FAMILY) {
        config.fontItalic = true;
        els.fontItalic.checked = true;
    }
    config.textAlign   = els.textAlign.value;
    config.textCase    = els.textCase.value;
    config.fontColor   = els.fontColor.value;
    config.strokeWidth = parseInt(els.strokeWidth.value) || 0;
    config.strokeColor = els.strokeColor.value;
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
    // Navigation
    els.navBtns.forEach(btn => {
        btn.addEventListener('change', e => navigateTo(e.target.value));
    });

    els.mobileMenuToggle.addEventListener('click', toggleMobileMenu);

    els.appContainer.addEventListener('click', e => {
        if (
            els.appContainer.classList.contains('sidebar-open') &&
            !els.sidebar.contains(e.target) &&
            !els.mobileMenuToggle.contains(e.target)
        ) closeMobileMenu();
    });

    // Login
    els.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        if (els.adminUser.value === 'admin' && els.adminPass.value === 'admin123') {
            sessionStorage.setItem('adminAuth', 'true');
            els.loginError.classList.add('hidden');
            navigateTo('admin');
        } else {
            els.loginError.classList.remove('hidden');
        }
    });

    els.logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('adminAuth');
        document.querySelector('.nav-btn input[value="download"]').checked = true;
        navigateTo('download');
    });

    // ── Template Upload ──────────────────────────────────────────────────────
    // Python: uploaded_file → template_img.save('certificate_template.png')
    // JS:     File → ArrayBuffer (templateBuffer) + base64 for <img> preview
    els.templateUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Read raw bytes (Python equivalent: file.read())
        templateBuffer = await file.arrayBuffer();

        // Also read as data URL for the <img> preview tag
        const reader = new FileReader();
        reader.onload = evt => {
            config.templateBase64 = evt.target.result;
            updateAdminUI();
            renderPreview();
        };
        reader.readAsDataURL(file);
    });

    // Auto Center
    els.btnAutoCenter.addEventListener('click', () => {
        if (!config.templateBase64) {
            alert('Please upload a certificate template first!');
            return;
        }
        const img = new Image();
        img.onload = () => {
            els.nameX.value = Math.round(img.width  / 2);
            els.nameY.value = Math.round(img.height / 2);
            syncConfigFromUI();
            renderPreview();
        };
        img.src = config.templateBase64;
    });

    // Config live-preview triggers
    [els.nameX, els.nameY, els.fontColor, els.strokeColor, els.previewName].forEach(el => {
        el.addEventListener('input', () => { syncConfigFromUI(); renderPreview(); });
    });

    // ── Font Family Dropdown ─────────────────────────────────────────────────
    els.fontFamily.addEventListener('change', e => {
        if (e.target.value === 'Custom Upload') {
            els.fontUpload.classList.remove('hidden');
            if (uploadedFont.loaded) {
                config.fontFamily = UPLOADED_FONT_FAMILY;
                renderPreview();
            }
        } else {
            els.fontUpload.classList.add('hidden');
            syncConfigFromUI();
            renderPreview();
        }
    });

    // ── Font File Upload ─────────────────────────────────────────────────────
    els.fontUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            await loadUploadedFont(file);
        } catch (err) {
            console.error('Custom font upload failed:', err);
            resetUploadedFont();
            config.fontFamily = DEFAULT_CONFIG.fontFamily;
            els.fontFamily.value = config.fontFamily;
            els.fontUpload.classList.add('hidden');
            alert('The selected font could not be loaded. Please try another .ttf or .otf file.');
            renderPreview();
            return;
        }

        config.fontFamily = UPLOADED_FONT_FAMILY;
        renderPreview();
    });

    // Font style controls
    els.fontSize.addEventListener('input', e => {
        els.fontSizeDisplay.textContent = e.target.value + 'px';
        syncConfigFromUI();
        renderPreview();
    });
    els.fontWeight.addEventListener('change',  () => { syncConfigFromUI(); renderPreview(); });
    els.textAlign.addEventListener('change',   () => { syncConfigFromUI(); renderPreview(); });
    els.textCase.addEventListener('change',    () => { syncConfigFromUI(); renderPreview(); });
    els.fontItalic.addEventListener('change',  () => { syncConfigFromUI(); renderPreview(); });

    els.strokeWidth.addEventListener('input', e => {
        els.strokeWidthDisplay.textContent = e.target.value + 'px';
        els.strokeColorGroup.style.display = parseInt(e.target.value) > 0 ? 'flex' : 'none';
        syncConfigFromUI();
        renderPreview();
    });

    // Participants
    els.btnAddParticipant.addEventListener('click', () => {
        const val = els.newParticipant.value.trim();
        if (val && !config.participants.includes(val)) {
            config.participants.push(val);
            renderParticipants();
            els.newParticipant.value = '';
        }
    });

    els.btnBulkAdd.addEventListener('click', () => {
        const names = els.bulkParticipants.value.split('\n').map(n => n.trim()).filter(Boolean);
        if (!names.length) return;
        showLoader();
        setTimeout(() => {
            names.forEach(n => { if (!config.participants.includes(n)) config.participants.push(n); });
            renderParticipants();
            els.bulkParticipants.value = '';
            hideLoader();
        }, 100);
    });

    // Save / Export
    els.btnSaveConfig.addEventListener('click', () => {
        syncConfigFromUI();
        saveConfig();
        renderPreview();
    });

    els.btnHardcode.addEventListener('click', () => {
        const hardcode = `const DEFAULT_CONFIG = ${JSON.stringify(getPersistentConfig(), null, 4)};`;
        console.log('--- START HARDCODE CONFIG ---');
        console.log(hardcode);
        console.log('--- END HARDCODE CONFIG ---');
        navigator.clipboard.writeText(hardcode).then(() => {
            alert('Configuration code copied to clipboard! Paste this into script.js before deploying.');
        });
    });

    // ── Generate Certificate (User View) ─────────────────────────────────────
    els.btnGenerate.addEventListener('click', async () => {
        const name = els.userName.value.trim();
        els.participantError.classList.add('hidden');
        els.downloadResult.classList.add('hidden');

        if (!name) return;

        if (config.participants.length > 0 && !config.participants.includes(name)) {
            els.participantError.classList.remove('hidden');
            return;
        }
        if (!templateBuffer) {
            els.noTemplateWarning.classList.remove('hidden');
            return;
        }

        showLoader();
        setTimeout(async () => {
            await drawCertificate(els.downloadCanvas, name);
            els.downloadResult.classList.remove('hidden');
            els.btnDownload.href     = els.downloadCanvas.toDataURL('image/png');
            els.btnDownload.download = `certificate_${name.replace(/\s+/g, '_')}.png`;
            hideLoader();
        }, 100);
    });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
