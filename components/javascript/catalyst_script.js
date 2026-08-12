// ===================================
// Image Upload & SVG Manager
// JavaScript File - Simplified Application
// ===================================

// ===================================
// STATE MANAGEMENT
// ===================================

const appState = {
    images: [], // Array of uploaded image objects
    currentSpriteName: null, // Name of the currently retrieved sprite
};

// ===================================
// API BASE URL
// ===================================
const API_BASE = 'https://spriteforge-60068995555.development.catalystserverless.in/server/spriteForgeJoin/';

// ===================================
// UTILITY FUNCTIONS
// ===================================

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

/**
 * Generates a unique ID
 * @returns {string} Unique identifier
 */
function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Converts a file to base64
 * @param {File} file - File to convert
 * @returns {Promise<string>} Base64 string
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Converts image to SVG (wrapper approach)
 * @param {string} base64Data - Base64 image data
 * @param {string} iconName - Name of the icon
 * @returns {string} SVG code
 */
function imageToSVG(base64Data, iconName) {
    const svgCode = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <image href="${base64Data}" x="0" y="0" width="100" height="100"/>
</svg>`;
    return svgCode;
}

/**
 * Extracts viewBox from SVG code
 * @param {string} svgCode - SVG code
 * @returns {string} ViewBox value (e.g., "0 0 100 100")
 */
function extractViewBox(svgCode) {
    try {
        const viewBoxMatch = svgCode.match(/viewBox=["']([^"']+)["']/i);
        return viewBoxMatch ? viewBoxMatch[1] : '0 0 100 100';
    } catch {
        return '0 0 100 100';
    }
}

/**
 * Preserves and applies fill attribute from root SVG to paths
 * @param {string} svgContent - SVG content with paths
 * @param {string} rootFill - Fill attribute from root SVG
 * @returns {string} SVG content with fill applied to paths
 */
function applyRootFill(svgContent, rootFill) {
    if (!rootFill) return svgContent;
    
    try {
        // Add fill to path elements that don't have fill attribute
        return svgContent.replace(/<path([^>]*)>/g, (match, attributes) => {
            if (!attributes.includes('fill=')) {
                return `<path fill="${rootFill}"${attributes}>`;
            }
            return match;
        });
    } catch {
        return svgContent;
    }
}

/**
 * Parses SVG and extracts path elements
 * @param {string} svgCode - SVG code
 * @returns {object} Object with svgCode, viewBox, and fill
 */
function parseSVG(svgCode) {
    try {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgCode, 'image/svg+xml');
        
        if (svgDoc.documentElement.tagName === 'parsererror') {
            throw new Error('Invalid SVG');
        }
        
        // Extract viewBox and fill from root SVG element
        const viewBox = svgDoc.documentElement.getAttribute('viewBox') || '0 0 100 100';
        const rootFill = svgDoc.documentElement.getAttribute('fill');
        
        // Extract all paths, circles, rects, etc.
        const shapes = [];
        const elements = svgDoc.querySelectorAll('path, circle, rect, polygon, polyline, line, g');
        
        elements.forEach(el => {
            if (el.tagName === 'g') {
                shapes.push(el.outerHTML);
            } else {
                // Clone and clean attributes
                const clone = el.cloneNode(true);
                // Remove unwanted attributes
                ['id', 'class', 'data-*'].forEach(attr => {
                    if (clone.hasAttribute(attr)) {
                        clone.removeAttribute(attr);
                    }
                });
                shapes.push(clone.outerHTML);
            }
        });
        
        let content = shapes.length > 0 ? shapes.join('\n') : svgCode;
        
        // Apply root fill attribute to paths if present
        if (rootFill) {
            content = applyRootFill(content, rootFill);
        }
        
        return { svgCode: content, viewBox, fill: rootFill || 'none' };
    } catch (error) {
        console.error('SVG Parse Error:', error);
        return { svgCode, viewBox: '0 0 100 100' };
    }
}

/**
 * Generates a simple SVG from text prompt with smart keyword matching
 * @param {string} prompt - Text description
 * @returns {string} SVG code
 */
function generateSVGFromPrompt(prompt) {
    const text = prompt.toLowerCase().trim();
    let svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n';
    
    // ========== CIRCLE ICONS ==========
    if (text.includes('circle')) {
        // Circle icons with different content
        if (text.includes('info')) {
            // Circle with "i" inside (info icon)
            svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
            svg += '    <text x="50" y="60" font-size="30" font-weight="bold" text-anchor="middle" fill="currentColor">i</text>\n';
        } else if (text.includes('close') || text.includes('x') || text.includes('cross')) {
            // Circle with X (close icon)
            svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
            svg += '    <line x1="35" y1="35" x2="65" y2="65" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>\n';
            svg += '    <line x1="65" y1="35" x2="35" y2="65" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>\n';
        } else if (text.includes('plus') || text.includes('add')) {
            // Circle with plus (add icon)
            svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
            svg += '    <line x1="50" y1="30" x2="50" y2="70" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>\n';
            svg += '    <line x1="30" y1="50" x2="70" y2="50" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>\n';
        } else if (text.includes('minus') || text.includes('remove')) {
            // Circle with minus
            svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
            svg += '    <line x1="30" y1="50" x2="70" y2="50" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>\n';
        } else if (text.includes('check') || text.includes('check mark')) {
            // Circle with checkmark
            svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
            svg += '    <path d="M 35 50 L 45 60 L 65 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>\n';
        } else {
            // Plain circle
            svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        }
    } 
    // ========== TRIANGLE ICONS ==========
    else if (text.includes('triangle')) {
        // Triangle icons
        if (text.includes('up') || text.includes('arrow up')) {
            // Triangle pointing up
            svg += '    <polygon points="50,20 80,80 20,80" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        } else if (text.includes('down') || text.includes('arrow down')) {
            // Triangle pointing down
            svg += '    <polygon points="50,80 80,20 20,20" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        } else if (text.includes('left') || text.includes('arrow left')) {
            // Triangle pointing left
            svg += '    <polygon points="20,50 80,20 80,80" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        } else if (text.includes('right') || text.includes('arrow right')) {
            // Triangle pointing right
            svg += '    <polygon points="80,50 20,80 20,20" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        } else {
            // Plain triangle (upward)
            svg += '    <polygon points="50,20 80,80 20,80" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        }
    } 
    // ========== SQUARE/RECTANGLE ICONS ==========
    else if (text.includes('square') || text.includes('rect')) {
        if (text.includes('play')) {
            // Square with play triangle
            svg += '    <rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>\n';
            svg += '    <polygon points="40,35 40,65 60,50" fill="currentColor"/>\n';
        } else {
            // Plain square
            svg += '    <rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        }
    } 
    // ========== ARROW ICONS ==========
    else if (text.includes('arrow')) {
        if (text.includes('right')) {
            svg += '    <path d="M 30 50 L 70 50 M 60 40 L 70 50 L 60 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n';
        } else if (text.includes('left')) {
            svg += '    <path d="M 70 50 L 30 50 M 40 40 L 30 50 L 40 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n';
        } else if (text.includes('up')) {
            svg += '    <path d="M 50 70 L 50 30 M 40 40 L 50 30 L 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n';
        } else if (text.includes('down')) {
            svg += '    <path d="M 50 30 L 50 70 M 40 60 L 50 70 L 60 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n';
        } else {
            // Default arrow (right)
            svg += '    <path d="M 30 50 L 70 50 M 60 40 L 70 50 L 60 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n';
        }
    }
    // ========== STAR ICON ==========
    else if (text.includes('star')) {
        svg += '    <path d="M 50 10 L 61 40 L 90 40 L 67 60 L 78 90 L 50 70 L 22 90 L 33 60 L 10 40 L 39 40 Z" fill="none" stroke="currentColor" stroke-width="2"/>\n';
    }
    // ========== HEART ICON ==========
    else if (text.includes('heart')) {
        svg += '    <path d="M 50 85 C 20 65, 10 50, 10 40 C 10 25, 25 15, 35 15 C 42 15, 50 20, 50 20 C 50 20, 58 15, 65 15 C 75 15, 90 25, 90 40 C 90 50, 80 65, 50 85 Z" fill="none" stroke="currentColor" stroke-width="2"/>\n';
    }
    // ========== DEFAULT ==========
    else {
        // Default: simple circle
        svg += '    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2"/>\n';
        svg += '    <text x="50" y="60" font-size="40" text-anchor="middle" fill="currentColor">?</text>\n';
    }
    
    svg += '</svg>';
    return svg;
}

// ===================================
// ICON MANAGEMENT
// ===================================

/**
 * Adds an icon to the library
 * @param {string} iconName - Name of the icon
 * @param {string} svgCode - SVG code
 * @param {string} viewBox - ViewBox attribute (optional)
 */
function addIcon(iconName, svgCode, viewBox = '0 0 100 100') {
    if (!iconName.trim()) {
        showToast('Icon name is required', 'error');
        return;
    }

    const icon = {
        id: generateId(),
        name: iconName,
        data: svgCode,      // ✅ CHANGE HERE
        viewBox: viewBox,   // ✅ keep this
        createdAt: new Date().toISOString(),
    };

    appState.images.push(icon);
    renderIconGrid();
    showExportSection();
    showToast(`Icon "${iconName}" added successfully!`, 'success');
}

/**
 * Deletes an icon from the library
 * @param {string} iconId - ID of the icon to delete
 */
function deleteIcon(iconId) {
    appState.images = appState.images.filter(icon => icon.id !== iconId);
    renderIconGrid();
    
    if (appState.images.length === 0) {
        hideExportSection();
    }
    
    showToast('Icon deleted successfully', 'success');
}

/**
 * Renders the icon grid
 */
function renderIconGrid() {
    const grid = document.getElementById('iconGrid');
    const count = document.getElementById('iconCount');
    
    count.textContent = appState.images.length;
    
    if (appState.images.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 64 64" fill="none" stroke="currentColor">
                    <circle cx="32" cy="32" r="30"></circle>
                    <path d="M32 16v32M16 32h32"></path>
                </svg>
                <p>No icons yet</p>
                <p class="small-text">Upload or create icons to get started</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = appState.images.map(icon => `
        <div class="icon-item">
            <div class="icon-preview">
                ${icon.data.includes('<svg') ? icon.data : `<svg viewBox="0 0 100 100">${icon.data}</svg>`}
            </div>
            <span class="icon-name">${icon.name}</span>
            <div class="icon-actions">
                <button class="icon-btn" onclick="deleteIcon('${icon.id}')" title="Delete">✕</button>
            </div>
        </div>
    `).join('');
}

// ===================================
// FILE HANDLING
// ===================================

/**
 * Handles file upload
 * @param {Event} event - File input change event
 */
async function handleFileUpload(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    
    for (let file of files) {
        // Only accept SVG files
        if (!file.type.includes('svg') && !file.name.endsWith('.svg')) {
            showToast(`${file.name} is not an SVG file`, 'error');
            continue;
        }
        
        try {
            const content = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            });
            
            // Parse and constrain SVG to 80x80px
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(content, 'image/svg+xml');
            
            if (svgDoc.documentElement.tagName === 'parsererror') {
                showToast(`${file.name} is not a valid SVG`, 'error');
                continue;
            }
            
            // Get the SVG element
            const svg = svgDoc.documentElement;
            
            // Set/constrain dimensions to 80x80
            svg.setAttribute('width', '80');
            svg.setAttribute('height', '80');
            
            // Ensure viewBox is set for proper scaling
            if (!svg.hasAttribute('viewBox')) {
                svg.setAttribute('viewBox', '0 0 100 100');
            }
            
            // Add preserveAspectRatio for proper centering
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            
            const svgString = new XMLSerializer().serializeToString(svg);
            
            const image = {
                id: generateId(),
                name: file.name,
                data: svgString,
                type: file.type,
                createdAt: new Date().toISOString(),
            };
            
            appState.images.push(image);
            renderImageGrid();
            
        } catch (error) {
            console.error('File upload error:', error);
            showToast(`Error processing ${file.name}`, 'error');
        }
    }
    
    event.target.value = '';
    if (appState.images.length > 0) {
        showToast(`SVG icon(s) added!`, 'success');
    }
}

/**
 * Sets up drag and drop
 */
function setupDragDrop() {
    const dragDropArea = document.getElementById('dragDropArea');
    const fileInput = document.getElementById('fileUpload');
    const selectFileBtn = document.getElementById('selectFileBtn');
    
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', () => fileInput.click());
    }
    
    if (dragDropArea) {
        dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragDropArea.classList.add('drag-over');
        });
        
        dragDropArea.addEventListener('dragleave', () => {
            dragDropArea.classList.remove('drag-over');
        });
        
        dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            fileInput.files = files;
            
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
}

// ===================================
// SVG SPRITE GENERATION
// ===================================

/**
 * Generates SVG sprite with proper structure
 * Fixed width 1000px, flexible height based on icons
 * @returns {string} SVG sprite code
 */
function generateSVGSprite() {
    const iconsPerRow = parseInt(document.getElementById('iconsPerRow').value) || 5;
    const fixedWidth = 1000;
    const spacing = 12;
    const minHeight = 600;
    
    // Calculate icon size based on fixed width and icons per row
    const availableWidth = fixedWidth - spacing * (iconsPerRow + 1);
    const iconSize = Math.floor(availableWidth / iconsPerRow);
    const rowHeight = iconSize + spacing;
    
    const cols = Math.min(iconsPerRow, appState.images.length);
    const rows = Math.ceil(appState.images.length / cols);
    
    const svgHeight = Math.max(minHeight, rows * rowHeight + spacing);
    
    let sprite = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${fixedWidth}px" height="${svgHeight}px" viewBox="0 0 ${fixedWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <style type="text/css">
            /* Icons are visible by default */
            .commonPath {
                display: block;
            }
        </style>
    </defs>
\n`;
    
    // Add all icon definitions as groups with proper SVG wrapping
    appState.images.forEach((icon, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const x = spacing + col * (iconSize + spacing);
        const y = spacing + row * rowHeight;
        
        const sanitizedName = icon.name.replace(/[^a-zA-Z0-9-_]/g, '');
        
        // Create a proper SVG element for each icon
        sprite += `    <g class="commonPath" id="${sanitizedName}ZCI">\n`;
        sprite += `        <svg x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" viewBox="${icon.viewBox}" xmlns="http://www.w3.org/2000/svg">\n`;
        
        // Extract and add SVG content
        let content = icon.data;
        if (icon.data.includes('<svg')) {
            const matches = icon.data.match(/<svg[^>]*>(.*?)<\/svg>/is);
            content = matches ? matches[1] : icon.data;
        }
        sprite += `            ${content}\n`;
        
        sprite += `        </svg>\n`;
        sprite += `    </g>\n`;
    });
    
    // Add symbol definitions for easier reference
    appState.images.forEach((icon) => {
        const sanitizedName = icon.name.replace(/[^a-zA-Z0-9-_]/g, '');
        sprite += `    <symbol viewBox="${icon.viewBox}" id="zcicn-${icon.name.toLowerCase()}">\n`;
        sprite += `        <use href="#${sanitizedName}ZCI"></use>\n`;
        sprite += `    </symbol>\n`;
    });
    
    sprite += `</svg>`;
    
    return sprite;
}

