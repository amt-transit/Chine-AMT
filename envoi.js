// envoi.js — Logique métier Envoi (Wizard simplifié)

// ─── Variables globales ──────────────────────────────────
let currentStep = 1;
let selectedTransportCard = null;
let wizardQte = 1;

// ─── Initialisation ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadAllClientsForAutocomplete();

    // Date du jour par défaut
    const dateInput = document.getElementById('date-envoi');
    if (dateInput) dateInput.valueAsDate = new Date();

    // Autocomplete Nom
    const ni = document.getElementById('client-nom');
    if (ni) {
        ni.addEventListener('input', onNomInput);
        document.addEventListener('click', e => {
            if (!e.target.closest('.autocomplete-container'))
                document.getElementById('autocomplete-suggestions').style.display = 'none';
        });
    }

    // Aperçu photos
    const photosInput = document.getElementById('photos-colis');
    if (photosInput) {
        photosInput.addEventListener('change', function () {
            const d = document.getElementById('apercu-photos');
            if (d) d.innerHTML = '';
            Array.from(this.files).forEach(f => {
                if (f.type.startsWith('image/')) {
                    const r = new FileReader();
                    r.onload = e => {
                        const i = document.createElement('img');
                        i.src = e.target.result;
                        i.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #ddd;';
                        d.appendChild(i);
                    };
                    r.readAsDataURL(f);
                }
            });
        });
    }

    // Restauration des données locales en cas d'actualisation
    const savedBatch = localStorage.getItem('amt_envoiEnCours');
    if (savedBatch) {
        try {
            const parsed = JSON.parse(savedBatch);
            if (parsed && parsed.length > 0) {
                envoiEnCours = parsed;
                let hiddenInput = document.getElementById('type-envoi');
                if (!hiddenInput) { hiddenInput = document.createElement('input'); hiddenInput.type = 'hidden'; hiddenInput.id = 'type-envoi'; document.body.appendChild(hiddenInput); }
                hiddenInput.value = envoiEnCours[0].type || 'aerien_normal';
                setTimeout(() => goStep(4), 100); // Redirige vers la liste des envois en attente
            }
        } catch(e) { console.error("Erreur sauvegarde locale", e); }
    }
});

// ─── Navigation entre étapes ─────────────────────────────
function goStep(n) {
    document.querySelectorAll('.wizard-screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen' + n).classList.add('active');
    currentStep = n;
    updateWizardBar(n);

    // Mettre à jour les labels dynamiques à l'étape 3
    if (n === 3) {
        const t = document.getElementById('type-envoi') ? document.getElementById('type-envoi').value : '';
        _updateStep3Labels(t || (envoiEnCours.length > 0 ? envoiEnCours[0].type : 'aerien_normal'));
    }
    // Rendre la liste à l'étape 4
    if (n === 4) renderClientsList();

    window.scrollTo(0, 0);
}

function updateWizardBar(active) {
    const labels = ['', 'Transport', 'Client', 'Colis', 'Valider'];
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById('wd' + i);
        const lbl = document.getElementById('wl' + i);
        if (!dot || !lbl) continue;
        if (i < active) {
            dot.className = 'wizard-dot done';
            dot.innerHTML = '✓';
            lbl.className = 'wizard-label done';
        } else if (i === active) {
            dot.className = 'wizard-dot active';
            dot.innerHTML = i;
            lbl.className = 'wizard-label active';
        } else {
            dot.className = 'wizard-dot todo';
            dot.innerHTML = i;
            lbl.className = 'wizard-label';
        }
        lbl.textContent = labels[i];
    }
    for (let i = 1; i <= 3; i++) {
        const line = document.getElementById('wline' + i);
        if (line) line.className = 'wizard-line' + (i < active ? ' done' : '');
    }
}

