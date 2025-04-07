// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// Pinata upload function
async function uploadToPinata(file, apiKey, secretApiKey) {
    const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'pinata_api_key': apiKey,
                'pinata_secret_api_key': secretApiKey,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Pinata upload failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.IpfsHash;
    } catch (error) {
        console.error('Error uploading to Pinata:', error);
        throw error;
    }
}

window.uploadToPinata = uploadToPinata;

// Mock SuiClient and SuiWallet for testing
class SuiClient {
    constructor({ url }) {
        this.url = url;
    }
    async callContract({ packageObjectId, module, function: func, arguments: args }) {
        return null; // Mock returns null
    }
}

window.SuiWallet = {
    getWallet: async () => ({
        requestAccounts: async () => ['0x6e8b65e7f53772bd5f4d9588f07deb4b30d0fff3a8aa0d4fc6103a92d45fff0a'],
        signAndExecuteTransaction: async (tx) => {
            return { digest: 'mock-digest' };
        },
    }),
};

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBMYvcmBUSlRTlGuFHc_hzBTOBWHv-_tSg",
    authDomain: "adwall-c2ee6.firebaseapp.com",
    projectId: "adwall-c2ee6",
    storageBucket: "adwall-c2ee6.firebasestorage.app",
    messagingSenderId: "357735706499",
    appId: "1:357735706499:web:002eb0c35c1762fcdf50b6",
    measurementId: "G-VYWTFFL6ZK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Constants
const GRID_WIDTH = 200;
const GRID_HEIGHT = 200;
const BLOCK_SIZE = 10;
let zoomLevel = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX, startY;
let touchStartTime, touchStartX, touchStartY; // For tap detection
const TAP_THRESHOLD = 10; // Max pixels moved to consider it a tap
const TAP_DURATION = 300; // Max milliseconds for a tap

// Canvas setup
const canvas = document.getElementById('ad-grid');
const ctx = canvas.getContext('2d');

// UI elements
const toggleControls = document.getElementById('toggle-controls');
const guideButton = document.getElementById('guide-button');
const controlPanel = document.getElementById('control-panel');
const connectButton = document.getElementById('connect-wallet');
const walletAddressSpan = document.getElementById('wallet-address');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');
const imageUpload = document.getElementById('image-upload');
const captionInput = document.getElementById('caption-input');
const buyButton = document.getElementById('buy-button');
const uploadImageButton = document.getElementById('upload-image-button');
const uploadSection = document.getElementById('upload-section');
const pricePerBlockDisplay = document.getElementById('price-per-block');
const priceDisplay = document.getElementById('price-display');
const priceEstimationDisplay = document.getElementById('price-estimation');
const zoomSlider = document.getElementById('zoom-slider');
const tooltip = document.getElementById('tooltip');
const toast = document.getElementById('toast');
const loadingScreen = document.createElement('div');
const guideModal = document.getElementById('guide-modal');
const closeGuideButton = document.getElementById('close-guide');

// State
let walletConnected = false;
let selectedX = 0;
let selectedY = 0;
let blocks = new Array(GRID_WIDTH * GRID_HEIGHT).fill(null);
let images = new Map(); // Stores { element: HTMLImageElement, isGif: boolean }
let wallet;
let lastPurchasedBlockId = null;
let walletAddress = null;
let isLoading = true;

// Pinata configuration
const pinataApiKey = '98f595dcac5c827de322';
const pinataSecretApiKey = '31b9bdfbde939194fb574ef5190424d68108a784505442103479eaf723060646';

// Contract configuration
const CONTRACT_ADDRESS = '0xf417ef5831a31a5f2f9b28104c79f13bbb6feb74f9ce6f4e8aecfe0818630e63';
const SUI_TESTNET = 'https://fullnode.testnet.sui.io:443';

// Initialize Sui client
const suiClient = new SuiClient({ url: SUI_TESTNET });

