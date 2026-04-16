// Default Configuration
const DEFAULT_CONFIG = {
    templateBase64: null,
    nameX: 500,
    nameY: 400,
    fontSize: 60,
    fontFamily: 'Arial, sans-serif',
    fontBold: false,
    fontItalic: false,
    fontColor: '#000000',
    strokeWidth: 0,
    strokeColor: '#000000',
    participants: [],
    customFontBase64: null
};

let config = { ...DEFAULT_CONFIG };

// Elements
const els = {
    navBtns: document.querySelectorAll('.nav-btn input'),
    viewDownload: document.getElementById('viewDownload'),
    viewLogin: document.getElementById('viewLogin'),
    viewAdmin: document.getElementById('viewAdmin'),
    logoutBtn: document.getElementById('logoutBtn'),
    
    // Download View
    userName: document.getElementById('userName'),
    btnGenerate: document.getElementById('btnGenerate'),
    downloadResult: document.getElementById('downloadResult'),
    downloadCanvas: document.getElementById('downloadCanvas'),
    btnDownload: document.getElementById('btnDownload'),
    noTemplateWarning: document.getElementById('noTemplateWarning'),
    participantError: document.getElementById('participantError'),
    
    // Login
    loginForm: document.getElementById('loginForm'),
    adminUser: document.getElementById('adminUser'),
    adminPass: document.getElementById('adminPass'),
    loginError: document.getElementById('loginError'),
    
    // Admin View
    templateUpload: document.getElementById('templateUpload'),
    templatePreview: document.getElementById('templatePreview'),
    adminTemplateImg: document.getElementById('adminTemplateImg'),
    btnAutoCenter: document.getElementById('btnAutoCenter'),
    nameX: document.getElementById('nameX'),
    nameY: document.getElementById('nameY'),
    fontSize: document.getElementById('fontSize'),
    fontSizeDisplay: document.getElementById('fontSizeDisplay'),
    fontFamily: document.getElementById('fontFamily'),
    fontUpload: document.getElementById('fontUpload'),
    fontBold: document.getElementById('fontBold'),
    fontItalic: document.getElementById('fontItalic'),
    fontColor: document.getElementById('fontColor'),
    strokeWidth: document.getElementById('strokeWidth'),
    strokeWidthDisplay: document.getElementById('strokeWidthDisplay'),
    strokeColorGroup: document.getElementById('strokeColorGroup'),
    strokeColor: document.getElementById('strokeColor'),
    
    previewName: document.getElementById('previewName'),
    adminPreviewCanvas: document.getElementById('adminPreviewCanvas'),
    
    newParticipant: document.getElementById('newParticipant'),
    btnAddParticipant: document.getElementById('btnAddParticipant'),
    bulkParticipants: document.getElementById('bulkParticipants'),
    btnBulkAdd: document.getElementById('btnBulkAdd'),
    participantList: document.getElementById('participantList'),
    participantCount: document.getElementById('participantCount'),
    
    btnSaveConfig: document.getElementById('btnSaveConfig'),
    saveToast: document.getElementById('saveToast'),
    
    // Mobile/Loader
    mobileMenuToggle: document.getElementById('mobileMenuToggle'),
    loaderOverlay: document.getElementById('loaderOverlay'),
    appContainer: document.querySelector('.app-container'),
    sidebar: document.querySelector('.sidebar'),
    
    // Scaling
    btnHardcode: document.getElementById('btnHardcode')
};

// Initialize Worker
const renderWorker = new Worker('renderWorker.js');

async function loadCustomFontData(base64Data) {
    try {
        const font = new FontFace('CustomUserFont', `url(${base64Data})`);
        await font.load();
        document.fonts.add(font);
    } catch(e) {
        console.error("Failed to load custom font", e);
    }
}

// Initialize
async function init() {
    loadConfig();
    if (config.customFontBase64) {
        await loadCustomFontData(config.customFontBase64);
    }
    generateFallingEmojis();
    setupEventListeners();
    updateAdminUI();
    validateDownloadReady();
    renderPreview();
}

function loadConfig() {
    const saved = localStorage.getItem('certConfig');
    if (saved) {
        try {
            config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        } catch(e) {
            console.error("Failed to parse config", e);
        }
    }
}

function saveConfig() {
    localStorage.setItem('certConfig', JSON.stringify(config));
    els.saveToast.classList.remove('hidden');
    setTimeout(() => {
        els.saveToast.classList.add('hidden');
    }, 3000);
    validateDownloadReady();
}

function validateDownloadReady() {
    if (!config.templateBase64) {
        els.noTemplateWarning.classList.remove('hidden');
    } else {
        els.noTemplateWarning.classList.add('hidden');
    }
}

