const { ipcRenderer } = require('electron');

// Get slider elements
const scaleSlider = document.getElementById('orb-scale');
const scaleValue = document.getElementById('scale-value');

const orbOpacitySlider = document.getElementById('orb-opacity');
const orbOpacityValue = document.getElementById('orb-opacity-value');

const opacitySlider = document.getElementById('overlay-opacity');
const opacityValue = document.getElementById('opacity-value');
const showOverlayCheck = document.getElementById('show-overlay');

const presetSelector = document.getElementById('preset-selector');
const shortcutKey1 = document.getElementById('shortcut-key-1');
const shortcutKey2 = document.getElementById('shortcut-key-2');

// SIMPLE SCALE: Slider value IS the scale (no mapping!)
// Slider range: 0.3 to 1.5, step 0.1

// Helper to send preview (real-time updates)
function sendPreview() {
    const config = {
        orb_scale: parseFloat(scaleSlider.value),
        orb_opacity: parseFloat(orbOpacitySlider.value),
        overlay_opacity: parseFloat(opacitySlider.value),
        show_overlay: showOverlayCheck.checked,
        preset: parseInt(presetSelector.value),
        shortcut: [parseInt(shortcutKey1.value), parseInt(shortcutKey2.value)].filter(k => k > 0)
    };
    ipcRenderer.send('preview-config', config);
}

// Helper to save config
async function saveConfig() {
    const groqKey = document.getElementById('groq-key').value.trim();

    const newConfig = {
        api_keys: { groq: groqKey },
        orb_scale: parseFloat(scaleSlider.value),
        orb_opacity: parseFloat(orbOpacitySlider.value),
        overlay_opacity: parseFloat(opacitySlider.value),
        show_overlay: showOverlayCheck.checked,
        preset: parseInt(presetSelector.value),
        shortcut: [parseInt(shortcutKey1.value), parseInt(shortcutKey2.value)].filter(k => k > 0)
    };

    try {
        await ipcRenderer.invoke('save-config', newConfig);
        console.log('Settings saved on close');
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

// Real-time preview for all controls
presetSelector.addEventListener('change', sendPreview);
shortcutKey1.addEventListener('change', sendPreview);
shortcutKey2.addEventListener('change', sendPreview);

scaleSlider.addEventListener('input', () => {
    scaleValue.textContent = parseFloat(scaleSlider.value).toFixed(1);
    sendPreview();
});

orbOpacitySlider.addEventListener('input', () => {
    const percent = Math.round(parseFloat(orbOpacitySlider.value) * 100);
    orbOpacityValue.textContent = percent + '%';
    sendPreview();
});

opacitySlider.addEventListener('input', () => {
    opacityValue.textContent = parseFloat(opacitySlider.value).toFixed(1);
    sendPreview();
});

showOverlayCheck.addEventListener('change', () => {
    sendPreview();
    // Show example text when enabled
    if (showOverlayCheck.checked) {
        ipcRenderer.send('show-overlay-preview', 'This is the text');
    }
});

// Load settings on start and show orb
document.addEventListener('DOMContentLoaded', async () => {
    ipcRenderer.send('settings-opened');

    try {
        const config = await ipcRenderer.invoke('get-config');

        if (config.api_keys && config.api_keys.groq) {
            document.getElementById('groq-key').value = config.api_keys.groq;
        }

        if (config.orb_scale !== undefined) {
            // Direct value - no mapping!
            scaleSlider.value = config.orb_scale;
            scaleValue.textContent = parseFloat(config.orb_scale).toFixed(1);
        }

        if (config.orb_opacity !== undefined) {
            orbOpacitySlider.value = config.orb_opacity;
            orbOpacityValue.textContent = Math.round(config.orb_opacity * 100) + '%';
        }

        if (config.overlay_opacity !== undefined) {
            opacitySlider.value = config.overlay_opacity;
            opacityValue.textContent = parseFloat(config.overlay_opacity).toFixed(1);
        }

        if (config.show_overlay !== undefined) {
            showOverlayCheck.checked = config.show_overlay;
        }

        if (config.preset !== undefined) {
            presetSelector.value = config.preset;
        }

        if (config.shortcut && Array.isArray(config.shortcut)) {
            if (config.shortcut[0]) shortcutKey1.value = config.shortcut[0];
            if (config.shortcut[1]) shortcutKey2.value = config.shortcut[1];
            else shortcutKey2.value = "0";
        }

    } catch (e) {
        console.error("Failed to load config:", e);
    }
});

// Also save on window close (X button)
window.addEventListener('beforeunload', () => {
    saveConfig();
    ipcRenderer.send('settings-closed');
});