// Setup futuristic loading screen
function setupLoadingScreen() {
    loadingScreen.id = 'loading-screen';
    loadingScreen.innerHTML = `
        <div class="loader">
            <div class="cyber-circle"></div>
            <div class="cyber-text">Initializing AdWall Matrix...</div>
        </div>
    `;
    document.body.appendChild(loadingScreen);

    const style = document.createElement('style');
    style.textContent = `
        #loading-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            transition: opacity 0.5s ease-out;
        }
        .loader {
            text-align: center;
        }
        .cyber-circle {
            width: 100px;
            height: 100px;
            border: 4px solid #00ffff;
            border-radius: 50%;
            border-top-color: #ff00ff;
            animation: spin 1s linear infinite, pulse 2s infinite;
            margin: 0 auto 20px;
        }
        .cyber-text {
            color: #00ffff;
            font-family: 'Courier New', monospace;
            font-size: 24px;
            text-shadow: 0 0 10px #00ffff;
            animation: flicker 1.5s infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 10px #00ffff; }
            50% { box-shadow: 0 0 20px #ff00ff; }
            100% { box-shadow: 0 0 10px #00ffff; }
        }
        @keyframes flicker {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
    `;
    document.head.appendChild(style);
}

// Hide loading screen
function hideLoadingScreen() {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        isLoading = false;
        animate(); // Start animation loop
    }, 500);
}

// Helper function for image loading with GIF support
async function loadImageWithTimeout(src, timeout = 10000) {
    const gateways = [
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/'
    ];
    
    for (const gateway of gateways) {
        try {
            return await new Promise((resolve, reject) => {
                const img = document.createElement('img');
                img.style.display = 'none';
                document.body.appendChild(img);
                const timer = setTimeout(() => reject(new Error('Image load timeout')), timeout);
                img.onload = () => {
                    clearTimeout(timer);
                    const isGif = src.toLowerCase().endsWith('.gif');
                    resolve({ element: img, isGif });
                };
                img.onerror = () => {
                    clearTimeout(timer);
                    document.body.removeChild(img);
                    reject(new Error('Image load failed'));
                };
                img.src = `${gateway}${src.split('/ipfs/')[1] || src}`;
            });
        } catch (error) {
            console.warn(`Failed with gateway ${gateway}:`, error);
            if (gateway === gateways[gateway.length - 1]) throw error;
            continue;
        }
    }
}

// Show toast notification
function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// Update canvas size
function updateCanvasSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}

// Show tooltip at specific position
function showTooltip(x, y, caption) {
    console.log(`Showing tooltip at (${x}, ${y}) with caption: "${caption}"`);
    tooltip.textContent = caption || 'No caption provided';
    tooltip.style.left = `${x + 10}px`;
    tooltip.style.top = `${y + 10}px`;
    tooltip.style.display = 'block';
}

