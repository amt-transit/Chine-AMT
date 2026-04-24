// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\historique.js

let showPaidHistorique = false;

document.addEventListener('DOMContentLoaded', () => {
    ouvrirSousOngletHistorique('maritime');
    
    const sHi = document.getElementById('search-hist-chine');
    if(sHi) sHi.addEventListener('input', ()=>updateHistoriqueView(sHi.value));

    const mp = document.getElementById('modif-poids'); if(mp) mp.oninput=calculerPrixModif;
    const mr = document.getElementById('modif-remise'); if(mr) mr.oninput=calculerPrixModif;
    const mf = document.getElementById('modif-frais'); if(mf) mf.oninput=calculerPrixModif;
    const mType = document.getElementById('modif-type'); if(mType) mType.onchange=onTypeChange;
    const mpu = document.getElementById('modif-prix-unitaire'); if(mpu) mpu.oninput=calculerPrixModif;
});

function ouvrirSousOngletHistorique(type) {
    currentHistoriqueType = type;
    const b1=document.getElementById('btn-hist-maritime'); const b2=document.getElementById('btn-hist-aerien');
    if(b1&&b2) { if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} else {b1.classList.remove('active');b2.classList.add('active');} }
    const panelBL = document.getElementById('panel-gestion-bl');
    if(panelBL) panelBL.style.display = (type === 'maritime') ? 'block' : 'none';
    chargerHistoriqueChine();
}

async function chargerHistoriqueChine() {
    const tb = document.getElementById('tbody-historique-chine'); if(!tb) return;
    tb.innerHTML='<tr><td colspan="9">Chargement...</td></tr>';
    const sIn = document.getElementById('search-hist-chine');
    
    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(500).get();
        allHistoriqueData = [];
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentHistoriqueType==='maritime' && data.type==='maritime') match=true;
            if(currentHistoriqueType==='aerien' && (data.type||"").startsWith('aerien')) match=true;
            if(match) allHistoriqueData.push({id:d.id, ...data});
        });
        renderGroupFilter(allHistoriqueData, 'filter-container-hist', ()=>updateHistoriqueView(sIn?sIn.value:''));
        updateBLGroupSelect();
        updateHistoriqueView(sIn?sIn.value:'');
    } catch(e) { console.error(e); }
}

function toggleShowPaidHistorique() {
    showPaidHistorique = document.getElementById('cb-show-paid-hist').checked;
    const sIn = document.getElementById('search-hist-chine');
    updateHistoriqueView(sIn ? sIn.value : '');
}