/**
 * Shows the export section
 */
function showExportSection() {
    document.getElementById('exportSection').style.display = 'block';
    updateSpritePreview();
}

/**
 * Hides the export section
 */
function hideExportSection() {
    document.getElementById('exportSection').style.display = 'none';
}

/**
 * Updates the sprite preview
 */
function updateSpritePreview() {
    const preview = document.getElementById('spritePreview');
    const sprite = generateSVGSprite();
    
    // Parse and render SVG properly
    try {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(sprite, 'image/svg+xml');
        
        if (svgDoc.documentElement.tagName === 'parsererror') {
            preview.innerHTML = '<p class="small-text">Error generating sprite preview</p>';
            return;
        }
        
        // Clear previous content
        preview.innerHTML = '';
        
        // Append the parsed SVG
        preview.appendChild(svgDoc.documentElement);
    } catch (error) {
        console.error('Preview render error:', error);
        preview.innerHTML = '<p class="small-text">Error generating sprite preview</p>';
    }
}

// ===================================
// EXPORT FUNCTIONS
// ===================================

/**
 * Downloads a file
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/**
 * Copies text to clipboard
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

/**
 * Downloads SVG sprite
 */
function downloadSprite() {
    const sprite = generateSVGSprite();
    downloadFile(sprite, 'icon-sprite.svg', 'image/svg+xml');
    showToast('Sprite downloaded successfully!', 'success');
}

