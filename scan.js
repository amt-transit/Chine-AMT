let html5QrcodeScanner;
let currentScannedColis = null;
let currentScanMode = 'chargement';
let sessionScans = []; // Stocke les scans de la session active

const scanModes = {
    'chargement': { label: 'Marquer au Chargement', status: 'Au chargement', color: '#f39c12', icon: 'fas fa-truck-loading' },
    'dechargement': { label: 'Marquer au Déchargement', status: 'Au déchargement', color: '#17a2b8', icon: 'fas fa-box-open' },
    'livraison': { label: 'Marquer en Livraison', status: 'En livraison', color: '#8e44ad', icon: 'fas fa-motorcycle' },
    'livre': { label: 'Marquer comme Livré', status: 'Livré', color: '#27ae60', icon: 'fas fa-check-circle' }
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
});

function onScanSuccess(decodedText, decodedResult) {
    // Pause de la caméra pour éviter les scans multiples
    if(html5QrcodeScanner.getState() === 2) { // 2 = SCANNING
        html5QrcodeScanner.pause();
    }
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
    
    try {
        const snap = await db.collection('expeditions').where('reference', '==', ref).limit(1).get();
        if (snap.empty) {
            alert(`Colis introuvable pour la référence : ${ref}`);
            document.getElementById('scan-status').innerText = "Prêt à scanner.";
            if (html5QrcodeScanner.getState() === 3) html5QrcodeScanner.resume(); // 3 = PAUSED
            return;
        }
        
        currentScannedColis = { id: snap.docs[0].id, ...snap.docs[0].data() };
        afficherResultat(currentScannedColis);
        document.getElementById('scan-status').innerText = "Colis identifié.";
    } catch(e) {
        console.error(e);
        alert("Erreur réseau lors de la recherche.");
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

    document.getElementById('scan-result').style.display = 'block';
}

async function executerActionScan() {
    if(!currentScannedColis) return;
    const conf = scanModes[currentScanMode];
    let updates = { status: conf.status };
    
    if(currentScanMode === 'dechargement' || currentScanMode === 'livre') {
        updates.estArrive = true;
    }
    
    await db.collection('expeditions').doc(currentScannedColis.id).update(updates);
    
    // Ajouter à l'historique de session
    sessionScans.unshift({
        heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        action: conf.label, actionColor: conf.color,
        ref: currentScannedColis.reference, client: `${currentScannedColis.nom} ${currentScannedColis.prenom}`
    });
    
    alert(`✅ Le colis a été marqué : ${conf.status} !`);
    document.getElementById('scan-result').style.display = 'none';
    document.getElementById('scan-status').innerText = "Prêt à scanner.";
    document.getElementById('manual-ref').value = '';
    renderSessionScans();
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