// ─── ÉTAPE 1 : Sélection du transport ────────────────────
function selectType(type, element) {
    // Stocker dans l'input caché existant (compat avec le reste du code)
    let hiddenInput = document.getElementById('type-envoi');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'type-envoi';
        document.body.appendChild(hiddenInput);
    }
    hiddenInput.value = type;

    // Highlight visuel
    document.querySelectorAll('.transport-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    selectedTransportCard = element;

    // Afficher le champ conteneur si maritime
    const cg = document.getElementById('conteneur-group');
    if (cg) cg.style.display = (type === 'maritime') ? 'block' : 'none';

    // Activer le bouton suivant
    const btn = document.getElementById('btn-next-1');
    if (btn) btn.disabled = false;
}

// ─── ÉTAPE 2 : Client ────────────────────────────────────
function onNomInput() {
    const q = document.getElementById('client-nom').value.toLowerCase();
    const b = document.getElementById('autocomplete-suggestions');
    if (q.length < 1) { b.style.display = 'none'; checkStep2(); return; }
    const m = allPastClients.filter(c => c.nom.toLowerCase().startsWith(q));
    showSuggestions(m);
    checkStep2();
}

function checkStep2() {
    const n = (document.getElementById('client-nom').value || '').trim();
    const t = (document.getElementById('client-tel').value || '').trim();
    const btn = document.getElementById('btn-next-2');
    if (btn) btn.disabled = !(n.length > 0 && t.length > 6);
}

function showSuggestions(m) {
    const b = document.getElementById('autocomplete-suggestions');
    b.innerHTML = '';
    if (m.length === 0) { b.style.display = 'none'; return; }
    m.slice(0, 6).forEach(c => {
        const d = document.createElement('div');
        d.innerHTML = `<strong>${c.nom}</strong> ${c.prenom} <span style="color:#aaa;font-size:12px;">${c.tel || ''}</span>`;
        d.onclick = () => {
            document.getElementById('client-nom').value = c.nom;
            document.getElementById('client-prenom').value = c.prenom;
            document.getElementById('client-tel').value = c.tel;
            b.style.display = 'none';
            checkStep2();
        };
        b.appendChild(d);
    });
    b.style.display = 'block';
}

// ─── ÉTAPE 3 : Colis ─────────────────────────────────────
function _updateStep3Labels(type) {
    const isAerien = type.startsWith('aerien');
    const modeLabels = {
        aerien_normal:  ['Avion Normal',  '⚖️', 'Poids total (Kg)',    'Avion Normal',  '10 000 CFA/Kg'],
        aerien_express: ['Avion Express', '🚀', 'Poids total (Kg)',    'Avion Express', '12 000 CFA/Kg'],
        maritime:       ['Bateau',        '📦', 'Volume total (CBM)',  'Bateau',        '250 000 CFA/CBM'],
    };
    const labels = modeLabels[type] || modeLabels['aerien_normal'];
    const el = (id) => document.getElementById(id);
    if (el('colis-icon'))       el('colis-icon').textContent    = labels[1];
    if (el('colis-step-title')) el('colis-step-title').textContent = labels[2];
    if (el('weight-icon'))      el('weight-icon').textContent   = labels[1];
    if (el('weight-label'))     el('weight-label').textContent  = labels[2];
    if (el('mode-label-wizard'))el('mode-label-wizard').textContent = labels[3];
    if (el('rate-label-wizard'))el('rate-label-wizard').textContent = labels[4];
    if (el('multi-poids-label'))el('multi-poids-label').textContent = isAerien ? 'Kg' : 'CBM';
    recalculerTotal();
}

function changeQte(delta) {
    wizardQte = Math.max(1, wizardQte + delta);
    const el = document.getElementById('qte-display');
    if (el) el.textContent = wizardQte;
    recalculerTotal();
}

function recalculerTotal() {
    const type = (document.getElementById('type-envoi') ? document.getElementById('type-envoi').value : '') || 'aerien_normal';
    const poids = parseFloat(document.getElementById('sub-poids-vol') ? document.getElementById('sub-poids-vol').value : 0) || 0;
    let prix = 0;
    if (type === 'aerien_normal')  prix = poids * PRIX_AERIEN_NORMAL;
    else if (type === 'aerien_express') prix = poids * PRIX_AERIEN_EXPRESS;
    else if (type === 'maritime')  prix = poids * PRIX_MARITIME_CBM;

    const el = document.getElementById('prix-calcule-wizard');
    if (el) el.textContent = formatArgent(prix) + ' CFA';

    // Compatibilité avec l'ancien ID
    const el2 = document.getElementById('prix-calcule');
    if (el2) el2.textContent = formatArgent(prix) + ' CFA';
}

