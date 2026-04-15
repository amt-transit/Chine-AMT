// scan.js — Logique Scanner QR (Version améliorée)

let html5QrcodeScanner;
let currentScanMode = 'chargement';
let autoValiderMode = false;
let currentBatchClientData = null;
let batchScannedIndices = [];
let sessionScans = [];
let compressedPhotos = [];

const scanModes = {
    'chargement':  { label: 'Chargement',  status: 'Au chargement',   color: '#f39c12', icon: 'fas fa-truck-loading', emoji: '🚢' },
    'dechargement':{ label: 'Déchargement',status: 'Au déchargement', color: '#17a2b8', icon: 'fas fa-box-open',      emoji: '📦' },
    'livraison':   { label: 'Livraison',   status: 'En livraison',    color: '#8e44ad', icon: 'fas fa-motorcycle',    emoji: '🛵' },
    'livre':       { label: 'Livré',       status: 'Livré',           color: '#27ae60', icon: 'fas fa-check-circle',  emoji: '✅' },
};

// ─── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 240, height: 240 } },
        false
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);

    // Photos
    document.getElementById('scan-photos').addEventListener('change', async function () {
        const preview = document.getElementById('apercu-photos-scan');
        preview.innerHTML = '<span style="font-size:12px;color:#888;">⏳ Compression...</span>';
        compressedPhotos = [];
        for (const file of this.files) {
            if (file.type.startsWith('image/')) {
                const c = await compresserImage(file);
                compressedPhotos.push(c);
            }
        }
        preview.innerHTML = '';
        compressedPhotos.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #ddd;';
            preview.appendChild(img);
        });
    });

    updateOfflineBanner();
    window.addEventListener('online',  updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
});

// ─── Mode sélection ─────────────────────────────────────
function setScanMode(mode, cardEl) {
    currentScanMode = mode;
    const conf = scanModes[mode];

    // Mettre à jour les cartes
    document.querySelectorAll('.scan-mode-card').forEach(c => {
        c.classList.remove('selected');
        c.style.borderColor = '#e0e0e0';
        c.querySelector('.mode-name').style.color = '';
    });
    if (cardEl) {
        cardEl.classList.add('selected');
        cardEl.style.borderColor = conf.color;
        cardEl.querySelector('.mode-name').style.color = conf.color;
    }

    // Mettre à jour le bouton de validation
    const btn = document.getElementById('btn-action-scan');
    const lbl = document.getElementById('btn-action-label');
    if (btn) btn.style.background = conf.color;
    if (lbl) lbl.textContent = `${conf.emoji} Valider — ${conf.label}`;

    // Statut
    document.getElementById('scan-status').textContent = `Mode : ${conf.label} — Prêt à scanner`;
}

// ─── Auto-valider ────────────────────────────────────────
function toggleAutoValider() {
    autoValiderMode = !autoValiderMode;
    const track = document.getElementById('auto-toggle');
    track.classList.toggle('on', autoValiderMode);
}

// ─── Sons & vibration ────────────────────────────────────
function jouerSonScan(success = true) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(success ? 880 : 330, ctx.currentTime);
        if (!success) osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + (success ? 0.12 : 0.3));
        osc.stop(ctx.currentTime + (success ? 0.12 : 0.3));
    } catch (e) { /* silencieux */ }
}

function vibrer(pattern = [60]) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

// ─── Callbacks scanner ───────────────────────────────────
function onScanSuccess(decodedText) {
    if (html5QrcodeScanner.getState() === 2) html5QrcodeScanner.pause();
    jouerSonScan(true);
    vibrer([60]);
    document.getElementById('manual-ref').value = decodedText;
    traiterScanRafale(decodedText.trim());
}
function onScanFailure() { /* ignoré */ }

function rechercheManuelle() {
    const ref = document.getElementById('manual-ref').value.trim();
    if (ref) traiterScanRafale(ref);
}