function updateHistoriqueView(searchQuery) {
    const tb = document.getElementById('tbody-historique-chine');
    let filtered = allHistoriqueData.filter(d => {
        if(selectedGroupsHistorique.length > 0 && !selectedGroupsHistorique.includes(d.refGroupe)) return false;
        
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
        let final = pB + (d.fraisSupplementaires||0) - (d.remise||0);
        let dejaPaye = parseInt(d.montantPaye) || 0;
        // Si on ne veut pas voir les payés, et que c'est payé (et que le prix n'est pas 0), on masque
        if (!showPaidHistorique && dejaPaye >= final && final > 0) return false;

        if(searchQuery && !JSON.stringify(d).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });
    filtered.sort((a, b) => {
        const numA = parseInt((a.refGroupe||"").replace('EV', '')) || 0;
        const numB = parseInt((b.refGroupe||"").replace('EV', '')) || 0;
        if (numA !== numB) return numB - numA; 
        return (a.reference || "").localeCompare(b.reference || "");
    });
    historiqueCharges = filtered; 
    let curGrp=null, gQ=0, gV=0, gP=0, tQ=0, tV=0, tP=0;
    let html = '';
    filtered.forEach((d, idx) => {
        if(curGrp!==null && d.refGroupe!==curGrp) {
            let u = currentHistoriqueType==='aerien'?'Kg':'CBM';
            html += `<tr class="subtotal-row"><td colspan="5" data-label="Total">TOTAL ${curGrp}</td><td data-label="Qté">${gQ}</td><td data-label="Kg/CBM">${gV.toFixed(2)} ${u}</td><td style="white-space:nowrap;" data-label="Prix">${formatArgent(gP)} CFA</td><td colspan="2" data-label="Action"></td></tr>`;
            gQ=0; gV=0; gP=0;
        }
        curGrp = d.refGroupe;
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? (d.poidsEnvoye||0) : (d.volumeEnvoye||0);
        gQ+=parseInt(d.quantiteEnvoyee)||0; gV+=parseFloat(pv); tQ+=parseInt(d.quantiteEnvoyee)||0; tV+=parseFloat(pv);
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
        let final = pB + (d.fraisSupplementaires||0) - (d.remise||0);
        gP+=final; tP+=final;
        let dejaPaye = parseInt(d.montantPaye) || 0;
        let colorStyle = "";
        let payeBadge = "";
        if(dejaPaye >= final && final > 0) {
            colorStyle = "color:#27ae60; font-weight:bold;";
            payeBadge = '<br><span class="status-badge" style="background:#27ae60; font-size:9px; margin-top:2px; display:inline-block;">✅ PAYÉ</span>';
        }
        else if(dejaPaye > 0) {
            colorStyle = "color:#e67e22; font-weight:bold;";
            payeBadge = '<br><span class="status-badge" style="background:#f39c12; font-size:9px; margin-top:2px; display:inline-block;">ACOMPTE</span>';
        }
        else colorStyle = "color:#c0392b; font-weight:bold;";
        let dateS = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-';
        let pvStr = pv + (isAir?' Kg':' CBM');
        let mod = d.dernierModificateur ? `<span class="modif-info">Par ${d.dernierModificateur}</span>` : '-';
        const j = JSON.stringify({id:d.id, ...d}).replace(/'/g, "&#39;");
        let checkbox = `<input type="checkbox" class="hist-check" value="${d.id}" onchange="gererSelectionHistorique('${d.id}')" onclick="event.stopPropagation()">`;
        let recuIcon = (d.quantiteRecue > 0 || d.estArrive) ? '<i class="fas fa-check-circle" style="color:#27ae60; margin-left:5px;" title="Reçu / Arrivé"></i>' : '';
        html += `<tr class="interactive-table-row" onclick='ouvrirModalModifViaData("${encodeURIComponent(j)}")'><td data-label="Sélection">${checkbox}</td><td data-label="Réf.">${d.reference}${recuIcon}</td><td data-label="Conteneur">${d.numBL || '-'}</td><td data-label="Date">${dateS}</td><td data-label="Client">${d.nom} ${d.prenom}</td><td data-label="Qté">${d.quantiteEnvoyee}</td><td data-label="Kg/CBM">${pvStr}</td><td style="${colorStyle} white-space:nowrap; text-align:right;" data-label="Prix">${formatArgent(final)} CFA${payeBadge}</td><td data-label="Modifié par">${mod}</td><td data-label="Action"><i class="fas fa-edit"></i></td></tr>`;
        if(idx === filtered.length-1) {
            let u = isAir?'Kg':'CBM';
            html += `<tr class="subtotal-row"><td colspan="5" data-label="Total">TOTAL ${curGrp}</td><td data-label="Qté">${gQ}</td><td data-label="Kg/CBM">${gV.toFixed(2)} ${u}</td><td style="white-space:nowrap;" data-label="Prix">${formatArgent(gP)} CFA</td><td colspan="2" data-label="Action"></td></tr>`;
        }
    });
    tb.innerHTML = html;
    document.getElementById('total-hist-qty').innerText = tQ;
    let uTot = currentHistoriqueType==='aerien'?' Kg':' CBM';
    document.getElementById('total-hist-vol').innerText = tV.toFixed(2) + uTot;
    if(document.getElementById('total-hist-prix')) document.getElementById('total-hist-prix').innerText = formatArgent(tP) + ' CFA';
}

function renderGroupFilter(data, containerId, callback) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '<span class="filter-title">Filtrer par Groupe :</span>';
    const groups = [...new Set(data.map(d => d.refGroupe).filter(g => g))];
    groups.sort((a,b) => parseInt(a.replace('EV','')) - parseInt(b.replace('EV','')));
    groups.forEach(g => {
        const label = document.createElement('label');
        label.className = 'filter-option';
        label.innerHTML = `<input type="checkbox" value="${g}"> ${g}`;
        label.querySelector('input').onchange = (e) => {
            const targetArr = containerId.includes('hist') ? selectedGroupsHistorique : selectedGroupsReception;
            if(e.target.checked) targetArr.push(g); else { const i = targetArr.indexOf(g); if(i>-1) targetArr.splice(i,1); }
            callback();
        };
        container.appendChild(label);
    });
}

function gererSelectionHistorique(id) {
    if (selectedHistoriqueIds.has(id)) selectedHistoriqueIds.delete(id); else selectedHistoriqueIds.add(id);
    updateActionsHistorique();
}
function toggleToutSelectionnerHist(source) {
    const boxes = document.querySelectorAll('.hist-check');
    selectedHistoriqueIds.clear();
    boxes.forEach(b => { b.checked = source.checked; if(b.checked) selectedHistoriqueIds.add(b.value); });
    updateActionsHistorique();
}
function updateActionsHistorique() {
    const div = document.getElementById('hist-bulk-actions');
    const span = document.getElementById('hist-count-sel');
    if (selectedHistoriqueIds.size > 0) {
        div.style.display = 'flex'; span.innerText = selectedHistoriqueIds.size + " élt(s)";
        const select = document.getElementById('hist-bulk-select');
        if (select.options.length === 0) chargerGroupesPourBulk();
    } else { div.style.display = 'none'; }
}
async function chargerGroupesPourBulk() {
    const select = document.getElementById('hist-bulk-select');
    let groupes = new Set(allHistoriqueData.map(d => d.refGroupe).filter(g => g && g.startsWith('EV')));
    const sorted = Array.from(groupes).sort((a, b) => parseInt(b.replace('EV', '')||0) - parseInt(a.replace('EV', '')||0));
    select.innerHTML = '<option value="">Choisir destination...</option>';
    const optNew = document.createElement('option'); optNew.value = "NEW_CUSTOM"; optNew.innerText = "➕ Nouveau groupe..."; select.appendChild(optNew);
    sorted.forEach(g => { const opt = document.createElement('option'); opt.value = g; opt.innerText = g; select.appendChild(opt); });
}

function onTypeChange() {
    const typeSelect = document.getElementById('modif-type');
    const typeEnvoi = typeSelect ? typeSelect.value : 'aerien_normal';
    let t = 0;
    if(typeEnvoi==='aerien_normal') {
        t=PRIX_AERIEN_NORMAL;
    } else if(typeEnvoi==='aerien_express') {
        t=PRIX_AERIEN_EXPRESS;
    } else {
        t=PRIX_MARITIME_CBM;
    }
    const mpu = document.getElementById('modif-prix-unitaire');
    if (mpu) mpu.value = t;
    calculerPrixModif();
}

function ouvrirModalModifViaData(enc) { ouvrirModalModif(JSON.parse(decodeURIComponent(enc))); }
const modalModif = document.getElementById('modal-modif-chine');
function ouvrirModalModif(envoi) {
    currentModifEnvoi = envoi; currentEnvoi = envoi;
    if(modalModif) {
        modalModif.style.display = 'flex';
        document.getElementById('modif-nom').value = envoi.nom || ''; document.getElementById('modif-prenom').value = envoi.prenom || ''; document.getElementById('modif-tel').value = envoi.tel || '';
        chargerGroupesDansModif(envoi.refGroupe);
        const typeSelect = document.getElementById('modif-type');
        if (typeSelect) typeSelect.value = envoi.type || 'aerien_normal';
        document.getElementById('modif-qte').value = envoi.quantiteEnvoyee; document.getElementById('modif-remise').value = envoi.remise || 0;
        const elFrais = document.getElementById('modif-frais'); if(elFrais) elFrais.value = envoi.fraisSupplementaires || 0;
        const elP = document.getElementById('modif-poids');
        if((envoi.type||"").startsWith('aerien')) elP.value = envoi.poidsEnvoye; else elP.value = envoi.volumeEnvoye;
        
        let pB = parseInt((envoi.prixEstime||"0").replace(/\D/g,''))||0;
        let v = parseFloat(elP.value) || 0;
        let pu = (v > 0) ? (pB / v) : 0;
        if (pu === 0) {
            let tType = envoi.type || 'aerien_normal';
            if(tType==='aerien_normal') pu=PRIX_AERIEN_NORMAL; else if(tType==='aerien_express') pu=PRIX_AERIEN_EXPRESS; else pu=PRIX_MARITIME_CBM;
        }
        const mpu = document.getElementById('modif-prix-unitaire');
        if (mpu) mpu.value = pu;

        calculerPrixModif();
        updateModalArriveButton();
    }
}
function calculerPrixModif() {
    if(!currentModifEnvoi) return;
    const v = parseFloat(document.getElementById('modif-poids').value)||0;
    const r = parseInt(document.getElementById('modif-remise').value)||0;
    const f = parseInt(document.getElementById('modif-frais').value)||0;
    let t = 0;
    const typeSelect = document.getElementById('modif-type');
    const typeEnvoi = typeSelect ? typeSelect.value : currentModifEnvoi.type;
    
    const lblPoids = document.getElementById('label-modif-poids');
    if (lblPoids) {
        lblPoids.innerText = typeEnvoi.startsWith('aerien') ? 'Poids (Kg)' : 'Volume (CBM)';
    }

    t = parseFloat(document.getElementById('modif-prix-unitaire').value);
    if (isNaN(t)) {
        if(typeEnvoi==='aerien_normal') t=PRIX_AERIEN_NORMAL; else if(typeEnvoi==='aerien_express') t=PRIX_AERIEN_EXPRESS; else t=PRIX_MARITIME_CBM;
    }

    document.getElementById('modif-prix-final').value = formatArgent((v*t)+f-r)+' CFA';
}
function fermerModalModif(e) { if(e.target===modalModif || e.target.classList.contains('modal-close')) modalModif.style.display='none'; }

function updateModalArriveButton() {
    const btn = document.getElementById('btn-marquer-arrive-hist');
    if(btn && currentModifEnvoi) {
        if(currentModifEnvoi.estArrive) {
            btn.innerHTML = "❌ Annuler Arrivée";
            btn.style.backgroundColor = "#6c757d";
        } else {
            btn.innerHTML = "🛬 Arrivé au Dépôt";
            btn.style.backgroundColor = "#17a2b8";
        }
    }
}

async function basculerStatutArrive() {
    if (!currentModifEnvoi) return;
    if(currentRole === 'spectateur') { showCustomAlert("Action non autorisée.", "error"); return; }
    const newState = !currentModifEnvoi.estArrive;
    try {
        await db.collection('expeditions').doc(currentModifEnvoi.id).update({ estArrive: newState });
        currentModifEnvoi.estArrive = newState;
        updateModalArriveButton();
        chargerHistoriqueChine();
    } catch (e) { showCustomAlert(e.message, "error"); }
}

async function sauvegarderModificationChine() {
    if(!currentModifEnvoi) return;
    if(currentRole === 'spectateur') { showCustomAlert("Action non autorisée.", "error"); return; }
    const nom = document.getElementById('modif-nom').value; const prenom = document.getElementById('modif-prenom').value; const tel = document.getElementById('modif-tel').value;
    const q = parseInt(document.getElementById('modif-qte').value) || 0; const v = parseFloat(document.getElementById('modif-poids').value) || 0; const r = parseInt(document.getElementById('modif-remise').value) || 0;
    const f = parseInt(document.getElementById('modif-frais').value) || 0;
    const nouveauGroupe = document.getElementById('modif-groupe-select').value;

    // 1. Récupérer les données fraîches de la base pour le calcul du statut
    let freshDoc;
    try {
        freshDoc = await db.collection('expeditions').doc(currentModifEnvoi.id).get();
    } catch(e) {
        showCustomAlert("Erreur de connexion : " + e.message, "error");
        return;
    }
    const freshData = freshDoc.data();

    const typeSelect = document.getElementById('modif-type');
    const nouveauType = typeSelect ? typeSelect.value : currentModifEnvoi.type;

    let up = { nom: nom, prenom: prenom, tel: tel, quantiteEnvoyee: q, remise: r, fraisSupplementaires: f, type: nouveauType, dernierModificateur: currentRole === 'chine' ? 'Agence Chine' : 'Agence Abidjan', dateModification: firebase.firestore.FieldValue.serverTimestamp() };
    if(nouveauType.startsWith('aerien')) { up.poidsEnvoye = v; if (currentModifEnvoi.type === 'maritime') up.volumeEnvoye = 0; }
    else { up.volumeEnvoye = v; if ((currentModifEnvoi.type || "").startsWith('aerien')) up.poidsEnvoye = 0; }

    let t = parseFloat(document.getElementById('modif-prix-unitaire').value);
    if (isNaN(t)) {
        if(nouveauType === 'aerien_normal') t = PRIX_AERIEN_NORMAL; else if(nouveauType === 'aerien_express') t = PRIX_AERIEN_EXPRESS; else t = PRIX_MARITIME_CBM;
    }

    up.prixEstime = formatArgent(v * t) + ' CFA';
    
    const nouveauPrixVal = (v * t) + f - r;

    // LOGIQUE AUDIT : Détection changement de prix (Facture)
    // Recalcul de l'ancien net pour comparaison juste
    let tOld = 0;
    if(freshData.type === 'aerien_normal') tOld = PRIX_AERIEN_NORMAL; else if(freshData.type === 'aerien_express') tOld = PRIX_AERIEN_EXPRESS; else tOld = PRIX_MARITIME_CBM;
    let volOld = (freshData.type||"").startsWith('aerien') ? (freshData.poidsEnvoye||0) : (freshData.volumeEnvoye||0);
    const ancienNet = (volOld * tOld) + (freshData.fraisSupplementaires||0) - (freshData.remise||0);
    
    if (Math.abs(ancienNet - nouveauPrixVal) > 5) { // Tolérance de 5 CFA pour arrondis
        up.historiqueModifications = firebase.firestore.FieldValue.arrayUnion({
            date: new Date(),
            type: 'prix',
            ancien: ancienNet,
            nouveau: nouveauPrixVal,
            auteur: currentUser ? currentUser.email : 'Système'
        });
    }
    
    if (nouveauGroupe && nouveauGroupe !== currentModifEnvoi.refGroupe) {
        up.refGroupe = nouveauGroupe;
        let ref = currentModifEnvoi.reference || "";
        let oldG = currentModifEnvoi.refGroupe || "";
        if (oldG && ref.endsWith(oldG)) {
            up.reference = ref.substring(0, ref.lastIndexOf(oldG)) + nouveauGroupe;
        } else {
            up.reference = ref + (ref.endsWith('-') ? '' : '-') + nouveauGroupe;
        }
    }
    
    // Utilisation des données fraîches (freshData) pour vérifier la réception
    if (freshData && freshData.quantiteRecue > 0) {
        const qRecue = freshData.quantiteRecue || 0; 
        const pRecu = freshData.poidsRecu || 0;
        let nouveauStatut = 'Reçu - Conforme';
        const diffQ = qRecue - q; const diffP = pRecu - v;
        if (diffQ < 0) nouveauStatut = 'Reçu - Ecart'; else if (diffQ > 0) nouveauStatut = 'Reçu - Supérieur';
        else { if (Math.abs(diffP) > 0.1) nouveauStatut = (diffP > 0 ? 'Reçu - Supérieur' : 'Reçu - Ecart'); else nouveauStatut = 'Reçu - Conforme'; }
        up.status = nouveauStatut;
    }
    try { await db.collection('expeditions').doc(currentModifEnvoi.id).update(up); showCustomAlert('Modifié avec succès.', 'success'); modalModif.style.display = 'none'; chargerHistoriqueChine(); } catch(e) { showCustomAlert(e.message, "error"); }
}

async function chargerGroupesDansModif(groupeActuel) {
    const select = document.getElementById('modif-groupe-select'); if (!select) return;
    select.innerHTML = '<option value="">Chargement...</option>';
    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(200).get();
        const groupes = new Set(); snap.forEach(doc => { const d = doc.data(); if (d.refGroupe && d.refGroupe.startsWith('EV')) { groupes.add(d.refGroupe); } });
        if (groupeActuel) groupes.add(groupeActuel);
        const sorted = Array.from(groupes).sort((a, b) => parseInt(b.replace('EV', '')||0) - parseInt(a.replace('EV', '')||0));
        select.innerHTML = ''; 
        const optNew = document.createElement('option'); optNew.value = "NEW_CUSTOM"; optNew.innerText = "➕ Créer un nouveau groupe..."; optNew.style.fontWeight = "bold"; optNew.style.color = "#27ae60"; select.appendChild(optNew);
        sorted.forEach(g => { const opt = document.createElement('option'); opt.value = g; opt.innerText = g; if (g === groupeActuel) opt.selected = true; select.appendChild(opt); });
    } catch (e) { console.error(e); }
}