/**
 * Copies SVG sprite to clipboard
 */
function copySpriteToClipboard() {
    const sprite = generateSVGSprite();
    copyToClipboard(sprite);
}

/**
 * Downloads individual SVG files
 */
function downloadIndividualSVGs() {
    if (appState.images.length === 0) {
        showToast('No icons to download', 'error');
        return;
    }
    
    // Create a single download with all icons
    let zipContent = '';
    appState.images.forEach(icon => {
        const filename = `${icon.name.replace(/\s+/g, '-')}.svg`;
        zipContent += `<!-- ${filename} -->\n${icon.data}\n\n`;
    });
    
    downloadFile(zipContent, 'icons.txt', 'text/plain');
    showToast('Download started - Please import SVGs individually', 'info');
}

/**
 * Generates and downloads CSS file
 */
function downloadCSS() {
    let css = `/* SVG Icon Library CSS */

:root {
    --icon-size: 24px;
    --icon-color: currentColor;
}

.icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--icon-size);
    height: var(--icon-size);
}

.icon svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--icon-color);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

/* Icon Modifiers */
.icon.sm { --icon-size: 16px; }
.icon.lg { --icon-size: 32px; }
.icon.xl { --icon-size: 48px; }

/* Specific Icons */
`;
    
    appState.images.forEach(icon => {
        const className = icon.name.replace(/\s+/g, '-').toLowerCase();
        css += `\n.icon-${className} { /* ${icon.name} */ }`;
    });
    
    downloadFile(css, 'icons.css', 'text/css');
    showToast('CSS file downloaded!', 'success');
}