// ─── Logique rafale ──────────────────────────────────────
async function traiterScanRafale(scanRef) {
    scanRef = scanRef.trim();
    let baseRef = scanRef;
    let cIdx = null;

    // Découpage ref: supporte MRT-XXX_1 et MRT-XXX-1
    const lu = scanRef.lastIndexOf('_');
    if (lu > 0) {
        baseRef = scanRef.substring(0, lu);
        cIdx = parseInt(scanRef.substring(lu + 1));
    } else {
        const ld = scanRef.lastIndexOf('-');
        if (ld > 0 && !isNaN(parseInt(scanRef.substring(ld + 1)))) {
            baseRef = scanRef.substring(0, ld);
            cIdx = parseInt(scanRef.substring(ld + 1));
        }
    }

    // Lot en cours — vérification de collision
    if (currentBatchClientData) {
        if (currentBatchClientData.reference !== baseRef) {
            jouerSonScan(false);
            vibrer([100, 50, 100]);
            showCustomAlert(
                `⚠️ MAUVAIS CLIENT !\n\nCe colis appartient à un autre dossier.\nTerminez d'abord le lot de ${currentBatchClientData.nom} ou annulez-le.`,
                'warning'
            ).then(() => { if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume(); });
            return;
        }
        // Même client — ajouter au lot
        if (cIdx && !batchScannedIndices.includes(cIdx)) {
            batchScannedIndices.push(cIdx);
            jouerSonScan(true);
            vibrer([40]);
        }
        updateBatchUI();

        // Auto-valider si le lot est complet
        if (autoValiderMode && batchScannedIndices.length >= (currentBatchClientData.quantiteEnvoyee || 1)) {
            passerEtapeValidation();
            setTimeout(() => executerActionScan(), 300);
            return;
        }
        if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
        return;
    }

    // 1er scan du lot — charger les données
    document.getElementById('scan-status').textContent = `Recherche : ${baseRef}…`;
    try {
        const snap = await db.collection('expeditions').where('reference', '==', baseRef).limit(1).get();
        if (snap.empty) {
            jouerSonScan(false);
            vibrer([200, 100, 200]);
            showCustomAlert(`❌ Colis introuvable : ${baseRef}`, 'error');
            document.getElementById('scan-status').textContent = 'Prêt à scanner.';
            if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
            return;
        }
        currentBatchClientData = { id: snap.docs[0].id, ...snap.docs[0].data() };
        batchScannedIndices = [];
        if (cIdx) batchScannedIndices.push(cIdx);

        updateBatchUI();
        const total = currentBatchClientData.quantiteEnvoyee || 1;
        document.getElementById('scan-status').textContent =
            `Lot ouvert — Scannez les ${total} colis de ${currentBatchClientData.nom}`;

        // Auto-valider immédiatement si 1 seul colis
        if (autoValiderMode && total === 1) {
            passerEtapeValidation();
            setTimeout(() => executerActionScan(), 300);
            return;
        }
        if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
    } catch (e) {
        console.error(e);
        jouerSonScan(false);
        showCustomAlert('Erreur réseau.', 'error');
        if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
    }
}

// ─── UI Rafale ───────────────────────────────────────────
function updateBatchUI() {
    if (!currentBatchClientData) {
        document.getElementById('batch-banner').style.display = 'none';
        return;
    }
    const total = parseInt(currentBatchClientData.quantiteEnvoyee) || 1;
    const done  = batchScannedIndices.length;
    const pct   = Math.round((done / total) * 100);

    document.getElementById('batch-banner').style.display = 'flex';
    document.getElementById('batch-client-name').textContent =
        `${currentBatchClientData.nom} ${currentBatchClientData.prenom}`;
    document.getElementById('batch-bar').style.width = pct + '%';
    document.getElementById('batch-count').textContent = `${done} / ${total} colis — ${pct}%`;

    // Points visuels
    let dotsHtml = '';
    for (let i = 1; i <= Math.min(total, 20); i++) {
        const isDone = batchScannedIndices.includes(i);
        const isNew  = isDone && batchScannedIndices[batchScannedIndices.length - 1] === i;
        dotsHtml += `<div class="batch-dot ${isDone ? 'done' : 'todo'} ${isNew ? 'new' : ''}">${i}</div>`;
    }
    if (total > 20) dotsHtml += `<div class="batch-dot todo" style="font-size:9px;">+${total-20}</div>`;
    document.getElementById('batch-dots').innerHTML = dotsHtml;
}