function verifierCreationGroupe(selectElement) {
    if (selectElement.value === "NEW_CUSTOM") {
        const nomNouveau = prompt("Entrez le nom du nouveau groupe (ex: EV12) :", "EV");
        if (nomNouveau && nomNouveau.trim() !== "") { const nomFinal = nomNouveau.toUpperCase().trim(); const opt = document.createElement('option'); opt.value = nomFinal; opt.innerText = nomFinal; opt.selected = true; selectElement.add(opt, selectElement.options[1]); } 
        else { selectElement.value = currentModifEnvoi.refGroupe; }
    }
}

async function changerGroupeEnMasse() {
    const select = document.getElementById('hist-bulk-select'); let nouveauGroupe = select.value;
    if (!nouveauGroupe) { showCustomAlert("Veuillez choisir un groupe de destination.", "warning"); return; }
    if (nouveauGroupe === "NEW_CUSTOM") { const nom = prompt("Nom du nouveau groupe (ex: EV15) :", "EV"); if (!nom) return; nouveauGroupe = nom.toUpperCase().trim(); }
    if (!(await showCustomConfirm(`Déplacer ${selectedHistoriqueIds.size} colis vers le groupe ${nouveauGroupe} ?\nLes références seront mises à jour automatiquement.`))) return; if(currentRole === 'spectateur') { showCustomAlert("Action non autorisée.", "error"); return; }
    const batch = db.batch(); let count = 0;
    selectedHistoriqueIds.forEach(id => {
        const item = allHistoriqueData.find(d => d.id === id);
        if (item) { 
            const refDoc = db.collection('expeditions').doc(id); 
            let updateData = { refGroupe: nouveauGroupe, dernierModificateur: currentRole === 'chine' ? 'Agence Chine (Masse)' : 'Agence Abidjan (Masse)', dateModification: firebase.firestore.FieldValue.serverTimestamp() }; 
            let ref = item.reference || "";
            let oldG = item.refGroupe || "";
            if (oldG && ref.endsWith(oldG)) {
                updateData.reference = ref.substring(0, ref.lastIndexOf(oldG)) + nouveauGroupe;
            } else {
                updateData.reference = ref + (ref.endsWith('-') ? '' : '-') + nouveauGroupe;
            }
            batch.update(refDoc, updateData); count++; 
        }
    });
    try { await batch.commit(); showCustomAlert(`${count} colis déplacés vers ${nouveauGroupe} avec succès !`, "success"); selectedHistoriqueIds.clear(); document.getElementById('check-all-hist').checked = false; document.getElementById('hist-bulk-actions').style.display = 'none'; chargerHistoriqueChine(); } catch (e) { showCustomAlert("Erreur : " + e.message, "error"); }
}