// Sous-colis multiples (section avancée)
function ajouterSousColisWizard() {
    const desc  = document.getElementById('multi-desc').value || 'Colis';
    const qte   = parseInt(document.getElementById('multi-qte').value) || 0;
    const poids = parseFloat(document.getElementById('multi-poids').value) || 0;
    if (qte <= 0 || poids <= 0) { showCustomAlert('Quantité et poids/volume doivent être > 0', 'error'); return; }
    sousColisList.push({ desc, qte, val: poids });
    document.getElementById('multi-desc').value  = '';
    document.getElementById('multi-qte').value   = '1';
    document.getElementById('multi-poids').value = '';
    _updateMultiTable();
}

function _updateMultiTable() {
    const tbody = document.getElementById('tbody-sub-colis');
    const table = document.getElementById('table-sub-colis');
    let html = '';
    let totalQte = 0, totalVal = 0;
    sousColisList.forEach((item, i) => {
        totalQte += item.qte; totalVal += item.val;
        html += `<tr>
            <td style="padding:6px;">${item.desc}</td>
            <td style="text-align:center;padding:6px;">${item.qte}</td>
            <td style="text-align:center;padding:6px;">${item.val}</td>
            <td style="text-align:center;padding:6px;">
                <button onclick="sousColisList.splice(${i},1);_updateMultiTable();"
                    style="background:#dc3545;color:white;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;">X</button>
            </td>
        </tr>`;
    });
    if (tbody) tbody.innerHTML = html;
    if (table) table.style.display = sousColisList.length > 0 ? 'table' : 'none';

    // Mettre à jour les champs simples avec les totaux si sous-colis utilisés
    if (sousColisList.length > 0) {
        const qteEl = document.getElementById('qte-display');
        if (qteEl) { qteEl.textContent = totalQte; wizardQte = totalQte; }
        const pvEl = document.getElementById('sub-poids-vol');
        if (pvEl) pvEl.value = totalVal.toFixed(3);
        recalculerTotal();
    }
}

