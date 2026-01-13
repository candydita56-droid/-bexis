import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import L from "https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js";

// --- 1. YOUR AI BRAIN ---
const URL_MODEL = "https://teachablemachine.withgoogle.com/models/2KNvF2Sda/";

// --- 2. YOUR DATABASE (PASTE YOUR FIREBASE KEYS HERE) ---
const firebaseConfig = {
  apiKey: "AIzaSyDgFj6bpL_rrzdnv5LcoeXd-VTYWyhahDk",
  authDomain: "recon-database-2f0c1.firebaseapp.com",
  projectId: "recon-database-2f0c1",
  storageBucket: "recon-database-2f0c1.firebasestorage.app",
  messagingSenderId: "331060784794",
  appId: "1:331060784794:web:a39ae38a64806eadea3923",
  measurementId: "G-MLVBC1WPLY"
};

// --- INITIALIZATION ---
// Initialize Firebase (fail silently if no keys provided so map still works)
let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
} catch (e) {
    console.warn("Firebase not configured. Team sync disabled.");
}

// Initialize Map
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false 
}).setView([42.3314, -83.0458], 18); // Default to Detroit (High abandoned density)

// Add Satellite Layer (Using Esri)
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    crossOrigin: true // ESSENTIAL for AI to see the images
}).addTo(map);

// Update coordinates on screen move
map.on('move', () => {
    const center = map.getCenter();
    document.getElementById('lat-disp').innerText = center.lat.toFixed(4);
    document.getElementById('lng-disp').innerText = center.lng.toFixed(4);
});

// Load the AI Model
let model;
async function loadAI() {
    const readout = document.getElementById("scan-readout");
    readout.innerText = "LOADING NEURAL NET...";
    try {
        const modelURL = URL_MODEL + "model.json";
        const metadataURL = URL_MODEL + "metadata.json";
        model = await tmImage.load(modelURL, metadataURL);
        readout.innerText = "AI ONLINE. READY.";
    } catch (e) {
        readout.innerText = "AI ERROR (CHECK CONSOLE)";
    }
}
loadAI();

// --- THE SCANNER LOGIC ---
window.initiateScan = async function() {
    const readout = document.getElementById("scan-readout");
    const bar = document.getElementById("confidence-meter");
    const btn = document.getElementById("scan-btn");

    if (!model) return;

    btn.disabled = true;
    readout.innerText = "CAPTURING OPTICAL DATA...";
    bar.style.width = "0%";
    bar.style.background = "#0f0";

    // 1. Capture the map view as an image
    // Note: We use useCORS to try to bypass security blocks on map tiles
    html2canvas(document.getElementById("map"), {
        useCORS: true,
        allowTaint: true,
        ignoreElements: (element) => element.id === 'ui-overlay' // Don't scan the UI buttons
    }).then(async canvas => {
        
        readout.innerText = "ANALYZING STRUCTURE...";
        
        // 2. Feed the image to the AI
        const prediction = await model.predict(canvas);
        
        // Find the "Abandoned" score
        // (Assuming Class 0 is Abandoned based on your training order, check console to be sure)
        const abandonedScore = prediction.find(p => p.className === "Abandoned").probability;
        const normalScore = prediction.find(p => p.className === "Normal").probability;

        // 3. Display Results
        const percent = (abandonedScore * 100).toFixed(1);
        bar.style.width = percent + "%";
        
        if (abandonedScore > 0.70) {
            // HIGH CONFIDENCE MATCH
            readout.innerText = `TARGET CONFIRMED (${percent}%)`;
            bar.style.background = "#f00"; // Red for danger/target
            markLocation("Abandoned Structure", abandonedScore);
        } else if (abandonedScore > 0.40) {
            // UNCERTAIN
            readout.innerText = `POSSIBLE MATCH (${percent}%)`;
            bar.style.background = "#fa0"; // Orange
        } else {
            // CLEAN
            readout.innerText = "SECTOR CLEAR";
            bar.style.background = "#0f0"; // Green
        }
        
        btn.disabled = false;
        
    }).catch(err => {
        console.error(err);
        readout.innerText = "SENSOR OBSTRUCTION (CORS)";
        btn.disabled = false;
    });
};

// --- MARKER SYSTEM ---
function markLocation(type, confidence) {
    const center = map.getCenter();
    
    // Add visual marker locally
    L.circleMarker(center, {
        color: '#f00',
        radius: 20
    }).addTo(map).bindPopup(`CONFIDENCE: ${(confidence*100).toFixed(0)}%`);

    // Sync to Team Database
    if(db) {
        const locId = Date.now();
        set(ref(db, 'targets/' + locId), {
            lat: center.lat,
            lng: center.lng,
            confidence: confidence,
            finder: "Agent_1",
            timestamp: Date.now()
        });
    }
}

// Listen for team updates
if(db) {
    onValue(ref(db, 'targets/'), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => {
                const t = data[key];
                L.circleMarker([t.lat, t.lng], {
                    color: '#f00',
                    fillColor: '#f00',
                    fillOpacity: 0.3,
                    radius: 10
                }).addTo(map);
            });
        }
    });
}