async function attribuerConteneurEnMasse() {
    const conteneur = document.getElementById('hist-bulk-conteneur').value.trim();
    if (!conteneur) { showCustomAlert("Veuillez saisir un numéro de conteneur / BL.", "warning"); return; }
    if (!(await showCustomConfirm(`Attribuer le conteneur "${conteneur}" aux ${selectedHistoriqueIds.size} colis sélectionnés ?`))) return; 
    if(currentRole === 'spectateur') { showCustomAlert("Action non autorisée.", "error"); return; }
    
    const batch = db.batch(); let count = 0;
    selectedHistoriqueIds.forEach(id => {
        const item = allHistoriqueData.find(d => d.id === id);
        if (item) { 
            const refDoc = db.collection('expeditions').doc(id); 
            let updateData = { numBL: conteneur, dernierModificateur: currentRole === 'chine' ? 'Agence Chine (Masse)' : 'Agence Abidjan (Masse)', dateModification: firebase.firestore.FieldValue.serverTimestamp() }; 
            batch.update(refDoc, updateData); count++; 
        }
    });
    try { await batch.commit(); showCustomAlert(`${count} colis mis à jour avec le conteneur ${conteneur} !`, "success"); selectedHistoriqueIds.clear(); document.getElementById('check-all-hist').checked = false; document.getElementById('hist-bulk-actions').style.display = 'none'; document.getElementById('hist-bulk-conteneur').value = ''; chargerHistoriqueChine(); } catch (e) { showCustomAlert("Erreur : " + e.message, "error"); }
}