// Draw grid with animation support
function drawGrid(mouseX = null, mouseY = null) {
    if (isLoading) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const visibleWidth = canvas.width / (BLOCK_SIZE * zoomLevel);
    const visibleHeight = canvas.height / (BLOCK_SIZE * zoomLevel);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
    const startXGrid = Math.max(0, Math.floor(-offsetX / (BLOCK_SIZE * zoomLevel)));
    const startYGrid = Math.max(0, Math.floor(-offsetY / (BLOCK_SIZE * zoomLevel)));
    const endXGrid = Math.min(GRID_WIDTH, startXGrid + Math.ceil(visibleWidth) + 1);
    const endYGrid = Math.min(GRID_HEIGHT, startYGrid + Math.ceil(visibleHeight) + 1);

    for (let x = startXGrid; x <= endXGrid; x++) {
        ctx.beginPath();
        ctx.moveTo(x * BLOCK_SIZE * zoomLevel, startYGrid * BLOCK_SIZE * zoomLevel);
        ctx.lineTo(x * BLOCK_SIZE * zoomLevel, endYGrid * BLOCK_SIZE * zoomLevel);
        ctx.stroke();
    }
    for (let y = startYGrid; y <= endYGrid; y++) {
        ctx.beginPath();
        ctx.moveTo(startXGrid * BLOCK_SIZE * zoomLevel, y * BLOCK_SIZE * zoomLevel);
        ctx.lineTo(endXGrid * BLOCK_SIZE * zoomLevel, y * BLOCK_SIZE * zoomLevel);
        ctx.stroke();
    }

    let tooltipShown = false;
    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
        const block = blocks[i];
        if (block && block.isTopLeft) {
            const x = (i % GRID_WIDTH) * BLOCK_SIZE * zoomLevel;
            const y = Math.floor(i / GRID_WIDTH) * BLOCK_SIZE * zoomLevel;

            if (block.imageCid) {
                const imageData = images.get(block.imageCid);
                if (imageData && imageData.element && imageData.element.complete && imageData.element.naturalWidth !== 0) {
                    ctx.drawImage(imageData.element, x, y, block.width * BLOCK_SIZE * zoomLevel, block.height * BLOCK_SIZE * zoomLevel);
                } else {
                    ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
                    ctx.fillRect(x, y, block.width * BLOCK_SIZE * zoomLevel, block.height * BLOCK_SIZE * zoomLevel);
                }
            } else {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.fillRect(x, y, block.width * BLOCK_SIZE * zoomLevel, block.height * BLOCK_SIZE * zoomLevel);
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.strokeRect(x, y, block.width * BLOCK_SIZE * zoomLevel, block.height * BLOCK_SIZE * zoomLevel);
            }
        }
    }

    if (mouseX !== null && mouseY !== null) {
        const gridX = Math.floor((mouseX - offsetX) / (BLOCK_SIZE * zoomLevel));
        const gridY = Math.floor((mouseY - offsetY) / (BLOCK_SIZE * zoomLevel));
        const blockId = gridY * GRID_WIDTH + gridX;
        const block = blocks[blockId];
        if (block && block.imageCid) {
            const topLeftId = (Math.floor(blockId / GRID_WIDTH) - (block.isTopLeft ? 0 : block.height - 1)) * GRID_WIDTH + (blockId % GRID_WIDTH) - (block.isTopLeft ? 0 : block.width - 1);
            const topLeftBlock = blocks[topLeftId];
            if (topLeftBlock && topLeftBlock.isTopLeft && topLeftBlock.imageCid) {
                showTooltip(mouseX, mouseY, topLeftBlock.caption);
                tooltipShown = true;
            }
        }
    }

    if (!tooltipShown) {
        tooltip.style.display = 'none';
    }

    const width = parseInt(widthInput.value) || 1;
    const height = parseInt(heightInput.value) || 1;
    ctx.fillStyle = 'rgba(255, 165, 0, 0.5)';
    ctx.strokeStyle = '#ffaa00';
    ctx.fillRect(selectedX * BLOCK_SIZE * zoomLevel, selectedY * BLOCK_SIZE * zoomLevel, width * BLOCK_SIZE * zoomLevel, height * BLOCK_SIZE * zoomLevel);
    ctx.strokeRect(selectedX * BLOCK_SIZE * zoomLevel, selectedY * BLOCK_SIZE * zoomLevel, width * BLOCK_SIZE * zoomLevel, height * BLOCK_SIZE * zoomLevel);

    ctx.restore();
}

// Animation loop
function animate() {
    drawGrid();
    requestAnimationFrame(animate);
}

// Save canvas state to Firebase
async function saveCanvasState() {
    if (!walletAddress) {
        showToast('Please connect your wallet first', 5000);
        return;
    }
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');
        const canvasDoc = doc(db, 'canvas', 'gridState');
        const stateToSave = {
            blocks: blocks.map(block => block ? {
                owner: block.owner,
                imageCid: block.imageCid,
                width: block.width,
                height: block.height,
                isTopLeft: block.isTopLeft,
                caption: block.caption || 'No caption set'
            } : null),
            timestamp: Date.now()
        };
        await setDoc(canvasDoc, stateToSave);
        console.log('Canvas state saved to Firebase');
    } catch (error) {
        console.error('Error saving canvas state:', error);
        showToast('Failed to save canvas state: ' + error.message, 5000);
    }
}

// Load canvas state from Firebase with default caption
async function loadCanvasState() {
    try {
        const canvasDoc = doc(db, 'canvas', 'gridState');
        const docSnap = await getDoc(canvasDoc);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            blocks = data.blocks.map(block => block ? {
                owner: block.owner,
                imageCid: block.imageCid,
                width: block.width,
                height: block.height,
                isTopLeft: block.isTopLeft,
                caption: block.caption !== undefined ? block.caption : 'No caption set'
            } : null);
            
            const imagePromises = blocks
                .filter(block => block?.imageCid && !images.has(block.imageCid))
                .map(async (block) => {
                    try {
                        const imageData = await loadImageWithTimeout(`https://ipfs.io/ipfs/${block.imageCid}`);
                        images.set(block.imageCid, imageData);
                    } catch (error) {
                        console.warn(`Failed to load image ${block.imageCid}:`, error);
                    }
                });

            drawGrid();
            console.log('Canvas state loaded from Firebase:', blocks.filter(b => b && b.imageCid).length, 'blocks with images');
            hideLoadingScreen();
            await Promise.all(imagePromises);
            return true;
        }
        hideLoadingScreen();
        return false;
    } catch (error) {
        console.error('Error loading canvas state:', error);
        showToast('Failed to load canvas state: ' + error.message, 5000);
        hideLoadingScreen();
        return false;
    }
}

