// reception.js — Logique Réception Abidjan (UI simplifiée)

let showPaidReception = false;
let selectedPaymentMethod = 'Espèce';
let selectedGroupPaymentMethod = 'Espèce';

document.addEventListener('DOMContentLoaded', () => {
    ouvrirSousOngletReception('maritime');
    const sIn = document.getElementById('search-reception');
    if (sIn) sIn.addEventListener('input', () => updateReceptionView(sIn.value));
});

// ─── Onglets Maritime / Aérien ──────────────────────────
function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    const b1 = document.getElementById('btn-rec-maritime');
    const b2 = document.getElementById('btn-rec-aerien');
    if (b1 && b2) {
        if (type === 'maritime') { b1.classList.add('active'); b2.classList.remove('active'); }
        else { b1.classList.remove('active'); b2.classList.add('active'); }
    }
    chargerClients();
}

// ─── Chargement des données ─────────────────────────────
async function chargerClients() {
    const tb = document.getElementById('liste-clients-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;">⏳ Chargement...</td></tr>';
    const sIn = document.getElementById('search-reception');

    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        allReceptionData = [];
        snap.forEach(d => {
            const data = d.data();
            let match = false;
            if (currentReceptionType === 'maritime' && data.type === 'maritime') match = true;
            if (currentReceptionType === 'aerien' && (data.type || '').startsWith('aerien')) match = true;
            if (match) allReceptionData.push({ id: d.id, ...data });
        });
        renderGroupFilter(allReceptionData, 'filter-container-rec', () => updateReceptionView(sIn ? sIn.value : ''));
        updateReceptionView(sIn ? sIn.value : '');
        
        // Ouverture automatique du client via le Scanner
        const autoId = localStorage.getItem('autoOpenColisId');
        if (autoId) {
            const colis = allReceptionData.find(c => c.id === autoId);
            if (colis) { selectionnerClient(colis); }
            localStorage.removeItem('autoOpenColisId');
        }
    } catch (e) { console.error(e); tb.innerHTML = '<tr><td colspan="11" style="text-align:center;color:red;">Erreur de chargement.</td></tr>'; }
}

function toggleShowPaidReception() {
    showPaidReception = document.getElementById('cb-show-paid-rec').checked;
    const sIn = document.getElementById('search-reception');
    updateReceptionView(sIn ? sIn.value : '');
}