async function supprimerCeColis() {
    if (!currentModifEnvoi) return;
    if(currentRole === 'spectateur') { showCustomAlert("Action non autorisée.", "error"); return; }
    const confirmation = await showCustomConfirm(`ATTENTION !\n\nVous êtes sur le point de supprimer définitivement le colis :\n${currentModifEnvoi.reference}\n\nCette action est IRRÉVERSIBLE. Voulez-vous continuer ?`);
    if (!confirmation) return;
    try { await db.collection('expeditions').doc(currentModifEnvoi.id).delete(); showCustomAlert("Colis supprimé avec succès.", "success"); if (modalModif) modalModif.style.display = 'none'; if (typeof chargerHistoriqueChine === "function") chargerHistoriqueChine(); } catch (e) { showCustomAlert("Erreur lors de la suppression : " + e.message, "error"); }
}

function updateBLGroupSelect() {
    const select = document.getElementById('select-bl-groupes');
    if(!select) return;
    const groups = [...new Set(allHistoriqueData.map(d => d.refGroupe).filter(g => g && g.startsWith('EV')))];
    groups.sort((a,b) => parseInt(b.replace('EV','')) - parseInt(a.replace('EV','')));
    const currentSelection = Array.from(select.selectedOptions).map(o => o.value);
    select.innerHTML = '';
    groups.forEach(g => {
        const opt = document.createElement('option'); opt.value = g; opt.innerText = g;
        if(currentSelection.includes(g)) opt.selected = true;
        select.appendChild(opt);
    });
    calculerRemplissageConteneur();
}