// Setup real-time listener
function setupRealtimeListener() {
    const canvasDoc = doc(db, 'canvas', 'gridState');
    onSnapshot(canvasDoc, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            blocks = data.blocks.map(block => block ? {
                owner: block.owner,
                imageCid: block.imageCid,
                width: block.width,
                height: block.height,
                isTopLeft: block.isTopLeft,
                caption: block.caption !== undefined ? block.caption : 'No caption set'
            } : null);
            console.log('Realtime update received:', blocks.filter(b => b && b.imageCid).length, 'blocks with images');
        }
    }, (error) => {
        console.error('Realtime listener error:', error);
        showToast('Realtime update failed: ' + error.message, 5000);
    });
}

// Toggle controls
toggleControls.addEventListener('click', () => {
    controlPanel.classList.toggle('hidden');
    toggleControls.textContent = controlPanel.classList.contains('hidden') ? 'Show Controls' : 'Hide Controls';
});

// Guide button functionality
guideButton.addEventListener('click', () => {
    guideModal.style.display = 'flex';
});

closeGuideButton.addEventListener('click', () => {
    guideModal.style.display = 'none';
});

// Zoom functionality
zoomSlider.addEventListener('input', () => {
    const oldZoom = zoomLevel;
    zoomLevel = parseFloat(zoomSlider.value);
    const centerX = (canvas.width / 2 - offsetX) / oldZoom;
    const centerY = (canvas.height / 2 - offsetY) / oldZoom;
    offsetX = canvas.width / 2 - centerX * zoomLevel;
    offsetY = canvas.height / 2 - centerY * zoomLevel;
});

// Connect wallet and authenticate with Firebase
connectButton.addEventListener('click', async () => {
    try {
        if (!window.SuiWallet) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!window.SuiWallet) {
                throw new Error('Sui Wallet extension not detected. Please install it and refresh.');
            }
        }

        if (!auth || !auth.app) {
            throw new Error('Firebase Auth not initialized correctly');
        }

        wallet = await window.SuiWallet.getWallet();
        const accounts = await wallet.requestAccounts();
        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found');
        }

        walletAddress = accounts[0];
        walletAddressSpan.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

        console.log('Signing in anonymously...');
        const userCredential = await signInAnonymously(auth);
        console.log('Signed in as:', userCredential.user.uid);

        walletConnected = true;
        buyButton.disabled = false;
        connectButton.textContent = 'Connected';
        connectButton.disabled = true;

        showToast('Wallet connected successfully!');
        await fetchGridData();
    } catch (error) {
        console.error('Wallet connection failed:', error);
        showToast(`Failed to connect wallet: ${error.message}`, 5000);
        walletConnected = false;
        buyButton.disabled = true;
        connectButton.textContent = 'Connect Wallet';
        connectButton.disabled = false;
        walletAddressSpan.textContent = 'Not connected';
    }
});

// Canvas interaction handlers (Mouse)
canvas.addEventListener('mousedown', (e) => {
    if (isLoading) return;
    isDragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
    if (isLoading) return;
    if (isDragging) {
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        const maxOffsetX = 0;
        const minOffsetX = -(GRID_WIDTH * BLOCK_SIZE * zoomLevel - canvas.width);
        const maxOffsetY = 0;
        const minOffsetY = -(GRID_HEIGHT * BLOCK_SIZE * zoomLevel - canvas.height);
        offsetX = Math.min(maxOffsetX, Math.max(minOffsetX, offsetX));
        offsetY = Math.min(maxOffsetY, Math.max(minOffsetY, offsetY));
    } else {
        const rect = canvas.getBoundingClientRect();
        drawGrid(e.clientX - rect.left, e.clientY - rect.top); // Show tooltip on hover
    }
});

