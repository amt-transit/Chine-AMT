let html5QrcodeScanner;
let currentScannedColis = null;
let currentScanMode = 'chargement';
let currentScannedColisIndex = null;
let sessionScans = []; // Stocke les scans de la session active
let compressedPhotos = []; // Stocke les photos redimensionnées avant upload

const scanModes = {
    'chargement': { label: 'Chargement', status: 'Au chargement', color: '#f39c12', icon: 'fas fa-truck-loading' },
    'dechargement': { label: 'Déchargement', status: 'Au déchargement', color: '#17a2b8', icon: 'fas fa-box-open' },
    'livraison': { label: 'Livraison', status: 'En livraison', color: '#8e44ad', icon: 'fas fa-motorcycle' },
    'livre': { label: 'Livré', status: 'Livré', color: '#27ae60', icon: 'fas fa-check-circle' }
};

function setScanMode(mode) {
    currentScanMode = mode;
    // Mettre à jour l'UI des onglets
    document.querySelectorAll('.sub-nav-link').forEach(btn => btn.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + mode);
    if (activeTab) activeTab.classList.add('active');
    
    // Mettre à jour le bouton d'action du scan
    const btn = document.getElementById('btn-action-scan');
    if(btn) {
        const conf = scanModes[mode];
        btn.innerHTML = `<i class="${conf.icon}"></i> ${conf.label}`;
        btn.style.backgroundColor = conf.color;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Instanciation du scanner
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);

    updateOfflineBanner();
    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
});

// Fonction pour jouer un bip sonore court
function jouerSonScan() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Note La (A5)
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.1);
    } catch(e) { console.error("Erreur audio", e); }
}

function onScanSuccess(decodedText, decodedResult) {
    // Pause de la caméra pour éviter les scans multiples
    if(html5QrcodeScanner.getState() === 2) { // 2 = SCANNING
        html5QrcodeScanner.pause();
    }
    jouerSonScan();
    document.getElementById('manual-ref').value = decodedText;
    rechercherColis(decodedText.trim());
}

function onScanFailure(error) {
    // Erreurs ignorées (le scanner lit constamment la vidéo)
}

function rechercheManuelle() {
    const ref = document.getElementById('manual-ref').value.trim();
    if (ref) rechercherColis(ref);
}

async function rechercherColis(ref) {
    document.getElementById('scan-status').innerText = `Recherche de la référence : ${ref}...`;
    document.getElementById('scan-result').style.display = 'none';
    
    let scanRef = ref.trim();
    let baseRef = scanRef;
    let cIdx = null;

    try {
        let snap = await db.collection('expeditions').where('reference', '==', baseRef).limit(1).get();
        if (snap.empty) {
            const lastUnderscore = scanRef.lastIndexOf('_');
            if (lastUnderscore > 0) {
                baseRef = scanRef.substring(0, lastUnderscore);
                cIdx = parseInt(scanRef.substring(lastUnderscore + 1));
                snap = await db.collection('expeditions').where('reference', '==', baseRef).limit(1).get();
            }
        }
        if (snap.empty) {
            showCustomAlert(`Colis introuvable pour la référence : ${scanRef}`, 'error');
            document.getElementById('scan-status').innerText = "Prêt à scanner.";
            if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume(); // 3 = PAUSED
            return;
        }
        
        currentScannedColis = { id: snap.docs[0].id, ...snap.docs[0].data() };
        currentScannedColisIndex = cIdx;
        afficherResultat(currentScannedColis);
        document.getElementById('scan-status').innerText = "Colis identifié.";
    } catch(e) {
        console.error(e);
        showCustomAlert("Erreur réseau lors de la recherche.", 'error');
        if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
    }
}