// ─── Validation ──────────────────────────────────────────
function passerEtapeValidation() {
    if (html5QrcodeScanner.getState() === 2) html5QrcodeScanner.pause();
    document.getElementById('scanner-container').style.display = 'none';
    document.getElementById('batch-banner').style.display = 'none';
    afficherResultatValidation();
}

function afficherResultatValidation() {
    const c = currentBatchClientData;
    const conf = scanModes[currentScanMode];
    const total = parseInt(c.quantiteEnvoyee) || 1;

    // Avatar
    const initials = (c.nom || 'CL').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('res-avatar');
    if (avatarEl) { avatarEl.textContent = initials; avatarEl.style.background = conf.color; }

    document.getElementById('res-client').textContent = `${c.nom} ${c.prenom}`;
    document.getElementById('res-ref').textContent    = c.reference;
    document.getElementById('res-tel').textContent    = c.tel || '-';
    document.getElementById('res-desc').textContent   = `${total} colis — ${c.description}`;
    document.getElementById('res-pv').textContent     = c.type.startsWith('aerien')
        ? `${c.poidsEnvoye || 0} Kg`
        : `${c.volumeEnvoye || 0} CBM`;
    document.getElementById('res-statut').textContent = c.status || 'En attente';
    document.getElementById('res-mode-label').textContent = 'Action';
    document.getElementById('res-mode-val').textContent = `${conf.emoji} ${conf.label}`;

    // Reste à payer
    let pB    = parseInt((c.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN    = pB + (c.fraisSupplementaires || 0) - (c.remise || 0);
    let reste = pN - (parseInt(c.montantPaye) || 0);
    const resteEl = document.getElementById('res-reste');
    if (resteEl) {
        resteEl.textContent = reste > 0
            ? formatArgent(reste) + ' CFA'
            : '✅ Soldé';
        resteEl.style.color = reste > 0 ? '#F5A623' : '#27ae60';
    }

    // Checklist des colis
    let chkHtml = `<div style="margin-top:10px; padding-top:10px; border-top:1px solid #eee;">
        <div style="font-size:12px; font-weight:700; color:#555; margin-bottom:8px; text-transform:uppercase; letter-spacing:.04em;">Colis scannés dans ce lot</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    for (let i = 1; i <= total; i++) {
        const ok = batchScannedIndices.includes(i);
        chkHtml += `<div style="
            width:36px; height:36px; border-radius:8px;
            background:${ok ? conf.color : '#f0f2f5'};
            color:${ok ? 'white' : '#bbb'};
            display:flex; align-items:center; justify-content:center;
            font-size:12px; font-weight:700;
            border:${ok ? 'none' : '1.5px dashed #ccc'};">${i}</div>`;
    }
    chkHtml += '</div></div>';
    document.getElementById('res-checklist').innerHTML = chkHtml;

    const btn    = document.getElementById('btn-action-scan');
    const btnLbl = document.getElementById('btn-action-label');
    if (btn)    btn.style.background = conf.color;
    if (btnLbl) btnLbl.textContent   = `${conf.emoji} Confirmer — ${conf.label}`;

    document.getElementById('scan-result').style.display = 'block';
}

function annulerRafale() {
    currentBatchClientData = null;
    batchScannedIndices    = [];
    compressedPhotos       = [];
    updateBatchUI();
    document.getElementById('scan-result').style.display    = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    document.getElementById('scan-status').textContent = 'Scan annulé. Prêt à scanner.';
    document.getElementById('apercu-photos-scan').innerHTML = '';
    document.getElementById('scan-photos').value = '';
    if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
}

async function executerActionScan() {
    if (!currentBatchClientData) return;
    const actionBtn = document.getElementById('btn-action-scan');
    if (actionBtn) { actionBtn.disabled = true; actionBtn.style.opacity = '0.6'; }

    const conf = scanModes[currentScanMode];
    let isOfflineSaved = false;

    const updates = {
        status: conf.status,
        dateModification: firebase.firestore.FieldValue.serverTimestamp(),
        [`dateDernier_${currentScanMode}`]: new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }),
    };
    if (currentScanMode === 'dechargement' || currentScanMode === 'livre') updates.estArrive = true;
    if (batchScannedIndices.length > 0) {
        updates.colisScannes = firebase.firestore.FieldValue.arrayUnion(...batchScannedIndices);
        updates[`colisScannes_${currentScanMode}`] = firebase.firestore.FieldValue.arrayUnion(...batchScannedIndices);
    }

    try {
        if (navigator.onLine) {
            await db.collection('expeditions').doc(currentBatchClientData.id).update(updates);
            // Upload photos en arrière-plan
            if (compressedPhotos.length > 0) {
                uploaderPhotosEnArrierePlan(
                    currentBatchClientData.id,
                    currentBatchClientData.reference,
                    currentScanMode,
                    [...compressedPhotos]
                );
            }
        } else {
            sauvegarderScanHorsLigne(
                currentBatchClientData.id, currentScanMode, batchScannedIndices, conf.status
            );
            isOfflineSaved = true;
        }
    } catch (e) {
        console.error(e);
        sauvegarderScanHorsLigne(
            currentBatchClientData.id, currentScanMode, batchScannedIndices, conf.status
        );
        isOfflineSaved = true;
    }

    // Ajouter à l'historique de session
    sessionScans.unshift({
        heure:       new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        action:      conf.label + (isOfflineSaved ? ' ✈️ hors-ligne' : ''),
        actionColor: conf.color,
        ref:         currentBatchClientData.reference,
        client:      `${currentBatchClientData.nom} ${currentBatchClientData.prenom}`,
        count:       batchScannedIndices.length,
        total:       parseInt(currentBatchClientData.quantiteEnvoyee) || 1,
    });

    vibrer([80, 40, 80]);
    showCustomAlert(
        isOfflineSaved
            ? `✅ Enregistré hors-ligne (${batchScannedIndices.length} colis). Synchronisez dès que possible.`
            : `✅ ${conf.label} validé ! ${batchScannedIndices.length} colis mis à jour.`,
        'success'
    );

    // Reset
    currentBatchClientData = null;
    batchScannedIndices    = [];
    compressedPhotos       = [];
    updateBatchUI();
    document.getElementById('scan-result').style.display    = 'none';
    document.getElementById('scanner-container').style.display = 'block';
    document.getElementById('scan-status').textContent = 'Prêt à scanner.';
    document.getElementById('manual-ref').value = '';
    document.getElementById('apercu-photos-scan').innerHTML = '';
    document.getElementById('scan-photos').value = '';
    renderSessionScans();

    if (actionBtn) { actionBtn.disabled = false; actionBtn.style.opacity = '1'; }
    if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume();
}