async function associerBLAuxGroupes() {
    const bl = document.getElementById('input-bl-conteneur').value.trim();
    const select = document.getElementById('select-bl-groupes');
    const selectedOptions = Array.from(select.selectedOptions).map(opt => opt.value);
    
    if (!bl) { showCustomAlert("Veuillez saisir un numéro de BL.", "warning"); return; }
    if (selectedOptions.length === 0) { showCustomAlert("Veuillez sélectionner au moins un groupe.", "warning"); return; }
    
    if (!(await showCustomConfirm(`Associer le BL "${bl}" aux groupes : ${selectedOptions.join(', ')} ?\nCela mettra à jour tous les colis de ces groupes.`))) return;
    
    const btn = document.querySelector('button[onclick="associerBLAuxGroupes()"]');
    if(btn) { btn.disabled = true; btn.innerText = "Traitement..."; }

    try {
        const groupChunks = [];
        // Firestore 'in' query limite à 10 éléments
        for (let i = 0; i < selectedOptions.length; i += 10) { groupChunks.push(selectedOptions.slice(i, i + 10)); }
        let totalUpdated = 0;
        for (const chunk of groupChunks) {
            const snap = await db.collection('expeditions').where('refGroupe', 'in', chunk).get();
            if (snap.empty) continue;
            const docs = snap.docs; const batchSize = 450; 
            for (let i = 0; i < docs.length; i += batchSize) {
                const batch = db.batch(); const subDocs = docs.slice(i, i + batchSize);
                subDocs.forEach(doc => { batch.update(doc.ref, { numBL: bl }); });
                await batch.commit(); totalUpdated += subDocs.length;
            }
        }
        showCustomAlert(`Succès ! ${totalUpdated} colis mis à jour avec le BL ${bl}.`, "success"); chargerHistoriqueChine(); document.getElementById('input-bl-conteneur').value = ''; Array.from(select.options).forEach(opt => opt.selected = false);
    } catch(e) { console.error(e); showCustomAlert("Erreur : " + e.message, "error"); } finally { if(btn) { btn.disabled = false; btn.innerText = "💾 Enregistrer BL"; } }
}