function afficherResultat(c) {
    document.getElementById('res-client').innerText = `${c.nom} ${c.prenom}`;
    document.getElementById('res-ref').innerText = c.reference;
    document.getElementById('res-tel').innerText = c.tel;
    document.getElementById('res-desc').innerText = `${c.quantiteEnvoyee} colis - ${c.description}`;
    document.getElementById('res-pv').innerText = c.type.startsWith('aerien') ? `${c.poidsEnvoye || 0} Kg` : `${c.volumeEnvoye || 0} CBM`;
    document.getElementById('res-statut').innerText = c.status || 'En attente';
    
    let pB = parseInt((c.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN = pB + (c.fraisSupplementaires || 0) - (c.remise || 0);
    let reste = pN - (parseInt(c.montantPaye) || 0);
    document.getElementById('res-reste').innerText = formatArgent(reste) + " CFA";

    // Génération de la checklist des sous-colis
    // On vérifie la checklist propre à l'étape en cours
    let scannes = c[`colisScannes_${currentScanMode}`] || [];
    // Rétrocompatibilité : si aucun chargement trouvé et qu'on est en mode chargement, regarder l'ancienne variable
    if (currentScanMode === 'chargement' && scannes.length === 0) scannes = c.colisScannes || [];
    
    let qte = parseInt(c.quantiteEnvoyee) || 1;
    let chkHtml = '<div style="margin-top:12px; padding-top:12px; border-top:1px solid #ddd;"><strong>Détail des colis :</strong><div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;">';
    for(let i=1; i<=qte; i++) {
        let isCurrent = (i === currentScannedColisIndex);
        let isScanned = scannes.includes(i) || isCurrent;
        let icon = isScanned ? '✅' : '❌';
        let color = isScanned ? '#27ae60' : '#c0392b';
        let bg = isCurrent ? '#e8f5e9' : '#fff';
        let border = isCurrent ? '2px solid #27ae60' : '1px solid #eee';
        let fw = isCurrent ? 'bold' : 'normal';
        let txt = isCurrent ? 'Scanné' : (scannes.includes(i) ? 'Pointé' : 'Attente');
        chkHtml += `<div style="background:${bg}; border:${border}; border-radius:6px; padding:6px; font-size:12px; font-weight:${fw};">
            ${icon} Colis ${i}/${qte} <span style="float:right; color:${color}">${txt}</span>
        </div>`;
    }
    chkHtml += '</div></div>';
    document.getElementById('res-checklist').innerHTML = chkHtml;

    // Injection de l'interface de capture photo pour le chargement
    let photoUI = document.getElementById('photo-capture-ui');
    if (!photoUI) {
        photoUI = document.createElement('div');
        photoUI.id = 'photo-capture-ui';
        document.getElementById('res-checklist').after(photoUI);
    }
    
    let modeLabel = scanModes[currentScanMode].label;
        photoUI.innerHTML = `
            <div style="margin-top:12px; padding-top:12px; border-top:1px solid #ddd;">
            <strong>📸 Photos du ${modeLabel.toLowerCase()} (Optionnel) :</strong>
            <input type="file" id="scan-photos" accept="image/*" capture="environment" multiple style="margin-top:8px; width:100%; font-size:14px; padding:8px; border:1.5px dashed #ccc; border-radius:8px;">
            <div id="apercu-photos-scan" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
            </div>
        `;
    document.getElementById('scan-photos').addEventListener('change', async function() {
        const d = document.getElementById('apercu-photos-scan');
        d.innerHTML = '<span style="font-size:12px;color:#888;font-weight:bold;">⏳ Compression en cours...</span>';
        compressedPhotos = [];
        
        for (let file of this.files) {
            if (file.type.startsWith('image/')) {
                const compressedFile = await compresserImage(file);
                compressedPhotos.push(compressedFile);
            }
        }
        
            d.innerHTML = '';
        compressedPhotos.forEach(f => {
            const i = document.createElement('img');
            i.src = URL.createObjectURL(f);
            i.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #ddd;';
            d.appendChild(i);
        });
        });
        photoUI.style.display = 'block';

    document.getElementById('scan-result').style.display = 'block';
}

async function executerActionScan() {
    if(!currentScannedColis) return;
    const actionBtn = document.getElementById('btn-action-scan');
    if(actionBtn) { actionBtn.disabled = true; actionBtn.style.opacity = '0.6'; }
    document.getElementById('scan-status').innerText = "Enregistrement en cours...";

    const conf = scanModes[currentScanMode];
    let isOfflineSaved = false;

    if (!navigator.onLine) {
        // Sauvegarde locale si pas d'internet
        sauvegarderScanHorsLigne(currentScannedColis.id, currentScanMode, currentScannedColisIndex, conf.status);
        isOfflineSaved = true;
    } else {
        // Tentative d'envoi classique
        let updates = { 
            status: conf.status,
            dateModification: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if(currentScanMode === 'dechargement' || currentScanMode === 'livre') {
            updates.estArrive = true;
        }
        if (currentScannedColisIndex !== null) {
            updates.colisScannes = firebase.firestore.FieldValue.arrayUnion(currentScannedColisIndex);
            updates[`colisScannes_${currentScanMode}`] = firebase.firestore.FieldValue.arrayUnion(currentScannedColisIndex);
        }

        try {
            await db.collection('expeditions').doc(currentScannedColis.id).update(updates);
            if (compressedPhotos.length > 0) {
                uploaderPhotosEnArrierePlan(currentScannedColis.id, currentScannedColis.reference, currentScanMode, compressedPhotos);
                compressedPhotos = []; 
            }
        } catch(err) {
            console.warn("Erreur réseau Firestore, basculement en mode hors-ligne...", err);
            sauvegarderScanHorsLigne(currentScannedColis.id, currentScanMode, currentScannedColisIndex, conf.status);
            isOfflineSaved = true;
        }
    }
    
    // Ajouter à l'historique de session
    sessionScans.unshift({
        heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        action: conf.label + (isOfflineSaved ? ' (Hors-ligne)' : ''), actionColor: conf.color,
        ref: currentScannedColis.reference, client: `${currentScannedColis.nom} ${currentScannedColis.prenom}`
    });
    
    showCustomAlert(isOfflineSaved ? `✅ Scan enregistré hors-ligne ! (À synchroniser)` : `Le colis a été marqué : ${conf.status} !`, 'success');
    document.getElementById('scan-result').style.display = 'none';
    document.getElementById('scan-status').innerText = "Prêt à scanner.";
    document.getElementById('manual-ref').value = '';
    renderSessionScans();
    if(actionBtn) { actionBtn.disabled = false; actionBtn.style.opacity = '1'; }
    if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
}

function renderSessionScans() {
    const container = document.getElementById('session-scans-card');
    const tbody = document.getElementById('tbody-session-scans');
    if (sessionScans.length === 0) { container.style.display = 'none'; return; }
    
    container.style.display = 'block';
    let html = '';
    sessionScans.forEach(s => {
        html += `<tr>
            <td data-label="Heure">${s.heure}</td>
            <td data-label="Action"><span class="status-badge" style="background:${s.actionColor}; font-size:10px;">${s.action}</span></td>
            <td data-label="Réf."><strong>${s.ref}</strong></td>
            <td data-label="Client">${s.client}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function allerPayerScan() {
    localStorage.setItem('autoOpenColisId', currentScannedColis.id);
    window.location.href = 'reception.html';
}

// ==========================================
// UTILITAIRES : COMPRESSION & UPLOAD ASYNC
// ==========================================

async function compresserImage(file, maxWidth = 1024) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(newFile);
                }, 'image/jpeg', 0.7); // 70% de qualité
            };
        };
    });
}

async function uploaderPhotosEnArrierePlan(docId, reference, scanMode, photosToUpload) {
    const urls = [];
    for (let file of photosToUpload) {
        try {
            const ref = storage.ref(`${scanMode}/${reference}/${Date.now()}_${file.name}`);
            await ref.put(file);
            const url = await ref.getDownloadURL();
            urls.push(url);
        } catch (err) {
            console.error("Erreur d'upload en arrière-plan :", err);
        }
    }
    if (urls.length > 0) {
        let imgUpdates = { [`photos_${scanMode}`]: firebase.firestore.FieldValue.arrayUnion(...urls) };
        if (scanMode === 'chargement') imgUpdates.photosChargement = firebase.firestore.FieldValue.arrayUnion(...urls);
        await db.collection('expeditions').doc(docId).update(imgUpdates);
    }
}

// ==========================================
// MODE HORS-LIGNE (OFFLINE SYNC)
// ==========================================

function updateOfflineBanner() {
    const offlineScans = JSON.parse(localStorage.getItem('amt_offline_scans') || '[]');
    const banner = document.getElementById('offline-banner');
    const countSpan = document.getElementById('offline-count');
    if (banner && countSpan) {
        if (offlineScans.length > 0) {
            banner.style.display = 'block';
            countSpan.innerText = offlineScans.length;
            if (navigator.onLine) {
                banner.style.background = '#27ae60'; // Vert: Prêt à synchroniser
                banner.innerHTML = `<i class="fas fa-wifi"></i> Synchroniser les scans en attente (<span id="offline-count">${offlineScans.length}</span>)`;
            } else {
                banner.style.background = '#f39c12'; // Orange: Hors-ligne
                banner.innerHTML = `<i class="fas fa-plane-slash"></i> Mode Hors-Ligne : ${offlineScans.length} scan(s) en attente`;
            }
        } else {
            banner.style.display = 'none';
        }
    }
}

function sauvegarderScanHorsLigne(id, scanMode, scannedIndex, status) {
    let offlineScans = JSON.parse(localStorage.getItem('amt_offline_scans') || '[]');
    offlineScans.push({ id: id, scanMode: scanMode, scannedIndex: scannedIndex, status: status, timestamp: Date.now() });
    localStorage.setItem('amt_offline_scans', JSON.stringify(offlineScans));
    updateOfflineBanner();
}

async function synchroniserScansHorsLigne() {
    if (!navigator.onLine) {
        showCustomAlert("Vous êtes toujours hors-ligne. Connectez-vous à Internet pour synchroniser.", 'warning');
        return;
    }
    
    let offlineScans = JSON.parse(localStorage.getItem('amt_offline_scans') || '[]');
    if (offlineScans.length === 0) return;

    const banner = document.getElementById('offline-banner');
    banner.innerHTML = '⏳ Synchronisation en cours...';
    banner.style.pointerEvents = 'none';

    try {
        const batch = db.batch();
        offlineScans.forEach(scan => {
            const docRef = db.collection('expeditions').doc(scan.id);
            let updates = { status: scan.status, dateModification: firebase.firestore.FieldValue.serverTimestamp() };
            if (scan.scanMode === 'dechargement' || scan.scanMode === 'livre') updates.estArrive = true;
            if (scan.scannedIndex !== null) {
                updates.colisScannes = firebase.firestore.FieldValue.arrayUnion(scan.scannedIndex);
                updates[`colisScannes_${scan.scanMode}`] = firebase.firestore.FieldValue.arrayUnion(scan.scannedIndex);
            }
            batch.update(docRef, updates);
        });

        await batch.commit();
        localStorage.removeItem('amt_offline_scans');
        showCustomAlert(`✅ ${offlineScans.length} scan(s) synchronisé(s) avec succès !`, 'success');
    } catch (e) {
        console.error("Erreur Sync:", e);
        showCustomAlert("Erreur lors de la synchronisation : " + e.message, 'error');
    } finally {
        banner.style.pointerEvents = 'auto';
        updateOfflineBanner();
    }
}