// ===================================
// IMAGE MANAGEMENT FUNCTIONS
// ===================================

/**
 * Renders the image grid for uploaded images
 */
function renderImageGrid() {
    const grid = document.getElementById('imageGrid');
    const count = document.getElementById('imageCount');
    
    if (!grid) return;
    
    count.textContent = appState.images.length;
    
    if (appState.images.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" style="width: 64px; height: 64px; margin: 0 auto;">
                    <path d="M32 8v48M8 32h48"></path>
                </svg>
                <p style="margin-top: 12px;">No SVG icons yet</p>
                <p style="font-size: 12px; color: #999;">Upload SVG icons to get started</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = appState.images.map(img => `
        <div class="svg-icon-preview">
            <div class="svg-icon-content">
                ${img.data}
            </div>
            <button class="icon-close-btn" onclick="deleteImage('${img.id}')" title="Delete icon">✕</button>
        </div>
    `).join('');
}

/**
 * Deletes an image from the list
 * @param {string} imageId - ID of the image to delete
 */
function deleteImage(imageId) {
    appState.images = appState.images.filter(img => img.id !== imageId);
    renderImageGrid();
    showToast('Image deleted', 'success');
}

/**
 * Shows the duplicate file modal and returns user choice
 * @param {string} name - The duplicate sprite name
 * @returns {Promise<string>} 'replace', 'new', or 'cancel'
 */
function showDuplicateModal(name) {
    return new Promise((resolve) => {
        const modal = document.getElementById('duplicateModal');
        const nameEl = document.getElementById('duplicateFileName');
        const replaceBtn = document.getElementById('modalReplaceBtn');
        const newBtn = document.getElementById('modalNewBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        if (!modal) { resolve('replace'); return; }

        nameEl.textContent = name;
        modal.style.display = 'flex';

        function cleanup(result) {
            modal.style.display = 'none';
            replaceBtn.removeEventListener('click', onReplace);
            newBtn.removeEventListener('click', onNew);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlay);
            resolve(result);
        }

        function onReplace() { cleanup('replace'); }
        function onNew() { cleanup('new'); }
        function onCancel() { cleanup('cancel'); }
        function onOverlay(e) { if (e.target === modal) cleanup('cancel'); }

        replaceBtn.addEventListener('click', onReplace);
        newBtn.addEventListener('click', onNew);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlay);
    });
}