canvas.addEventListener('mouseup', () => {
    if (isLoading) return;
    isDragging = false;
    canvas.style.cursor = 'default';
});

canvas.addEventListener('mouseleave', () => {
    if (isLoading) return;
    isDragging = false;
    canvas.style.cursor = 'default';
    tooltip.style.display = 'none';
});

// Canvas interaction handlers (Touch)
canvas.addEventListener('touchstart', (e) => {
    if (isLoading) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    startX = touch.clientX - offsetX;
    startY = touch.clientY - offsetY;
    e.preventDefault();
});

canvas.addEventListener('touchmove', (e) => {
    if (isLoading) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    // Only start dragging if moved beyond threshold
    if (!isDragging && (Math.abs(deltaX) > TAP_THRESHOLD || Math.abs(deltaY) > TAP_THRESHOLD)) {
        isDragging = true;
        canvas.style.cursor = 'grabbing';
    }

    if (isDragging) {
        offsetX = touch.clientX - startX;
        offsetY = touch.clientY - startY;
        const maxOffsetX = 0;
        const minOffsetX = -(GRID_WIDTH * BLOCK_SIZE * zoomLevel - canvas.width);
        const maxOffsetY = 0;
        const minOffsetY = -(GRID_HEIGHT * BLOCK_SIZE * zoomLevel - canvas.height);
        offsetX = Math.min(maxOffsetX, Math.max(minOffsetX, offsetX));
        offsetY = Math.min(maxOffsetY, Math.max(minOffsetY, offsetY));
    }
    e.preventDefault();
});

canvas.addEventListener('touchend', (e) => {
    if (isLoading) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const duration = Date.now() - touchStartTime;

    if (!isDragging && Math.abs(deltaX) <= TAP_THRESHOLD && Math.abs(deltaY) <= TAP_THRESHOLD && duration <= TAP_DURATION) {
        // Handle tap
        const rect = canvas.getBoundingClientRect();
        const mouseX = touch.clientX - rect.left;
        const mouseY = touch.clientY - rect.top;
        
        const gridX = Math.floor((mouseX - offsetX) / (BLOCK_SIZE * zoomLevel));
        const gridY = Math.floor((mouseY - offsetY) / (BLOCK_SIZE * zoomLevel));
        const blockId = gridY * GRID_WIDTH + gridX;
        const block = blocks[blockId];

        if (block && block.imageCid) {
            const topLeftId = (Math.floor(blockId / GRID_WIDTH) - (block.isTopLeft ? 0 : block.height - 1)) * GRID_WIDTH + (blockId % GRID_WIDTH) - (block.isTopLeft ? 0 : block.width - 1);
            const topLeftBlock = blocks[topLeftId];
            if (topLeftBlock && topLeftBlock.isTopLeft && topLeftBlock.imageCid) {
                console.log(`Tapped block ${blockId} (top-left: ${topLeftId}) with imageCid: ${topLeftBlock.imageCid}, caption: ${topLeftBlock.caption}`);
                showTooltip(mouseX, mouseY, topLeftBlock.caption);
                setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 3000); // Hide after 3 seconds
                return;
            }
        }

        // Select block if not an ad
        selectedX = Math.max(0, Math.min(gridX, GRID_WIDTH - (parseInt(widthInput.value) || 1)));
        selectedY = Math.max(0, Math.min(gridY, GRID_HEIGHT - (parseInt(heightInput.value) || 1)));
        updatePrice();
    }

    isDragging = false;
    canvas.style.cursor = 'default';
    e.preventDefault();
});

// Mouse click handler (unchanged for desktop)
canvas.addEventListener('click', (e) => {
    if (isLoading) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const gridX = Math.floor((mouseX - offsetX) / (BLOCK_SIZE * zoomLevel));
    const gridY = Math.floor((mouseY - offsetY) / (BLOCK_SIZE * zoomLevel));
    const blockId = gridY * GRID_WIDTH + gridX;
    const block = blocks[blockId];

    if (block && block.imageCid) {
        const topLeftId = (Math.floor(blockId / GRID_WIDTH) - (block.isTopLeft ? 0 : block.height - 1)) * GRID_WIDTH + (blockId % GRID_WIDTH) - (block.isTopLeft ? 0 : block.width - 1);
        const topLeftBlock = blocks[topLeftId];
        if (topLeftBlock && topLeftBlock.isTopLeft && topLeftBlock.imageCid) {
            console.log(`Clicked block ${blockId} (top-left: ${topLeftId}) with imageCid: ${topLeftBlock.imageCid}, caption: ${topLeftBlock.caption}`);
            showTooltip(mouseX, mouseY, topLeftBlock.caption);
            setTimeout(() => {
                tooltip.style.display = 'none';
            }, 3000);
            return;
        }
    }

    selectedX = Math.max(0, Math.min(gridX, GRID_WIDTH - (parseInt(widthInput.value) || 1)));
    selectedY = Math.max(0, Math.min(gridY, GRID_HEIGHT - (parseInt(heightInput.value) || 1)));
    updatePrice();
});