// ─── Historique session ──────────────────────────────────
function renderSessionScans() {
    const card = document.getElementById('session-scans-card');
    const list = document.getElementById('session-list');
    const counter = document.getElementById('session-counter-num');
    if (counter) counter.textContent = sessionScans.length;

    if (sessionScans.length === 0) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    list.innerHTML = sessionScans.map(s => `
        <div class="session-item">
            <div class="session-dot" style="background:${s.actionColor};"></div>
            <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="session-ref">${s.ref}</span>
                    <span style="font-size:11px; color:${s.actionColor}; font-weight:700;">${s.action}</span>
                </div>
                <div class="session-meta">${s.client} — ${s.count}/${s.total} colis</div>
            </div>
            <div class="session-time">${s.heure}</div>
        </div>`).join('');
}

function viderSession() {
    sessionScans = [];
    renderSessionScans();
}

// ─── Navigation vers paiement ────────────────────────────
function allerPayerScan() {
    if (!currentBatchClientData) return;
    localStorage.setItem('autoOpenColisId', currentBatchClientData.id);
    window.location.href = 'reception.html';
}

// ─── Mode hors-ligne ─────────────────────────────────────
function updateOfflineBanner() {
    const scans  = JSON.parse(localStorage.getItem('amt_offline_scans') || '[]');
    const banner = document.getElementById('offline-banner');
    const label  = document.getElementById('offline-label');
    if (!banner) return;
    if (scans.length === 0) { banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    if (navigator.onLine) {
        banner.className = 'offline-banner ready';
        label.textContent = `✅ Connexion rétablie — Synchroniser ${scans.length} scan(s) en attente`;
    } else {
        banner.className = 'offline-banner pending';
        label.textContent = `✈️ Hors-ligne — ${scans.length} scan(s) sauvegardé(s) localement`;
    }
}

function sauvegarderScanHorsLigne(id, scanMode, indices, status) {
    let scans = JSON.parse(localStorage.getItem('amt_offline_scans') || '[]');
    scans.push({ id, scanMode, scannedIndices: indices, status, timestamp: Date.now() });
    localStorage.setItem('amt_offline_scans', JSON.stringify(scans));
    updateOfflineBanner();
}

async function synchroniserScansHorsLigne() {
    if (!navigator.onLine) {
        showCustomAlert('Vous êtes hors-ligne. Reconnectez-vous d\'abord.', 'warning');
        return;
    }
    const scans = JSON.parse(localStorage.getItem('amt_offline_scans') || '[]');
    if (scans.length === 0) return;

    const banner = document.getElementById('offline-banner');
    if (banner) banner.textContent = '⏳ Synchronisation…';

    try {
        const batch = db.batch();
        scans.forEach(s => {
            const ref = db.collection('expeditions').doc(s.id);
            const up  = {
                status: s.status,
                dateModification: firebase.firestore.FieldValue.serverTimestamp(),
                [`dateDernier_${s.scanMode}`]: new Date(s.timestamp).toLocaleString('fr-FR'),
            };
            if (s.scanMode === 'dechargement' || s.scanMode === 'livre') up.estArrive = true;
            if (s.scannedIndices && s.scannedIndices.length > 0) {
                up.colisScannes = firebase.firestore.FieldValue.arrayUnion(...s.scannedIndices);
                up[`colisScannes_${s.scanMode}`] = firebase.firestore.FieldValue.arrayUnion(...s.scannedIndices);
            }
            batch.update(ref, up);
        });
        await batch.commit();
        localStorage.removeItem('amt_offline_scans');
        showCustomAlert(`✅ ${scans.length} scan(s) synchronisé(s) !`, 'success');
    } catch (e) {
        console.error(e);
        showCustomAlert('Erreur de synchronisation : ' + e.message, 'error');
    } finally {
        updateOfflineBanner();
    }
}

// ─── Compression & upload ────────────────────────────────
async function compresserImage(file, maxWidth = 1024) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = ev => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => {
                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
                        type: 'image/jpeg', lastModified: Date.now()
                    }));
                }, 'image/jpeg', 0.72);
            };
        };
    });
}

async function uploaderPhotosEnArrierePlan(docId, reference, scanMode, photos) {
    const urls = [];
    for (const file of photos) {
        try {
            const storRef = storage.ref(`${scanMode}/${reference}/${Date.now()}_${file.name}`);
            await storRef.put(file);
            urls.push(await storRef.getDownloadURL());
        } catch (err) { console.error('Upload échoué :', err); }
    }
    if (urls.length > 0) {
        const up = { [`photos_${scanMode}`]: firebase.firestore.FieldValue.arrayUnion(...urls) };
        if (scanMode === 'chargement') up.photosChargement = firebase.firestore.FieldValue.arrayUnion(...urls);
        await db.collection('expeditions').doc(docId).update(up);
    }
}