// ─── Ajouter un client et aller à l'étape 4 ──────────────
function ajouterClientEtContinuer() {
    const typeEnvoi = document.getElementById('type-envoi') ? document.getElementById('type-envoi').value : '';
    if (!typeEnvoi) { showCustomAlert('Erreur : aucun type de transport sélectionné.', 'error'); return; }

    const nom    = (document.getElementById('client-nom').value || '').trim();
    const prenom = (document.getElementById('client-prenom').value || '').trim();
    const tel    = (document.getElementById('client-tel').value || '').trim();
    if (!nom || !tel) { showCustomAlert('Veuillez renseigner le nom et le téléphone du client.', 'warning'); return; }

    const poidsVal = parseFloat(document.getElementById('sub-poids-vol').value) || 0;
    if (poidsVal <= 0) { showCustomAlert('Veuillez saisir le poids ou le volume.', 'warning'); return; }

    // Construire les sous-colis
    const descSimple = (document.getElementById('sub-desc').value || 'Colis').trim();
    let details = [...sousColisList];
    if (details.length === 0) {
        details = [{ desc: descSimple, qte: wizardQte, val: poidsVal }];
    }

    const descriptionResume = details.map(i => i.desc).join(', ');
    let poids = 0, volume = 0;
    if (typeEnvoi.startsWith('aerien')) poids = poidsVal; else volume = poidsVal;

    let prixEstime = 0;
    if (typeEnvoi === 'aerien_normal')  prixEstime = poidsVal * PRIX_AERIEN_NORMAL;
    else if (typeEnvoi === 'aerien_express') prixEstime = poidsVal * PRIX_AERIEN_EXPRESS;
    else if (typeEnvoi === 'maritime')  prixEstime = poidsVal * PRIX_MARITIME_CBM;

    // Génération de la référence unique dès l'étape 3
    const pref = typeEnvoi.startsWith('aerien') ? 'AIR' : 'MRT';
    let batchId = localStorage.getItem('amt_batchId');
    let batchCounter = parseInt(localStorage.getItem('amt_batchCounter') || '0') + 1;
    if (!batchId || envoiEnCours.length === 0) {
        const now = new Date();
        batchId = `${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        localStorage.setItem('amt_batchId', batchId);
        batchCounter = 1;
    }
    localStorage.setItem('amt_batchCounter', batchCounter.toString());
    const refColis = `${pref}-${batchId}-${String(batchCounter).padStart(2, '0')}`;

    const nouveauClient = {
        reference:         refColis,
        type:              typeEnvoi,
        expediteur:    (document.getElementById('expediteur-nom').value || 'AMT TRANSIT CARGO').trim(),
        telExpediteur: (document.getElementById('expediteur-tel').value || '+225 0703165050').trim(),
        nom, prenom, tel,
        description:       descriptionResume,
        detailsColis:      details,
        quantiteEnvoyee:   wizardQte,
        poidsEnvoye:       poids,
        volumeEnvoye:      volume,
        prixEstime:        formatArgent(prixEstime) + ' CFA',
        photosFiles:       Array.from(document.getElementById('photos-colis').files),
    };
    envoiEnCours.push(nouveauClient);

    // Sauvegarde dans le localStorage en cas de fermeture accidentelle de la page
    const toSave = envoiEnCours.map(c => { const copy = { ...c }; delete copy.photosFiles; return copy; });
    localStorage.setItem('amt_envoiEnCours', JSON.stringify(toSave));

    // Réinitialiser le formulaire client
    document.getElementById('client-nom').value    = '';
    document.getElementById('client-prenom').value = '';
    document.getElementById('client-tel').value    = '';
    document.getElementById('sub-desc').value      = '';
    document.getElementById('sub-poids-vol').value = '';
        document.getElementById('photos-colis').value  = '';
    document.getElementById('apercu-photos').innerHTML = '';
    document.getElementById('autocomplete-suggestions').style.display = 'none';
        
        document.getElementById('multi-desc').value  = '';
        document.getElementById('multi-qte').value   = '1';
        document.getElementById('multi-poids').value = '';

    sousColisList = [];
        _updateMultiTable();

    wizardQte = 1;
    const qteEl = document.getElementById('qte-display');
    if (qteEl) qteEl.textContent = '1';
    const prixEl = document.getElementById('prix-calcule-wizard');
    if (prixEl) prixEl.textContent = '0 CFA';

    currentEnvoi = nouveauClient;
    showCustomConfirm(`✅ Client ajouté avec succès !\n\nVoulez-vous imprimer les étiquettes pour ce colis (${nouveauClient.quantiteEnvoyee} carton(s)) maintenant ?`).then(async (askPrint) => {
        if (askPrint && typeof genererEtiquette === 'function') {
            await genererEtiquette();
        }
        goStep(4);
    });
}

// ─── Étape 4 : Afficher la liste ─────────────────────────
function renderClientsList() {
    const container = document.getElementById('clients-list-display');
    if (!container) return;
    if (envoiEnCours.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#aaa;padding:20px;">Aucun client ajouté pour l\'instant.</p>';
        return;
    }

    const typeEnvoi = document.getElementById('type-envoi') ? document.getElementById('type-envoi').value : '';
    let total = 0;
    let html = '';

    envoiEnCours.forEach((c, i) => {
        const isAir = (c.type || typeEnvoi || '').startsWith('aerien');
        const pv = isAir ? c.poidsEnvoye : c.volumeEnvoye;
        const unit = isAir ? 'Kg' : 'CBM';
        const prixNum = parseInt((c.prixEstime || '0').replace(/\D/g, '')) || 0;
        total += prixNum;
        const initials = (c.nom || 'CL').substring(0, 2).toUpperCase();

        html += `<div class="client-row">
            <div class="client-avatar-circle">${initials}</div>
            <div class="client-info-wrap">
                <div class="client-name-main">${c.nom} ${c.prenom}</div>
                <div class="client-meta-main">${c.quantiteEnvoyee} colis · ${pv} ${unit} · ${c.tel}</div>
            </div>
        <div class="client-prix-main" style="white-space:nowrap;">${c.prixEstime}</div>
        <div style="display:flex; gap:6px; margin-left:8px; margin-right:4px;">
            <button title="Imprimer Étiquette" onclick="imprimerEtiquetteDirect(${i})" style="background:#f39c12; color:white; border:none; border-radius:6px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fas fa-print"></i></button>
            <button title="Imprimer Facture" onclick="imprimerFactureDirect(${i})" style="background:#34495e; color:white; border:none; border-radius:6px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer;"><i class="fas fa-file-invoice"></i></button>
        </div>
            <button class="client-del-btn" onclick="removeClientFromList(${i})">✕</button>
        </div>`;
    });

    html += `<div class="clients-total-line">
        <span>${envoiEnCours.length} client(s)</span>
        <span style="color:#15609e;">${formatArgent(total)} CFA</span>
    </div>`;

    container.innerHTML = html;
}

function removeClientFromList(i) {
    envoiEnCours.splice(i, 1);
    const toSave = envoiEnCours.map(c => { const copy = { ...c }; delete copy.photosFiles; return copy; });
    localStorage.setItem('amt_envoiEnCours', JSON.stringify(toSave));
    if (envoiEnCours.length === 0) {
        localStorage.removeItem('amt_batchId'); localStorage.removeItem('amt_batchCounter');
    }
    renderClientsList();
}

function imprimerEtiquetteDirect(i) {
    currentEnvoi = envoiEnCours[i];
    if (typeof genererEtiquette === 'function') genererEtiquette();
    else showCustomAlert("L'outil d'impression n'est pas chargé.", "error");
}

function imprimerFactureDirect(i) {
    currentEnvoi = envoiEnCours[i];
    if (typeof genererFacture === 'function') genererFacture();
    else showCustomAlert("L'outil d'impression n'est pas chargé.", "error");
}

// ─── Validation globale ───────────────────────────────────
async function validerEnvoiGroupe() {
    if (envoiEnCours.length === 0) { showCustomAlert('Ajoutez au moins un client avant de valider.', 'warning'); return; }
    const btn = document.getElementById('btn-valider-envoi-groupe');
    btn.disabled = true;
    btn.textContent = '⏳ Enregistrement...';

    try {
        const d = document.getElementById('date-envoi').value;
        const t = document.getElementById('type-envoi').value;

        // Vérification chronologie
        if (d) {
            const lastSnap = await db.collection('expeditions').orderBy('date', 'desc').limit(1).get();
            if (!lastSnap.empty) {
                const lastDate = lastSnap.docs[0].data().date;
                if (lastDate && d < lastDate) {
                    const dStr = d.split('-').reverse().join('/');
                    const lastStr = lastDate.split('-').reverse().join('/');
                    if (!(await showCustomConfirm(`⚠️ ATTENTION : La date (${dStr}) est antérieure au dernier envoi (${lastStr}).\n\nContinuer ?`))) {
                        btn.disabled = false;
                        btn.textContent = '🚀 VALIDER L\'ENVOI GLOBAL';
                        return;
                    }
                }
            }
        }

        const numConteneur = (document.getElementById('num-conteneur') || {}).value || '';

        const batch = db.batch();
        const envoisSauvegardes = [];

        for (let i = 0; i < envoiEnCours.length; i++) {
            const c = envoiEnCours[i];
            const newRef = db.collection('expeditions').doc();

            const dataToSave = {
                reference:        c.reference,
                refGroupe:        '',
                date:             d,
                type:             t,
                numBL:            t === 'maritime' ? numConteneur : '',
                nom:              c.nom,
                prenom:           c.prenom,
                tel:              c.tel,
                description:      c.description,
                detailsColis:     c.detailsColis || [],
                expediteur:       c.expediteur,
                telExpediteur:    c.telExpediteur,
                quantiteEnvoyee:  parseInt(c.quantiteEnvoyee) || 0,
                poidsEnvoye:      c.poidsEnvoye,
                volumeEnvoye:     c.volumeEnvoye,
                prixEstime:       c.prixEstime,
                remise:           0,
                fraisSupplementaires: 0,
                creeLe:           firebase.firestore.FieldValue.serverTimestamp(),
                status:           'En attente',
                quantiteRecue:    0,
                poidsRecu:        0,
                montantPaye:      0,
                historiquePaiements: [],
                photosURLs:       [],
            };
            
            batch.set(newRef, dataToSave);
            envoisSauvegardes.push(dataToSave);
        }

        await batch.commit();
        
        localStorage.removeItem('amt_envoiEnCours'); localStorage.removeItem('amt_batchId'); localStorage.removeItem('amt_batchCounter');

        const askPrint = await showCustomConfirm(`✅ Envoi validé avec succès ! (${envoiEnCours.length} client(s))\n\nVoulez-vous (ré)imprimer l'ensemble des étiquettes de tout le lot maintenant ?`);
        if (askPrint && typeof genererEtiquettesBatch === 'function') {
            btn.textContent = '🖨️ Impression...';
            await genererEtiquettesBatch(envoisSauvegardes);
        }

        // Réinitialiser complètement
        envoiEnCours = [];
        sousColisList = [];
        _updateMultiTable();
        wizardQte = 1;
        selectedTransportCard = null;
        document.querySelectorAll('.transport-card').forEach(c => c.classList.remove('selected'));
        const hiddenType = document.getElementById('type-envoi');
        if (hiddenType) hiddenType.value = '';
        const dateEl = document.getElementById('date-envoi');
        if (dateEl) dateEl.valueAsDate = new Date();
        const cg = document.getElementById('conteneur-group');
        if (cg) cg.style.display = 'none';
        const nc = document.getElementById('num-conteneur');
        if (nc) nc.value = '';

        // Vider les champs du formulaire client
        document.getElementById('client-nom').value    = '';
        document.getElementById('client-prenom').value = '';
        document.getElementById('client-tel').value    = '';
        document.getElementById('sub-desc').value      = '';
        document.getElementById('sub-poids-vol').value = '';
        document.getElementById('photos-colis').value  = '';
        document.getElementById('apercu-photos').innerHTML = '';
        document.getElementById('multi-desc').value  = '';
        document.getElementById('multi-qte').value   = '1';
        document.getElementById('multi-poids').value = '';
        
        const btn1 = document.getElementById('btn-next-1');
        if (btn1) btn1.disabled = true;
        goStep(1);

    } catch (e) {
        showCustomAlert('Erreur lors de la validation : ' + e.message, 'error');
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.textContent = '🚀 VALIDER L\'ENVOI GLOBAL';
    }
}