// Update price
widthInput.addEventListener('input', updatePrice);
heightInput.addEventListener('input', updatePrice);

async function updatePrice() {
    const width = parseInt(widthInput.value) || 1;
    const height = parseInt(heightInput.value) || 1;
    const numBlocks = width * height;

    const pricePerBlock = await getBlockPrice(selectedX + selectedY * GRID_WIDTH);
    let totalPrice = pricePerBlock * numBlocks;

    if (numBlocks >= 21) totalPrice *= 0.9;
    else if (numBlocks >= 6) totalPrice *= 0.95;

    pricePerBlockDisplay.textContent = (pricePerBlock / 1e9).toFixed(2);
    priceDisplay.textContent = (totalPrice / 1e9).toFixed(2);

    const estimatedWidth = width * 2;
    const estimatedHeight = height * 2;
    const estimatedNumBlocks = estimatedWidth * estimatedHeight;
    let estimatedPrice = pricePerBlock * estimatedNumBlocks;
    if (estimatedNumBlocks >= 21) estimatedPrice *= 0.9;
    else if (estimatedNumBlocks >= 6) estimatedPrice *= 0.95;
    priceEstimationDisplay.textContent = `${(estimatedPrice / 1e9).toFixed(2)} Test SUI for ${estimatedWidth}x${estimatedHeight} blocks`;
}

// Fetch grid data with default caption
async function fetchGridData() {
    try {
        const loadedFromFirebase = await loadCanvasState();
        
        if (!loadedFromFirebase && walletAddress) {
            for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
                try {
                    const [owner] = await suiClient.callContract({
                        packageObjectId: CONTRACT_ADDRESS,
                        module: 'ad_wall',
                        function: 'get_block_owner',
                        arguments: [i.toString()],
                    }) || ['0x0'];

                    if (owner !== '0x0') {
                        const [imageCid] = await suiClient.callContract({
                            packageObjectId: CONTRACT_ADDRESS,
                            module: 'ad_wall',
                            function: 'get_block_image',
                            arguments: [i.toString()],
                        }) || [null];

                        blocks[i] = {
                            owner,
                            imageCid: imageCid || null,
                            width: 1,
                            height: 1,
                            isTopLeft: true,
                            caption: imageCid ? 'No caption set' : null
                        };

                        if (imageCid && !images.has(imageCid)) {
                            const imageData = await loadImageWithTimeout(`https://ipfs.io/ipfs/${imageCid}`);
                            images.set(imageCid, imageData);
                        }
                    }
                } catch (e) {
                    console.warn(`Error fetching block ${i}`, e);
                }
            }
            await saveCanvasState();
        }
    } catch (error) {
        console.error('Error fetching grid data:', error);
        showToast('Failed to fetch grid data: ' + error.message, 5000);
        hideLoadingScreen();
    }
}

// Get block price
async function getBlockPrice(blockId) {
    const price = await suiClient.callContract({
        packageObjectId: CONTRACT_ADDRESS,
        module: 'ad_wall',
        function: 'get_block_price',
        arguments: [blockId.toString()],
    });
    return price ? price[0] : 100_000_000; // Default price
}

