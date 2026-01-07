const { app, BrowserWindow, screen, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Groq = require('groq-sdk');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const util = require('util');

// --- Logging Setup ---
const logFile = path.join(__dirname, 'orb_debug.log');
// Clear log on start
try { fs.writeFileSync(logFile, `--- Log Started: ${new Date().toISOString()} ---\n`); } catch (e) { }

function fileLog(...args) {
    const msg = util.format(...args) + '\n';
    try {
        fs.appendFileSync(logFile, `[MAIN] ${msg}`);
        process.stdout.write(`[MAIN] ${msg}`); // Keep terminal output too
    } catch (e) { }
}

// Override console
console.log = fileLog;
console.error = (...args) => fileLog('[ERROR]', ...args);

// IPC Logger
ipcMain.on('log-from-renderer', (event, type, message) => {
    try {
        fs.appendFileSync(logFile, `[RENDERER ${type}] ${message}\n`);
    } catch (e) { }
});

// Allow audio/mic to start without user interaction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let settingsWindow = null;
let tray = null;
let isMenuOpen = false;

// --- Config Logic ---
const configPath = path.join(__dirname, 'whisper4u.ini');
let appConfig = {
    api_keys: { groq: "" },
    window: { x: null, y: null },
    orb_scale: 0.4,
    shortcut: [3640] // Default to AltGr
};

function loadConfig() {
    if (fs.existsSync(configPath)) {
        try {
            const data = fs.readFileSync(configPath, 'utf8');
            const loaded = JSON.parse(data);
            appConfig = { ...appConfig, ...loaded };
            // Ensure window object exists
            if (!appConfig.window) appConfig.window = { x: null, y: null };
        } catch (e) {
            console.error("Error loading config:", e);
        }
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4));
    } catch (e) {
        console.error("Error saving config:", e);
    }
}

loadConfig();

ipcMain.handle('transcribe-audio', async (event, arrayBuffer) => {
    const apiKey = await getGroqApiKey();
    if (!apiKey) {
        return { error: "API Key Missing. Please set GROQ_API_KEY env var or create whisper4u.ini with {'api_keys': {'groq': 'YOUR_KEY'}}." };
    }

    const groq = new Groq({ apiKey });

    // Save buffer to temp file
    const tempFilePath = path.join(os.tmpdir(), `orb_rec_${Date.now()}.webm`); // WebM is typical from MediaRecorder
    try {
        fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

        // Transcribe
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-large-v3-turbo", // Fast and good
            language: "pt", // Portuguese as default
            response_format: "text" // or 'json'
        });

        // Cleanup
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        return { text: transcription };
    } catch (error) {
        console.error("Transcription Error:", error);
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) { }
        }
        return { error: error.message };
    }
});

async function getGroqApiKey() {
    if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
    if (appConfig.api_keys && appConfig.api_keys.groq) return appConfig.api_keys.groq;
    return null;
}

// --- Menu Logic ---
ipcMain.on('menu-opened', () => {
    isMenuOpen = true;
    if (mainWindow) mainWindow.show();
});

ipcMain.on('menu-closed', () => {
    isMenuOpen = false;
    if (mainWindow) mainWindow.hide();
});

// Auto-paste: simulate Ctrl+V to paste into active window
ipcMain.on('auto-paste', () => {
    // Small delay to ensure clipboard is ready and window focus restored
    setTimeout(() => {
        // Use PowerShell to send Ctrl+V (more reliable than uIOhook.keyTap)
        const { exec } = require('child_process');
        exec('powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"');
    }, 200);
});

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 450,
        height: 650,
        title: "Settings - Voice Orb",
        icon: path.join(__dirname, 'icon.png'),
        resizable: false,
        minimizable: false,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        backgroundColor: '#1a1a1a',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    settingsWindow.loadFile('settings.html');

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

// Settings IPC Handlers
ipcMain.on('open-settings', () => {
    createSettingsWindow();
});

ipcMain.on('open-context-menu', () => {
    if (!tray) return;
    tray.popUpContextMenu();
});

// Move window for direct drag support
ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
    if (mainWindow) {
        const [x, y] = mainWindow.getPosition();
        mainWindow.setPosition(x + deltaX, y + deltaY);
    }
});

// Enable/disable mouse capture for orb circle
ipcMain.on('set-mouse-capture', (event, capture) => {
    if (mainWindow) {
        if (capture) {
            mainWindow.setIgnoreMouseEvents(false);
        } else {
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
        }
    }
});

ipcMain.handle('get-config', () => {
    loadConfig();
    return appConfig;
});

ipcMain.handle('save-config', (event, newConfig) => {
    // Update config
    appConfig = { ...appConfig, ...newConfig };
    saveConfig();

    // Apply changes
    if (mainWindow && newConfig.orb_scale) {
        // Send config update to orb
        // mainWindow.webContents.send('config-updated', newConfig);
        // For now, simpler to just reload or let user reload
    }

    return true;
});


ipcMain.on('preview-config', (event, newConfig) => {
    if (mainWindow) {
        mainWindow.webContents.send('config-updated', newConfig);
        // Note: Window size is fixed. Only the 3D orb scales visually.
    }
});