/**
 * Builds the SVG sprite string from current images
 */
function buildSvgSprite() {
    const cols = 3;
    const iconSize = 80;
    const spacing = 10;
    const width = cols * iconSize + (cols + 1) * spacing;
    const rows = Math.ceil(appState.images.length / cols);
    const height = rows * iconSize + (rows + 1) * spacing;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
`;

    appState.images.forEach((img, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const x = spacing + col * (iconSize + spacing);
        const y = spacing + row * (iconSize + spacing);
        const sanitizedName = img.name.replace(/[^a-zA-Z0-9-_]/g, '').replace(/\.svg$/i, '');

        svg += `    <g id="${sanitizedName}" transform="translate(${x}, ${y})">\n`;
        try {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(img.data, 'image/svg+xml');
            const viewBox = svgDoc.documentElement.getAttribute('viewBox') || '0 0 100 100';
            const children = Array.from(svgDoc.documentElement.childNodes)
                .filter(node => node.nodeType === 1)
                .map(node => new XMLSerializer().serializeToString(node))
                .join('\n        ');
            svg += `        <svg width="${iconSize}" height="${iconSize}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">\n`;
            svg += `            ${children}\n`;
            svg += `        </svg>\n`;
        } catch (e) {
            svg += `        ${img.data}\n`;
        }
        svg += `    </g>\n`;
    });
    svg += '</svg>';
    return svg;
}

/**
 * Sends the SVG sprite to the server
 * @param {string} spriteName - Name of the sprite
 * @param {string} svgContent - SVG string
 * @param {string} mode - 'replace' or 'new'
 */
async function sendSpriteToServer(spriteName, svgContent, mode) {
    debugger;
    const response = await fetch(`${API_BASE}/save-sprite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ spriteName, svgContent, mode })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Save failed [${response.status}]:`, errorText);
        showToast('Error saving sprite', 'error');
        return;
    }

    const result = await response.json();
    console.log('Save response vish:', result);

    const savedName = result.spriteName || spriteName;
    appState.currentSpriteName = savedName;

    // Show the direct URL (name-based)
    if (result.fileId) {
        const directUrl = `${API_BASE}/sprite/${encodeURIComponent(savedName)}.svg`;
        const fileIdUrl = `${API_BASE}/get-sprite/${result.fileId}`;
        console.log(`\n✅ Sprite saved!\n  By name: ${directUrl}\n  By ID:   ${fileIdUrl}`);

        const urlSection = document.getElementById('spriteUrlSection');
        const urlInput = document.getElementById('spriteUrlInput');
        if (urlSection && urlInput) {
            urlInput.value = directUrl;
            urlSection.style.display = 'block';
        }
    }

    showToast(`Sprite "${savedName}" saved!`, 'success');
}

/**
 * Saves images (creates SVG sprite and saves to server)
 * Checks for duplicates and shows confirmation modal.
 */
async function saveImages(spriteName) {
    debugger;
    // if (appState.images.length === 0) {
    //     showToast('No images to save', 'error');
    //     return;
    // }

    // let spriteName = prompt('Enter sprite name:', appState.currentSpriteName || 'my-sprite');
    // if (!spriteName || !spriteName.trim()) {
    //     showToast('Sprite name is required', 'error');
    //     return;
    // }
    spriteName = spriteName.trim();
    console.log('Saving sprite as:', spriteName);
    try {
        // Check if name already exists on server
        const checkRes = await fetch(`${API_BASE}/check-sprite/${encodeURIComponent(spriteName)}`, {
            method: 'GET', headers: { 'Accept': 'application/json' }
        });
        const checkData = await checkRes.json();

        let mode = 'replace'; // default

        // if (checkData.exists) {
        //     // Show confirmation dialog
        //     const choice = await showDuplicateModal(spriteName);
        //     if (choice === 'cancel') {
        //         showToast('Save cancelled', 'info');
        //         return;
        //     }
        //     mode = choice; // 'replace' or 'new'
        // }

        const svgCodeEl = document.getElementById('svgCode');
        const svg = svgCodeEl ? svgCodeEl.value || svgCodeEl.textContent : '';
        if (!svg.trim()) {
            showToast('No SVG code found', 'error');
            return;
        }
        await sendSpriteToServer(spriteName, svg, mode);
        // console.log(await sendSpriteToServer(spriteName, svg, mode),"code code code")
        console.log('Sprite svg code',svg);

    } catch (error) {
        console.error('Save error:', error);
        showToast('Error saving sprite', 'error');
    }
}

/**
 * Retrieves saved sprite — fully server-based, no localStorage.
 * Looks up sprite by name on the server, then downloads SVG.
 */
async function retrieveImages() {
    debugger;
    // First fetch the list of saved sprites from the server
    let spriteList = [];
    try {
        const listRes = await fetch(`${API_BASE}/list-sprites`, {
            method: 'GET', headers: { 'Accept': 'application/json' }
        });
        if (listRes.ok) {
            const listData = await listRes.json();
            spriteList = listData.sprites || [];
        }
    } catch (e) {
        console.warn('Could not fetch sprite list:', e.message);
    }

    const hint = spriteList.length > 0
        ? `Saved sprites: ${spriteList.map(s => s.name).join(', ')}`
        : 'No saved sprites found on server';

    const spriteName = prompt(`${hint}\n\nEnter sprite name to retrieve:`, appState.currentSpriteName || '');
    if (!spriteName || !spriteName.trim()) return;

    const trimmedName = spriteName.trim();
    showToast(`Looking up "${trimmedName}"...`, 'info');

    // Look up fileId by name from server
    let fileId = null;
    try {
        const lookupRes = await fetch(
            `${API_BASE}/find-sprite/${encodeURIComponent(trimmedName)}`,
            { method: 'GET', headers: { 'Accept': 'application/json' } }
        );
        if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            fileId = lookupData.fileId;
        } else {
            showToast(`Sprite "${trimmedName}" not found on server`, 'error');
            return;
        }
    } catch (e) {
        showToast(`Server lookup failed: ${e.message}`, 'error');
        return;
    }

    if (!fileId) {
        showToast(`Sprite "${trimmedName}" not found`, 'error');
        return;
    }

    showToast(`Retrieving "${trimmedName}"...`, 'info');
    console.log(`Retrieving sprite "${trimmedName}" with fileId: ${fileId}`);

    try {
        const response = await fetch(
            `${API_BASE}/get-sprite/${encodeURIComponent(fileId)}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'image/svg+xml, application/json, text/plain, */*'
                }
            }
        );

        const responseText = await response.text();

        if (!response.ok) {
            console.error(`Retrieve failed [${response.status}]:`, responseText);

            let errorMsg = 'Sprite not found';
            try {
                const errorJson = JSON.parse(responseText);
                errorMsg = errorJson.message || errorMsg;
            } catch (_) {
                errorMsg = `Server error (${response.status}): ${response.statusText}`;
            }
            showToast(errorMsg, 'error');
            return;
        }

        if (!responseText || !responseText.trim()) {
            showToast('Retrieved empty response', 'error');
            return;
        }
            // For retrieveImg area
        const svgDisplaySection = document.getElementById('svgDisplaySection');
        const svgContainer = document.getElementById('svgPreviewContainer');

        if (svgDisplaySection && svgContainer) {
            svgContainer.innerHTML = responseText;
            svgDisplaySection.style.display = 'block';

            appState.currentSpriteName = trimmedName;

            // Show sprite URL
            const urlSection = document.getElementById('spriteUrlSection');
            const urlInput = document.getElementById('spriteUrlInput');
            if (urlSection && urlInput) {
                urlInput.value = `${API_BASE}/sprite/${encodeURIComponent(trimmedName)}.svg`;
                urlSection.style.display = 'block';
            }

            showToast(`Sprite "${trimmedName}" retrieved!`, 'success');
        }

    } catch (error) {
        console.error('Retrieve error:', error);
        showToast(`Network error: ${error.message}`, 'error');
    }
}