function calculerRemplissageConteneur() {
    const select = document.getElementById('select-bl-groupes');
    const bar = document.getElementById('bar-jauge-remplissage');
    const textJauge = document.getElementById('text-jauge-remplissage');
    
    if(!select || !bar || !textJauge) return;
    
    const maxCap = currentHistoriqueType === 'aerien' ? 5000 : 68; // 68 CBM par défaut en maritime
    const selectedGroups = Array.from(select.selectedOptions).map(opt => opt.value);
    
    let total = 0;
    allHistoriqueData.forEach(d => {
        if (selectedGroups.includes(d.refGroupe)) {
            let isAir = (d.type || "").startsWith('aerien');
            let pv = isAir ? parseFloat(d.poidsEnvoye) : parseFloat(d.volumeEnvoye);
            total += (pv || 0);
        }
    });
    
    let unit = currentHistoriqueType === 'aerien' ? 'Kg' : 'CBM';
    
    let pct = maxCap > 0 ? (total / maxCap) * 100 : 0;
    textJauge.innerText = `${total.toFixed(2)} / ${maxCap} ${unit} (${pct.toFixed(1)}%)`;
    bar.style.width = Math.min(pct, 100) + '%';
    
    if (maxCap > 0 && total > maxCap) {
        bar.style.background = '#c0392b'; // Rouge (Dépassement)
        textJauge.style.color = '#c0392b';
    } else {
        bar.style.background = '#27ae60'; // Vert (Conforme)
        textJauge.style.color = '#15609e';
    }
}