// Show overlay preview text
ipcMain.on('show-overlay-preview', (event, text) => {
    if (mainWindow) {
        mainWindow.webContents.send('show-overlay-text', text);
    }
});

let isSettingsOpen = false;

// Settings window opened - show orb
ipcMain.on('settings-opened', () => {
    isSettingsOpen = true;
    if (mainWindow) {
        mainWindow.show();
        mainWindow.webContents.send('fade-in');
    }
});

// Settings window closed - orb stays visible now
ipcMain.on('settings-closed', () => {
    isSettingsOpen = false;
    // Orb stays visible - no hide logic
});

// Drag Mode Handler
ipcMain.on('set-drag-mode', (event, enabled) => {
    if (mainWindow) {
        if (enabled) {
            // Resize window to match orb size (base is 400x400 at scale 1.0)
            const baseSize = 400;
            const newSize = Math.max(150, Math.round(baseSize * currentOrbScale));
            mainWindow.setSize(newSize, newSize);

            // Enable mouse events for dragging
            mainWindow.setIgnoreMouseEvents(false);
            mainWindow.webContents.send('drag-mode-changed', true);
            mainWindow.focus();
        } else {
            // Restore original size
            mainWindow.setSize(400, 400);

            // Disable mouse events (pass through)
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
            mainWindow.webContents.send('drag-mode-changed', false);
        }
    }
});

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    // Fixed window size - orb scales visually inside this window
    const winSize = 500;
    let winX = width - winSize - 20;
    let winY = height - winSize - 20;

    // Override with saved position if valid
    if (appConfig.window && typeof appConfig.window.x === 'number') {
        winX = appConfig.window.x;
        winY = appConfig.window.y;
    }

    mainWindow = new BrowserWindow({
        width: winSize,
        height: winSize,
        x: winX,
        y: winY,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        show: false, // Start hidden
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });

    // Save position on move
    mainWindow.on('moved', () => {
        const pos = mainWindow.getPosition();
        appConfig.window.x = pos[0];
        appConfig.window.y = pos[1];
        saveConfig();
    });

    mainWindow.loadFile('voice_orb.html');
    // mainWindow.webContents.openDevTools({ mode: 'detach' }); // Disabled

    // Enable click-through with forwarding - renderer will control when to capture
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    // --- Global Input Hooks ---
    let isRecording = false; // Track recording state to prevent duplicate events
    const currentlyPressed = new Set();
    let hideTimeout = null;

    function isShortcutActive() {
        if (!appConfig.shortcut || appConfig.shortcut.length === 0) return false;
        // Check if every key in the config shortcut is currently in the pressed Set
        return appConfig.shortcut.every(code => currentlyPressed.has(code));
    }

    uIOhook.on('keydown', (e) => {
        currentlyPressed.add(e.keycode);

        if (isShortcutActive()) {
            if (isRecording) return;

            // Cancel any pending hide operation
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }

            if (mainWindow) {
                mainWindow.webContents.send('fade-in');
                if (!mainWindow.isVisible()) mainWindow.showInactive();

                isRecording = true;
                mainWindow.webContents.send('start-recording');
            }
        }
    });

    uIOhook.on('keyup', (e) => {
        // Only stop if this key was part of the shortcut
        const wasPartOfShortcut = appConfig.shortcut && appConfig.shortcut.includes(e.keycode);
        currentlyPressed.delete(e.keycode);

        if (wasPartOfShortcut && isRecording) {
            // Check if shortcut is still theoretically active (in case of double-binds etc)
            // but usually any key release from the combo should stop it
            if (!isShortcutActive()) {
                if (mainWindow && !isMenuOpen) {
                    isRecording = false;
                    mainWindow.webContents.send('stop-recording');
                }
            }
        }
    });

    uIOhook.start();
}

app.whenReady().then(() => {
    // System Tray Setup
    const iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Voice Orb AI', enabled: false },
        { type: 'separator' },
        { label: 'Settings...', click: createSettingsWindow },
        { type: 'separator' },
        { label: 'Show Orb', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.webContents.send('fade-in'); } } },
        { label: 'Hide Orb', click: () => { if (mainWindow) { mainWindow.webContents.send('fade-out'); setTimeout(() => mainWindow.hide(), 500); } } },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                // Save position before quitting
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const [x, y] = mainWindow.getPosition();
                    appConfig.window = { x, y };
                    saveConfig();
                }
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Voice Orb AI');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.webContents.send('fade-out');
                setTimeout(() => mainWindow.hide(), 500);
            } else {
                mainWindow.show();
                mainWindow.webContents.send('fade-in');
            }
        }
    });

    createWindow();

    // Orb stays always visible now - just show it on startup
    if (mainWindow) {
        mainWindow.show();
    }

    // Auto-grant permissions for microphone access
    const { session } = require('electron');
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audioCapture', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
            callback(true); // Approve permission
        } else {
            callback(false);
        }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        const allowedPermissions = ['media', 'audioCapture', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
            return true; // Approve check
        }
        return false;
    });

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => {
    // Save window position before quitting
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const [x, y] = mainWindow.getPosition();
            appConfig.window = { x, y };
            saveConfig();
        }
    } catch (e) {
        // Ignore errors during quit
    }
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