// ===================================
// SAVED SPRITES - SERVER LIST
// ===================================

/**
 * Fetches all saved sprites from the Catalyst server and renders them
 * in the #savedFoldersList grid.
 */
async function loadSavedSpritesFromServer() {
    const list = document.getElementById('savedFoldersList');
    if (!list) return;

    list.innerHTML = '<div class="saved-empty"><p>Loading saved sprites…</p></div>';

    try {
        const res = await fetch(`${API_BASE}/list-sprites`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        const sprites = data.sprites || [];

        if (sprites.length === 0) {
            list.innerHTML =
                '<div class="saved-empty">' +
                  '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">' +
                    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
                  '</svg>' +
                  '<p>No saved sprites on server yet.<br>Generate a sprite and click <strong>"Save to Project"</strong> to store it here.</p>' +
                '</div>';
            return;
        }

        let html = '';
        sprites.forEach(sprite => {
            const name = sprite.name || 'Untitled';
            const fileId = sprite.fileId || '';
            const spriteUrl = `${API_BASE}/sprite/${encodeURIComponent(name)}.svg`;

            html += '<div class="saved-folder-card" data-sprite-name="' + name + '" data-file-id="' + fileId + '">';
            html +=   '<div class="saved-folder-header">';
            html +=     '<div class="saved-folder-icon">';
            html +=       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
            html +=         '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>';
            html +=       '</svg>';
            html +=     '</div>';
            html +=     '<div class="saved-folder-name">' + name + '</div>';
            html +=   '</div>';
            html +=   '<div class="saved-folder-files">';
            html +=     '<div class="saved-file-item">';
            html +=       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
            html +=         '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
            html +=       '</svg>';
            html +=       '<span class="saved-file-name" style="word-break:break-all; font-family:monospace; font-size:11px;">' + spriteUrl + '</span>';
            html +=       '<span class="saved-file-badge svg-badge">svg</span>';
            html +=     '</div>';
            html +=   '</div>';
            html +=   '<div class="saved-folder-actions">';
            html +=     '<button class="btn btn-ghost btn-sm server-sprite-copy-url" data-url="' + spriteUrl + '">';
            html +=       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            html +=       ' Copy URL';
            html +=     '</button>';
            html +=     '<button class="btn btn-ghost btn-sm server-sprite-view" data-name="' + name + '" data-file-id="' + fileId + '">';
            html +=       '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            html +=       ' View';
            html +=     '</button>';
            html +=   '</div>';
            html += '</div>';
        });

        list.innerHTML = html;

    } catch (err) {
        console.error('Failed to load saved sprites:', err);
        list.innerHTML =
            '<div class="saved-empty"><p>Could not load saved sprites from server.<br>' + err.message + '</p></div>';
    }
}

// ===================================
// EVENT LISTENERS & INITIALIZATION
// ===================================



document.addEventListener('DOMContentLoaded', () => {
    if (window.SpriteForge && window.SpriteForge.state) {
        console.info('Skipping legacy catalyst initialization because SpriteForge is active.');
        return;
    }

    // debugger;
    setupDragDrop();
    // const saveBtn = document.getElementById('saveBtn');
    // if (saveBtn) {
    //     saveBtn.addEventListener('click', saveImages);
    // }
    var saveProjectBtn = document.getElementById('saveToProjectBtn');
    if (saveProjectBtn) {
        saveProjectBtn.addEventListener('click', saveImages);
    }
    
    const retrieveBtn = document.getElementById('retrieveBtn');
    if (retrieveBtn) {
        retrieveBtn.addEventListener('click', retrieveImages);
    }
    
    const clearFormBtn = document.getElementById('clearFormBtn');
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', () => {
            appState.images = [];
            renderImageGrid();
            const svgDisplaySection = document.getElementById('svgDisplaySection');
            if (svgDisplaySection) {
                svgDisplaySection.style.display = 'none';
            }
            const fileUpload = document.getElementById('fileUpload');
            if (fileUpload) {
                fileUpload.value = '';
            }
            showToast('All cleared', 'info');
        });
    }
    
    renderImageGrid();

    // Copy URL button
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const urlInput = document.getElementById('spriteUrlInput');
            if (urlInput && urlInput.value) {
                navigator.clipboard.writeText(urlInput.value).then(() => {
                    showToast('URL copied to clipboard!', 'success');
                }).catch(() => {
                    urlInput.select();
                    document.execCommand('copy');
                    showToast('URL copied!', 'success');
                });
            }
        });
    }

    console.log('Image Upload & SVG Manager initialized successfully!');

    // --- Saved Sprites: event delegation for server sprite cards ---
    document.addEventListener('click', (e) => {
        // Copy URL button
        const copyBtn = e.target.closest('.server-sprite-copy-url');
        if (copyBtn) {
            const url = copyBtn.dataset.url;
            navigator.clipboard.writeText(url).then(() => {
                showToast('URL copied to clipboard!', 'success');
            }).catch(() => {
                showToast('Failed to copy URL', 'error');
            });
            return;
        }

        // View button — open sprite URL in new tab
        const viewBtn = e.target.closest('.server-sprite-view');
        if (viewBtn) {
            const name = viewBtn.dataset.name;
            const url = `${API_BASE}/sprite/${encodeURIComponent(name)}.svg`;
            window.open(url, '_blank');
            return;
        }

        // Refresh button — also load server sprites
        if (e.target.closest('#refreshSavedBtn')) {
            loadSavedSpritesFromServer();
        }
    });

    // Override SF.loadSavedFolders to also load server sprites
    if (typeof SF !== 'undefined') {
        const originalLoadSavedFolders = SF.loadSavedFolders;
        SF.loadSavedFolders = function () {
            loadSavedSpritesFromServer();
        };
    }
});