// Buy blocks
buyButton.addEventListener('click', async () => {
    if (!walletConnected || !walletAddress) {
        showToast('Please connect your wallet first', 5000);
        return;
    }

    const width = parseInt(widthInput.value) || 1;
    const height = parseInt(heightInput.value) || 1;

    if (selectedX + width > GRID_WIDTH || selectedY + height > GRID_HEIGHT) {
        alert('Selected area is outside the grid boundaries.');
        return;
    }

    for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
            const blockId = (selectedY + i) * GRID_WIDTH + (selectedX + j);
            if (blocks[blockId]) {
                alert('One or more selected blocks are already taken.');
                return;
            }
        }
    }

    buyButton.disabled = true;
    buyButton.textContent = 'Processing...';

    try {
        const tx = {
            packageObjectId: CONTRACT_ADDRESS,
            module: 'ad_wall',
            function: 'buy_blocks',
            typeArguments: [],
            arguments: [
                selectedX.toString(),
                selectedY.toString(),
                width.toString(),
                height.toString(),
                "",
            ],
            gasBudget: 30000000,
        };

        const result = await wallet.signAndExecuteTransaction(tx);
        console.log('Transaction successful:', result);

        const blockId = selectedY * GRID_WIDTH + selectedX;
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                const currentBlockId = (selectedY + i) * GRID_WIDTH + (selectedX + j);
                blocks[currentBlockId] = {
                    owner: walletAddress,
                    imageCid: null,
                    width,
                    height,
                    isTopLeft: i === 0 && j === 0,
                    caption: null
                };
            }
        }

        lastPurchasedBlockId = blockId;
        uploadSection.style.display = 'block';
        showToast('Blocks purchased successfully! Now upload your ad.');
        await saveCanvasState();
    } catch (error) {
        console.error('Purchase failed:', error);
        showToast('Failed to buy blocks: ' + error.message, 5000);
    } finally {
        buyButton.disabled = false;
        buyButton.textContent = 'Buy Blocks';
    }
});

// Upload image with GIF support and caption
uploadImageButton.addEventListener('click', async () => {
    if (!lastPurchasedBlockId) {
        alert('Please purchase blocks first.');
        return;
    }
    if (!walletConnected || !walletAddress) {
        showToast('Please connect your wallet first', 5000);
        return;
    }

    const file = imageUpload.files[0];
    if (!file) {
        alert('Please select an image to upload.');
        return;
    }

    const caption = captionInput.value.trim() || null;

    uploadImageButton.disabled = true;
    uploadImageButton.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                pinata_api_key: pinataApiKey,
                pinata_secret_api_key: pinataSecretApiKey,
            },
            body: formData,
        });
        const pinataData = await pinataResponse.json();
        const imageCid = pinataData.IpfsHash;

        const block = blocks[lastPurchasedBlockId];
        const width = block.width;
        const height = block.height;
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                const currentBlockId = (selectedY + i) * GRID_WIDTH + (selectedX + j);
                blocks[currentBlockId].imageCid = imageCid;
                blocks[currentBlockId].caption = caption || 'No caption set';
            }
        }

        const imageData = await loadImageWithTimeout(`https://ipfs.io/ipfs/${imageCid}`);
        images.set(imageCid, imageData);
        showToast('Ad uploaded successfully!');
        uploadSection.style.display = 'none';
        captionInput.value = '';
        lastPurchasedBlockId = null;
        await saveCanvasState();
        console.log('Uploaded block with imageCid:', imageCid, 'caption:', caption || 'No caption set');
    } catch (error) {
        console.error('Image upload failed:', error);
        showToast('Failed to upload ad: ' + error.message, 5000);
    } finally {
        uploadImageButton.disabled = false;
        uploadImageButton.textContent = 'Add Ad';
    }
});

// Initial setup with loading screen and notes
window.addEventListener('load', () => {
    setupLoadingScreen();
    const testPhaseNote = document.getElementById('test-phase-note');
    const closeNoteButton = document.getElementById('close-note');
    const fundingNote = document.getElementById('funding-note');
    const closeFundingNoteButton = document.getElementById('close-funding-note');

    testPhaseNote.style.display = 'block';
    setTimeout(() => {
        closeNoteButton.disabled = false;
    }, 3000);

    closeNoteButton.addEventListener('click', () => {
        testPhaseNote.style.display = 'none';
        fundingNote.style.display = 'block';
    });

    closeFundingNoteButton.addEventListener('click', () => {
        fundingNote.style.display = 'none';
    });

    fetchGridData();
    setupRealtimeListener();
});

window.addEventListener("load", async () => {
    console.log("Grid Data Loaded on Refresh", blocks);
    updateCanvasSize();
});

window.addEventListener('resize', updateCanvasSize);