// Falling Emojis Generator
function generateFallingEmojis() {
    const container = document.getElementById('falling-emojis');
    const emojis = ['🪐', '💫', '☄️', '✨', '🛸', '🛰️', '🚀', '🕳️'];
    let html = '';
    
    for (let i = 0; i < 25; i++) {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        const left = (Math.random() * 96 + 2).toFixed(2);
        const delay = (Math.random() * 15).toFixed(2);
        const duration = (Math.random() * 15 + 15).toFixed(2);
        const size = (Math.random() * 1.6 + 1.2).toFixed(2);
        
        html += `<span class="falling-emoji" style="left: ${left}%; animation-delay: ${delay}s; animation-duration: ${duration}s; font-size: ${size}rem;">${emoji}</span>`;
    }
    container.innerHTML = html;
}

// Navigation
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

    // Close mobile menu on navigate
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

function showLoader() {
    els.loaderOverlay.classList.remove('hidden');
}

function hideLoader() {
    els.loaderOverlay.classList.add('hidden');
}

// Drawing logic
function drawCertificate(canvas, nameText) {
    return new Promise((resolve, reject) => {
        if (!config.templateBase64) {
            resolve();
            return;
        }

        const width = els.adminTemplateImg.naturalWidth || 2000;
        const height = els.adminTemplateImg.naturalHeight || 1414;
        
        // Prepare canvas size
        canvas.width = width;
        canvas.height = height;

        // Message Worker
        renderWorker.onmessage = (e) => {
            if (e.data.success) {
                const url = URL.createObjectURL(e.data.blob);
                const img = new Image();
                img.onload = () => {
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.src = url;
            } else {
                console.error('Worker Error:', e.data.error);
                reject(e.data.error);
            }
        };

        renderWorker.postMessage({
            templateBase64: config.templateBase64,
            nameText: nameText,
            config: config,
            width: width,
            height: height
        });
    });
}

function renderPreview() {
    if (config.templateBase64) {
        const name = els.previewName.value || "John Doe";
        drawCertificate(els.adminPreviewCanvas, name);
    }
}

function updateAdminUI() {
    if (config.templateBase64) {
        els.adminTemplateImg.src = config.templateBase64;
        els.templatePreview.classList.remove('hidden');
    }
    
    els.nameX.value = config.nameX;
    els.nameY.value = config.nameY;
    els.fontSize.value = config.fontSize;
    els.fontSizeDisplay.textContent = config.fontSize + 'px';
    els.fontFamily.value = config.fontFamily === 'CustomUserFont' ? 'Custom Upload' : config.fontFamily;
    if (els.fontFamily.value === 'Custom Upload') {
        els.fontUpload.classList.remove('hidden');
    } else {
        els.fontUpload.classList.add('hidden');
    }
    els.fontBold.checked = config.fontBold;
    els.fontItalic.checked = config.fontItalic;
    els.fontColor.value = config.fontColor;
    els.strokeWidth.value = config.strokeWidth;
    els.strokeWidthDisplay.textContent = config.strokeWidth + 'px';
    els.strokeColor.value = config.strokeColor;
    
    if (config.strokeWidth > 0) {
        els.strokeColorGroup.style.display = 'flex';
    } else {
        els.strokeColorGroup.style.display = 'none';
    }
    
    renderParticipants();
}

function renderParticipants() {
    els.participantCount.textContent = config.participants.length;
    els.participantList.innerHTML = '';
    
    config.participants.forEach((p, idx) => {
        const li = document.createElement('li');
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

// Event Listeners
function setupEventListeners() {
    // Nav
    els.navBtns.forEach(btn => {
        btn.addEventListener('change', (e) => navigateTo(e.target.value));
    });

    els.mobileMenuToggle.addEventListener('click', toggleMobileMenu);

    // Close menu when clicking backdrop
    els.appContainer.addEventListener('click', (e) => {
        if (els.appContainer.classList.contains('sidebar-open') && !els.sidebar.contains(e.target) && !els.mobileMenuToggle.contains(e.target)) {
            closeMobileMenu();
        }
    });
    
    // Login
    els.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = els.adminUser.value;
        const pass = els.adminPass.value;
        // admin / admin123
        if (user === 'admin' && pass === 'admin123') {
            sessionStorage.setItem('adminAuth', 'true');
            els.loginError.classList.add('hidden');
            navigateTo('admin');
        } else {
            els.loginError.classList.remove('hidden');
        }
    });

    els.logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('adminAuth');
        navigateTo('download');
        // Select download radio
        document.querySelector(`.nav-btn input[value="download"]`).checked = true;
    });
    
    // Image Upload
    els.templateUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                config.templateBase64 = evt.target.result;
                updateAdminUI();
                renderPreview();
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Auto Center Position
    els.btnAutoCenter.addEventListener('click', () => {
        if (!config.templateBase64) {
            alert("Please upload a certificate template first!");
            return;
        }
        const img = new Image();
        img.onload = () => {
            const centerX = Math.round(img.width / 2);
            const centerY = Math.round(img.height / 2);
            els.nameX.value = centerX;
            els.nameY.value = centerY;
            syncConfigFromUI();
            renderPreview();
        };
        img.src = config.templateBase64;
    });

    // Config Updates (Auto Preview)
    const previewTriggers = [els.nameX, els.nameY, els.fontColor, els.strokeColor, els.previewName];
    previewTriggers.forEach(el => {
        el.addEventListener('input', () => {
            syncConfigFromUI();
            renderPreview();
        });
    });

    els.fontFamily.addEventListener('change', (e) => {
        if (e.target.value === 'Custom Upload') {
            els.fontUpload.classList.remove('hidden');
            if (config.customFontBase64) {
                config.fontFamily = 'CustomUserFont';
                renderPreview();
            }
        } else {
            els.fontUpload.classList.add('hidden');
            syncConfigFromUI();
            renderPreview();
        }
    });

    els.fontUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const base64 = evt.target.result;
                config.customFontBase64 = base64;
                await loadCustomFontData(base64);
                config.fontFamily = 'CustomUserFont';
                renderPreview();
            };
            reader.readAsDataURL(file);
        }
    });
    
    els.fontSize.addEventListener('input', (e) => {
        els.fontSizeDisplay.textContent = e.target.value + 'px';
        syncConfigFromUI();
        renderPreview();
    });
    
    els.strokeWidth.addEventListener('input', (e) => {
        els.strokeWidthDisplay.textContent = e.target.value + 'px';
        if (parseInt(e.target.value) > 0) {
            els.strokeColorGroup.style.display = 'flex';
        } else {
            els.strokeColorGroup.style.display = 'none';
        }
        syncConfigFromUI();
        renderPreview();
    });
    
    els.fontBold.addEventListener('change', () => { syncConfigFromUI(); renderPreview(); });
    els.fontItalic.addEventListener('change', () => { syncConfigFromUI(); renderPreview(); });
    
    // Participants
    els.btnAddParticipant.addEventListener('click', () => {
        const val = els.newParticipant.value.trim();
        if (val && !config.participants.includes(val)) {
            config.participants.push(val);
            renderParticipants();
            els.newParticipant.value = '';
        }
    });
    
    // Hardcode Utility
    els.btnHardcode.addEventListener('click', () => {
        const hardcode = `const DEFAULT_CONFIG = ${JSON.stringify(config, null, 4)};`;
        console.log("--- START HARDCODE CONFIG ---");
        console.log(hardcode);
        console.log("--- END HARDCODE CONFIG ---");
        
        navigator.clipboard.writeText(hardcode).then(() => {
            alert("Configuration code copied to clipboard! Paste this into script.js (lines 2-15) before deploying to Vercel.");
        });
    });

    els.btnBulkAdd.addEventListener('click', async () => {
        const names = els.bulkParticipants.value.split('\n').map(n => n.trim()).filter(n => n);
        if (names.length === 0) return;

        showLoader();
        setTimeout(() => { // Small timeout to let UI show loader
            let added = 0;
            names.forEach(n => {
                if (!config.participants.includes(n)) {
                    config.participants.push(n);
                    added++;
                }
            });
            if (added > 0) {
                renderParticipants();
                els.bulkParticipants.value = '';
            }
            hideLoader();
        }, 100);
    });
    
    // Save Control
    els.btnSaveConfig.addEventListener('click', () => {
        syncConfigFromUI();
        saveConfig();
        renderPreview();
    });
    
    // Generate Certificate for User
    els.btnGenerate.addEventListener('click', async () => {
        const name = els.userName.value.trim();
        els.participantError.classList.add('hidden');
        els.downloadResult.classList.add('hidden');
        
        if (!name) return;
        
        // Validation
        if (config.participants.length > 0 && !config.participants.includes(name)) {
            els.participantError.classList.remove('hidden');
            return;
        }
        
        if (!config.templateBase64) {
            els.noTemplateWarning.classList.remove('hidden');
            return;
        }
        
        showLoader();
        
        // Use timeout to ensure loader displays before heavy canvas work
        setTimeout(async () => {
            // Create
            await drawCertificate(els.downloadCanvas, name);
            els.downloadResult.classList.remove('hidden');
            
            // Update button link
            els.btnDownload.href = els.downloadCanvas.toDataURL('image/png');
            // Suggesting filename
            els.btnDownload.download = `certificate_${name.replace(/\s+/g, '_')}.png`;

            hideLoader();
        }, 100);
    });
}

function syncConfigFromUI() {
    config.nameX = parseInt(els.nameX.value) || 500;
    config.nameY = parseInt(els.nameY.value) || 400;
    config.fontSize = parseInt(els.fontSize.value) || 60;
    if (els.fontFamily.value === 'Custom Upload') {
        if (config.customFontBase64) config.fontFamily = 'CustomUserFont';
    } else {
        config.fontFamily = els.fontFamily.value;
    }
    config.fontBold = els.fontBold.checked;
    config.fontItalic = els.fontItalic.checked;
    config.fontColor = els.fontColor.value;
    config.strokeWidth = parseInt(els.strokeWidth.value) || 0;
    config.strokeColor = els.strokeColor.value;
}

// Boot
init();