// ─── Autocomplete (inchangé) ──────────────────────────────
async function loadAllClientsForAutocomplete() {
    try {
        const s = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(1000).get();
        const m = new Map();
        s.forEach(d => {
            const da = d.data();
            if (da.tel && !m.has(da.tel))
                m.set(da.tel, { nom: da.nom, prenom: da.prenom, tel: da.tel });
        });
        allPastClients = Array.from(m.values());
    } catch (e) { /* silencieux */ }
}

// ─── Compatibilité avec les fonctions héritées ───────────
// Ces fonctions sont appelées depuis historique.html et reception.html via pdf-utils.js
// On les garde pour la compatibilité mais elles redirigent vers la logique wizard

function ajouterSousColis() {
    const desc  = document.getElementById('sub-desc').value || 'Colis';
    const qte   = parseInt(document.getElementById('sub-qte') ? document.getElementById('sub-qte').value : 1) || 1;
    const val   = parseFloat(document.getElementById('sub-poids-vol').value) || 0;
    if (qte <= 0 || val <= 0) { showCustomAlert('Quantité et valeur doivent être > 0', 'error'); return; }
    sousColisList.push({ desc, qte, val });
    _updateMultiTable();
}

function mettreAJourTableauEnvoiEnCours() { renderClientsList(); }