// ─── Rendu du tableau ───────────────────────────────────
function updateReceptionView(searchQuery) {
    const tb = document.getElementById('liste-clients-tbody');
    let filtered = allReceptionData.filter(d => {
        if (selectedGroupsReception.length > 0 && !selectedGroupsReception.includes(d.refGroupe)) return false;
        let pB = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
        let pN = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
        let res = pN - (parseInt(d.montantPaye) || 0);
        if (!showPaidReception && res <= 0 && pN > 0) return false;
        if (searchQuery && !JSON.stringify(d).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    filtered.sort((a, b) => {
        const numA = parseInt((a.refGroupe || '').replace('EV', '')) || 0;
        const numB = parseInt((b.refGroupe || '').replace('EV', '')) || 0;
        if (numA !== numB) return numB - numA;
        return (a.reference || '').localeCompare(b.reference || '');
    });

    clientsCharges = filtered;
    let curGrp = null, gQ = 0, gV = 0, gP = 0, tQ = 0, tV = 0, tP = 0;
    let html = '';

    filtered.forEach((d, idx) => {
        let isAir = (d.type || '').startsWith('aerien');
        let pv = isAir ? (d.poidsEnvoye || 0) : (d.volumeEnvoye || 0);
        let pB = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
        let pN = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
        let res = pN - (parseInt(d.montantPaye) || 0);

        if (curGrp !== null && d.refGroupe !== curGrp) {
            const u = currentReceptionType.startsWith('aerien') ? 'Kg' : 'CBM';
            html += `<tr class="subtotal-row"><td colspan="7">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td style="white-space:nowrap;">${formatArgent(gP)} CFA</td><td></td></tr>`;
            gQ = 0; gV = 0; gP = 0;
        }
        curGrp = d.refGroupe;
        gQ += parseInt(d.quantiteEnvoyee) || 0;
        gV += parseFloat(pv);
        gP += res;
        tQ += parseInt(d.quantiteEnvoyee) || 0;
        tV += parseFloat(pv);
        tP += res;

        let cl = (d.status || '').includes('Conforme') ? 'status-conforme' : (d.status || '').includes('Ecart') ? 'status-ecart' : 'status-attente';
        const safe = encodeURIComponent(JSON.stringify({ id: d.id, ...d }));
        let checkbox = `<input type="checkbox" class="rec-check" value="${d.id}" onchange="gererSelectionReception('${d.id}')" onclick="event.stopPropagation()">`;
        let recuIcon = (d.quantiteRecue > 0 || d.estArrive) ? ' ✅' : '';
        let resteColor = res > 0 ? '#c0392b' : '#27ae60';

        html += `<tr class="interactive-table-row" onclick='selectionnerClientViaData("${safe}")'>
            <td>${checkbox}</td>
            <td style="font-size:12px;">${d.reference}${recuIcon}</td>
            <td style="font-size:12px;">${d.numBL || '-'}</td>
            <td style="font-size:12px;white-space:nowrap;">${new Date(d.date).toLocaleDateString('fr-FR', {day:'2-digit',month:'short'})}</td>
            <td><strong>${d.nom}</strong> ${d.prenom}</td>
            <td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.description}</td>
            <td style="font-size:11px;">${d.type}</td>
            <td style="text-align:center;">${d.quantiteEnvoyee}</td>
            <td style="text-align:center;">${pv}</td>
            <td style="font-weight:700;color:${resteColor};text-align:right;white-space:nowrap;">${formatArgent(res)} CFA</td>
            <td><span class="status-badge ${cl}" style="font-size:10px;">${(d.status || 'Attente').replace('Reçu - ', '')}</span></td>
        </tr>`;

        if (idx === filtered.length - 1) {
            const u = isAir ? 'Kg' : 'CBM';
            html += `<tr class="subtotal-row"><td colspan="7">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td style="white-space:nowrap;">${formatArgent(gP)} CFA</td><td></td></tr>`;
        }
    });

    if (filtered.length === 0) {
        html = '<tr><td colspan="11" style="text-align:center;padding:30px;color:#aaa;font-size:15px;">Aucun colis trouvé 🔍</td></tr>';
    }

    tb.innerHTML = html;
    document.getElementById('total-rec-qty').innerText = tQ;
    document.getElementById('total-rec-vol').innerText = tV.toFixed(2);
    document.getElementById('total-rec-prix').innerText = formatArgent(tP) + ' CFA';
}

// ─── Filtres groupes ─────────────────────────────────────
function renderGroupFilter(data, containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<span class="filter-title">Filtrer par groupe :</span>';
    const groups = [...new Set(data.map(d => d.refGroupe).filter(g => g))];
    groups.sort((a, b) => parseInt(a.replace('EV', '')) - parseInt(b.replace('EV', '')));
    groups.forEach(g => {
        const label = document.createElement('label');
        label.className = 'filter-option';
        label.innerHTML = `<input type="checkbox" value="${g}"> ${g}`;
        label.querySelector('input').onchange = (e) => {
            if (e.target.checked) selectedGroupsReception.push(g);
            else { const i = selectedGroupsReception.indexOf(g); if (i > -1) selectedGroupsReception.splice(i, 1); }
            callback();
        };
        container.appendChild(label);
    });
}

// ─── Sélection client ────────────────────────────────────
function selectionnerClientViaData(enc) {
    selectionnerClient(JSON.parse(decodeURIComponent(enc)));
}

function selectionnerClient(d) {
    currentEnvoi = d;
    const modal = document.getElementById('modal-backdrop');
    if (!modal) return;
    modal.style.display = 'flex';

    const isAir = (d.type || '').startsWith('aerien');
    let pB = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
    let deja = parseInt(d.montantPaye) || 0;
    let reste = pN - deja;
    let pvAttendu = isAir ? `${d.poidsEnvoye || 0} Kg` : `${d.volumeEnvoye || 0} CBM`;
    let pvRecu = isAir ? `${d.poidsRecu || 0} Kg` : `${d.volumeEnvoye || 0} CBM`;

    // Avatar initiales
    const initials = (d.nom || 'CL').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('modal-avatar');
    if (avatarEl) avatarEl.textContent = initials;

    // Remplir les champs
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('client-selectionne', `${d.nom || ''} ${d.prenom || ''}`);
    set('ref-attendue',   d.reference || '-');
    set('desc-attendue',  d.description || '-');
    set('tel-attendu',    d.tel || '-');
    set('expediteur-affiche', d.expediteur || 'AMT');
    set('qte-attendue',   `${d.quantiteEnvoyee || 0} colis`);
    set('poids-attendu',  pvAttendu);
    set('qte-restant',    `${(d.quantiteEnvoyee || 0) - (d.quantiteRecue || 0)} colis`);
    set('poids-restant',  pvRecu);
    set('prix-attendu',   `${formatArgent(pN)} CFA`);
    set('prix-restant',   `${formatArgent(reste)} CFA`);

    // Label poids/vol
    const lPoids = document.getElementById('label-poids-recu');
    if (lPoids) lPoids.textContent = isAir ? 'Poids reçu (Kg)' : 'Volume reçu (CBM)';

    // Pré-remplir les champs de saisie avec les valeurs restantes
    const qteEl = document.getElementById('quantite-recue');
    if (qteEl) qteEl.value = Math.max(0, (d.quantiteEnvoyee || 0) - (d.quantiteRecue || 0));
    const poidsEl = document.getElementById('poids-recu');
    if (poidsEl) poidsEl.value = '';
    const montantEl = document.getElementById('montant-paye');
    if (montantEl) montantEl.value = reste > 0 ? reste : '';

    // Statut
    afficherStatutReception(d);

    // Photos
    _afficherPhotosRecues(d);

    // Bouton Arrivé
    const btnArrive = document.getElementById('btn-marquer-arrive');
    if (btnArrive) {
        btnArrive.textContent = d.estArrive ? '✅ Arrivé au dépôt' : '🛬 Marquer Arrivé';
        btnArrive.style.background = d.estArrive ? '#27ae60' : '#17a2b8';
    }

    // Masquer formulaire si entièrement payé
    const formContainer = document.getElementById('form-reception-container');
    if (formContainer) formContainer.style.display = (reste <= 0 && pN > 0) ? 'none' : 'block';

    // Réinitialiser le moyen de paiement sélectionné
    selectPaymentMethod('Espèce');
}

function _afficherPhotosRecues(d) {
    const container = document.getElementById('photos-recues-container');
    const apercu    = document.getElementById('photos-recues-apercu');
    if (!container || !apercu) return;
    if (d.photosURLs && d.photosURLs.length > 0) {
        apercu.innerHTML = d.photosURLs.map(url => `<img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #ddd;">`).join('');
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function afficherStatutReception(d) {
    const statusEl  = document.getElementById('reception-status');
    const summaryEl = document.getElementById('reception-summary');
    let pB = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
    let deja = parseInt(d.montantPaye) || 0;

    if (statusEl) {
        statusEl.textContent = d.status || 'En attente';
        statusEl.className = 'status-badge ' + ((d.status || '').includes('Conforme') ? 'status-conforme' : (d.status || '').includes('Ecart') ? 'status-ecart' : 'status-attente');
    }
    if (summaryEl && d.historiquePaiements && d.historiquePaiements.length > 0) {
        const lines = d.historiquePaiements.filter(h => !h.deleted).map(h => {
            const dt = h.date ? new Date(h.date.seconds * 1000).toLocaleDateString('fr-FR') : '-';
            return `<div style="font-size:12px;color:#555;padding:3px 0;border-bottom:1px solid #f0f0f0;">
                ${dt} — <strong>${formatArgent(h.montant)} CFA</strong> (${h.moyen || '-'}) <span style="color:#888;">— ${h.agent || '-'}</span>
            </div>`;
        }).join('');
        summaryEl.innerHTML = lines
            ? `<div style="background:#f8f9fa;border-radius:8px;padding:8px;margin-top:8px;"><div style="font-size:12px;font-weight:700;margin-bottom:4px;">Historique des paiements</div>${lines}</div>`
            : '';
    } else if (summaryEl) {
        summaryEl.innerHTML = '';
    }
}

// ─── Moyen de paiement (boutons visuels) ─────────────────
function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    const hidden = document.getElementById('moyen-paiement');
    if (hidden) hidden.value = method;
    ['Espèce', 'Wave', 'OM', 'Chèque', 'CB'].forEach(m => {
        const btn = document.getElementById('pm-' + m);
        if (btn) btn.classList.toggle('selected', m === method);
    });
}

function selectGroupPaymentMethod(method) {
    selectedGroupPaymentMethod = method;
    const hidden = document.getElementById('group-moyen');
    if (hidden) hidden.value = method;
    ['Espèce', 'Wave', 'OM', 'Chèque', 'CB'].forEach(m => {
        const btn = document.getElementById('gpm-' + m);
        if (btn) btn.classList.toggle('selected', m === method);
    });
}

// ─── Fermeture modals ────────────────────────────────────
function fermerModal(e) {
    const modal = document.getElementById('modal-backdrop');
    if (!e || e.target === modal || e.target.classList.contains('modal-close'))
        if (modal) modal.style.display = 'none';
}
function fermerModalModifReception() {
    const m = document.getElementById('modal-modif-reception');
    if (m) m.style.display = 'none';
}
function ouvrirModalModifReception() {
    fermerModal(null);
    const m = document.getElementById('modal-modif-reception');
    if (!m || !currentEnvoi) return;
    document.getElementById('modif-rec-qte').value   = currentEnvoi.quantiteRecue || 0;
    document.getElementById('modif-rec-poids').value = currentEnvoi.poidsRecu || 0;
    document.getElementById('modif-rec-paye').value  = currentEnvoi.montantPaye || 0;
    m.style.display = 'flex';
}

// ─── Enregistrement paiement ─────────────────────────────
async function enregistrerReception() {
    if (!currentEnvoi) return;
    const qteRecue    = parseInt(document.getElementById('quantite-recue').value) || 0;
    const poidsRecu   = parseFloat(document.getElementById('poids-recu').value) || 0;
    const montant     = parseInt(document.getElementById('montant-paye').value) || 0;
    const moyen       = document.getElementById('moyen-paiement').value || 'Espèce';
    const agent       = currentUser ? currentUser.email : 'Inconnu';

    if (montant <= 0 && qteRecue <= 0) { alert('Veuillez saisir un montant ou une quantité.'); return; }

    try {
        const docRef = db.collection('expeditions').doc(currentEnvoi.id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) { alert('Erreur : document introuvable.'); return; }

        const data = docSnap.data();
        let pB = parseInt((data.prixEstime || '0').replace(/\D/g, '')) || 0;
        let pN = pB + (data.fraisSupplementaires || 0) - (data.remise || 0);
        let dejaPayeAvant = parseInt(data.montantPaye) || 0;
        let nouveauTotal  = dejaPayeAvant + montant;
        let resteApres    = pN - nouveauTotal;

        let nouveauStatut = data.status || 'En attente';
        if (qteRecue > 0) {
            const totalQteRecue = (data.quantiteRecue || 0) + qteRecue;
            if (totalQteRecue >= (data.quantiteEnvoyee || 0)) nouveauStatut = 'Reçu - Conforme';
            else nouveauStatut = 'Reçu - Ecart';
        }
        if (resteApres <= 0 && pN > 0) nouveauStatut = 'Reçu - Conforme';

        const updates = {
            montantPaye:  nouveauTotal,
            quantiteRecue: (data.quantiteRecue || 0) + qteRecue,
            poidsRecu:    (data.poidsRecu || 0) + poidsRecu,
            status:       nouveauStatut,
            datePaiement: firebase.firestore.FieldValue.serverTimestamp(),
            historiquePaiements: firebase.firestore.FieldValue.arrayUnion({
                date:   firebase.firestore.Timestamp.now(),
                montant: montant,
                moyen:  moyen,
                agent:  agent,
            }),
        };
        await docRef.update(updates);

        alert(`✅ Paiement enregistré !\nReste à payer : ${formatArgent(resteApres)} CFA`);
        document.getElementById('modal-backdrop').style.display = 'none';
        chargerClients();
    } catch (e) { alert('Erreur : ' + e.message); console.error(e); }
}

// ─── Correction réception ────────────────────────────────
async function sauvegarderCorrectionReception() {
    if (!currentEnvoi) return;
    const qte    = parseInt(document.getElementById('modif-rec-qte').value) || 0;
    const poids  = parseFloat(document.getElementById('modif-rec-poids').value) || 0;
    const paye   = parseInt(document.getElementById('modif-rec-paye').value) || 0;
    if (!confirm('Confirmer la correction ?')) return;
    try {
        await db.collection('expeditions').doc(currentEnvoi.id).update({
            quantiteRecue: qte, poidsRecu: poids, montantPaye: paye,
        });
        alert('Correction enregistrée.');
        fermerModalModifReception();
        chargerClients();
    } catch (e) { alert('Erreur : ' + e.message); }
}

// ─── Statut Arrivé ───────────────────────────────────────
async function basculerStatutArrive() {
    if (!currentEnvoi) return;
    const nouvelEtat = !currentEnvoi.estArrive;
    const nvStatut   = nouvelEtat ? 'Arrivé au Dépôt' : 'En attente';
    try {
        await db.collection('expeditions').doc(currentEnvoi.id).update({ estArrive: nouvelEtat, status: nvStatut });
        currentEnvoi.estArrive = nouvelEtat;
        currentEnvoi.status    = nvStatut;
        const btn = document.getElementById('btn-marquer-arrive');
        if (btn) { btn.textContent = nouvelEtat ? '✅ Arrivé au dépôt' : '🛬 Marquer Arrivé'; btn.style.background = nouvelEtat ? '#27ae60' : '#17a2b8'; }
        chargerClients();
    } catch (e) { alert('Erreur : ' + e.message); }
}

// ─── Sélection multiple ───────────────────────────────────
function gererSelectionReception(id) {
    if (selectedReceptionIds.has(id)) selectedReceptionIds.delete(id);
    else selectedReceptionIds.add(id);
    updateBoutonGroupe();
}
function toggleToutSelectionner(checkboxMaitre) {
    const checks = document.querySelectorAll('.rec-check');
    selectedReceptionIds.clear();
    checks.forEach(c => { c.checked = checkboxMaitre.checked; if (c.checked) selectedReceptionIds.add(c.value); });
    updateBoutonGroupe();
}
function updateBoutonGroupe() {
    const btn   = document.getElementById('btn-group-pay');
    const btnWa = document.getElementById('btn-whatsapp-groupe');
    const count = document.getElementById('count-sel');
    const countWa = document.getElementById('count-sel-wa');
    if (selectedReceptionIds.size > 0) {
        if (btn)   { btn.style.display = 'block'; if (count) count.innerText = selectedReceptionIds.size; }
        if (btnWa) { btnWa.style.display = 'block'; if (countWa) countWa.innerText = selectedReceptionIds.size; }
    } else {
        if (btn)   btn.style.display = 'none';
        if (btnWa) btnWa.style.display = 'none';
    }
}

// ─── Paiement groupé ─────────────────────────────────────
function ouvrirModalPaiementGroupe() {
    if (selectedReceptionIds.size === 0) return;
    let totalReste = 0;
    selectedReceptionIds.forEach(id => {
        const item = allReceptionData.find(d => d.id === id);
        if (item) {
            let pB = parseInt((item.prixEstime || '0').replace(/\D/g, '')) || 0;
            let net = pB + (item.fraisSupplementaires || 0) - (item.remise || 0);
            totalReste += net - (parseInt(item.montantPaye) || 0);
        }
    });
    const modal = document.getElementById('modal-paiement-groupe');
    if (!modal) return;
    const gc = document.getElementById('group-count'); if (gc) gc.innerText = selectedReceptionIds.size;
    const gt = document.getElementById('group-total'); if (gt) gt.innerText = formatArgent(totalReste) + ' CFA';
    selectGroupPaymentMethod('Espèce');
    modal.style.display = 'flex';
}
function fermerModalPaiementGroupe() {
    const m = document.getElementById('modal-paiement-groupe');
    if (m) m.style.display = 'none';
}
async function validerPaiementGroupe() {
    const moyen = document.getElementById('group-moyen').value || 'Espèce';
    const agent = currentUser ? currentUser.email : 'Inconnu';
    const batch = db.batch();
    let count = 0;
    selectedReceptionIds.forEach(id => {
        const item = allReceptionData.find(d => d.id === id);
        if (item) {
            let pB  = parseInt((item.prixEstime || '0').replace(/\D/g, '')) || 0;
            let net = pB + (item.fraisSupplementaires || 0) - (item.remise || 0);
            let deja = parseInt(item.montantPaye) || 0;
            let reste = net - deja;
            if (reste > 0) {
                const ref = db.collection('expeditions').doc(id);
                batch.update(ref, {
                    montantPaye: net,
                    quantiteRecue: item.quantiteEnvoyee,
                    status: 'Reçu - Conforme',
                    datePaiement: firebase.firestore.FieldValue.serverTimestamp(),
                    historiquePaiements: firebase.firestore.FieldValue.arrayUnion({
                        date: firebase.firestore.Timestamp.now(), montant: reste, moyen: moyen, agent: agent,
                    }),
                });
                count++;
            }
        }
    });
    try {
        await batch.commit();
        alert(`✅ ${count} colis soldés avec succès !`);
        fermerModalPaiementGroupe();
        selectedReceptionIds.clear();
        const ca = document.getElementById('check-all-rec'); if (ca) ca.checked = false;
        updateBoutonGroupe();
        chargerClients();
    } catch (e) { alert('Erreur : ' + e.message); }
}

// ─── WhatsApp ─────────────────────────────────────────────
const modalWa = document.getElementById('modal-whatsapp-groupe');
function ouvrirModalWhatsAppGroupe() {
    if (selectedReceptionIds.size === 0) return;
    if (modalWa) modalWa.style.display = 'flex';
    genererListeWhatsApp();
}
function fermerModalWhatsAppGroupe() { if (modalWa) modalWa.style.display = 'none'; }

function genererListeWhatsApp() {
    const container = document.getElementById('wa-clients-list');
    if (!container) return;
    const template = (document.getElementById('wa-message-template') || {}).value || '';
    container.innerHTML = '';
    selectedReceptionIds.forEach(id => {
        const item = allReceptionData.find(d => d.id === id);
        if (!item) return;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #eee;background:white;margin-bottom:5px;border-radius:8px;';
        let pB  = parseInt((item.prixEstime || '0').replace(/\D/g, '')) || 0;
        let net = pB + (item.fraisSupplementaires || 0) - (item.remise || 0);
        let reste = net - (parseInt(item.montantPaye) || 0);
        row.innerHTML = `
            <div style="flex:1;display:flex;align-items:center;gap:10px;">
                <strong style="font-size:14px;">${item.nom}</strong>
                <input type="text" id="wa-tel-${item.id}" value="${item.tel || ''}" placeholder="+225..."
                    style="padding:6px;border:1px solid #ccc;border-radius:6px;width:140px;font-size:13px;">
            </div>
            <div style="display:flex;gap:6px;">
                <button type="button" onclick="envoyerWaRow('${item.id}')"
                    style="background:#25D366;color:white;border:none;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fab fa-whatsapp"></i> Envoyer
                </button>
            </div>`;
        container.appendChild(row);
    });
}

function _buildWaMessage(item) {
    const template = (document.getElementById('wa-message-template') || {}).value || 'Bonjour {nom}, votre colis {ref} est arrivé.';
    let pB  = parseInt((item.prixEstime || '0').replace(/\D/g, '')) || 0;
    let net = pB + (item.fraisSupplementaires || 0) - (item.remise || 0);
    let reste = net - (parseInt(item.montantPaye) || 0);
    let blInfo = item.numBL ? `BL: ${item.numBL}. ` : '';
    return template
        .replace(/{nom}/g,   `${item.prenom || ''} ${item.nom || ''}`.trim())
        .replace(/{ref}/g,   item.reference || '')
        .replace(/{colis}/g, item.description || '')
        .replace(/{reste}/g, formatArgent(reste))
        .replace(/{bl}/g,    blInfo);
}

function envoyerWaRow(id) {
    const item = allReceptionData.find(d => d.id === id);
    if (!item) return;
    const telInput = (document.getElementById(`wa-tel-${id}`) || {}).value || item.tel || '';
    let numClean = telInput.replace(/[^0-9]/g, '');
    if (numClean.startsWith('00')) numClean = numClean.substring(2);
    if (numClean.length === 10 && !numClean.startsWith('225')) numClean = '225' + numClean;
    const msg = _buildWaMessage(item);
    window.open(`https://api.whatsapp.com/send?phone=${numClean}&text=${encodeURIComponent(msg)}`, '_blank');
}

function envoyerWhatsAppIndividuel() {
    if (!currentEnvoi) return;
    let numInput = prompt('Confirmez ou modifiez le numéro WhatsApp :', currentEnvoi.tel || '');
    if (numInput === null) return;
    let numClean = numInput.replace(/[^0-9]/g, '');
    if (numClean.startsWith('00')) numClean = numClean.substring(2);
    if (numClean.length === 10 && !numClean.startsWith('225')) numClean = '225' + numClean;
    const msg = _buildWaMessage(currentEnvoi);
    window.open(`https://api.whatsapp.com/send?phone=${numClean}&text=${encodeURIComponent(msg)}`, '_blank');
}

function partagerWhatsAppIndividuel() {
    if (!currentEnvoi) return;
    const msg = _buildWaMessage(currentEnvoi);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}
