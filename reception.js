// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\reception.js

let showPaidReception = false;

document.addEventListener('DOMContentLoaded', () => {
    ouvrirSousOngletReception('maritime');
    const sIn = document.getElementById('search-reception');
    if(sIn) sIn.addEventListener('input', () => updateReceptionView(sIn.value));
});

function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    const b1=document.getElementById('btn-rec-maritime'); const b2=document.getElementById('btn-rec-aerien');
    if(b1&&b2) { if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} else {b1.classList.remove('active');b2.classList.add('active');} }
    chargerClients();
}

async function chargerClients() {
    const tb = document.getElementById('liste-clients-tbody'); if(!tb) return;
    tb.innerHTML='<tr><td colspan="10">Chargement...</td></tr>';
    const sIn = document.getElementById('search-reception');
    
    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        allReceptionData = [];
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentReceptionType==='maritime' && data.type==='maritime') match=true;
            if(currentReceptionType==='aerien' && (data.type||"").startsWith('aerien')) match=true;
            if(match) allReceptionData.push({id:d.id, ...data});
        });
        renderGroupFilter(allReceptionData, 'filter-container-rec', () => updateReceptionView(sIn?sIn.value:''));
        updateReceptionView(sIn?sIn.value:'');
    } catch(e) { console.error(e); }
}

function toggleShowPaidReception() {
    showPaidReception = document.getElementById('cb-show-paid-rec').checked;
    const sIn = document.getElementById('search-reception');
    updateReceptionView(sIn ? sIn.value : '');
}

function updateReceptionView(searchQuery) {
    const tb = document.getElementById('liste-clients-tbody');
    let filtered = allReceptionData.filter(d => {
        if(selectedGroupsReception.length > 0 && !selectedGroupsReception.includes(d.refGroupe)) return false;
        
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
        let pN = pB + (d.fraisSupplementaires||0) - (d.remise||0);
        let res = pN - (parseInt(d.montantPaye)||0);
        // Si masqué et reste à payer <= 0 (et que le prix n'était pas gratuit), on cache
        if (!showPaidReception && res <= 0 && pN > 0) return false;

        if(searchQuery && !JSON.stringify(d).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });
    let curGrp=null, gQ=0, gV=0, gP=0, tQ=0, tV=0, tP=0;
    clientsCharges = filtered; 
    let html = '';
    filtered.forEach((d, idx) => {
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? (d.poidsEnvoye||0) : (d.volumeEnvoye||0);
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
        let pN = pB + (d.fraisSupplementaires||0) - (d.remise||0);
        let res = pN - (parseInt(d.montantPaye)||0);
        if(curGrp!==null && d.refGroupe!==curGrp) {
            let u = currentReceptionType.startsWith('aerien')?'Kg':'CBM';
            html += `<tr class="subtotal-row"><td colspan="7">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td>${formatArgent(gP)}</td><td></td></tr>`;
            gQ=0; gV=0; gP=0;
        }
        curGrp = d.refGroupe;
        gQ += parseInt(d.quantiteEnvoyee)||0; gV += parseFloat(pv); gP += res; tQ += parseInt(d.quantiteEnvoyee)||0; tV += parseFloat(pv); tP += res;
        let cl = (d.status||"").includes('Conforme')?'status-conforme':(d.status||"").includes('Ecart')?'status-ecart':'status-attente';
        const safe = encodeURIComponent(JSON.stringify({id:d.id, ...d}));
        let checkbox = `<input type="checkbox" class="rec-check" value="${d.id}" onchange="gererSelectionReception('${d.id}')" onclick="event.stopPropagation()">`;
        let recuIcon = (d.quantiteRecue > 0 || d.estArrive) ? '<i class="fas fa-check-circle" style="color:#27ae60; margin-left:5px;" title="Reçu / Arrivé"></i>' : '';
        html += `<tr class="interactive-table-row" onclick='selectionnerClientViaData("${safe}")'><td>${checkbox}</td> <td>${d.reference}${recuIcon}</td><td>${d.numBL || '-'}</td><td>${new Date(d.date).toLocaleDateString()}</td><td>${d.nom} ${d.prenom}</td><td>${d.description}</td><td>${d.type}</td><td>${d.quantiteEnvoyee}</td><td>${pv}</td><td style="font-weight:bold; color:${res>0?'#c0392b':'#27ae60'}">${formatArgent(res)} CFA</td><td><span class="status-badge ${cl}">${d.status||'-'}</span></td></tr>`;
        if(idx === filtered.length-1) {
             let u = isAir?'Kg':'CBM';
             html += `<tr class="subtotal-row"><td colspan="7">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td>${formatArgent(gP)}</td><td></td></tr>`;
        }
    });
    tb.innerHTML = html;
    document.getElementById('total-rec-qty').innerText = tQ;
    document.getElementById('total-rec-vol').innerText = tV.toFixed(2);
    document.getElementById('total-rec-prix').innerText = formatArgent(tP) + ' CFA';
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

function gererSelectionReception(id) {
    if (selectedReceptionIds.has(id)) selectedReceptionIds.delete(id); else selectedReceptionIds.add(id);
    updateBoutonGroupe();
}
function toggleToutSelectionner(checkboxMaitre) {
    const checks = document.querySelectorAll('.rec-check');
    selectedReceptionIds.clear();
    checks.forEach(c => { c.checked = checkboxMaitre.checked; if (c.checked) selectedReceptionIds.add(c.value); });
    updateBoutonGroupe();
}
function updateBoutonGroupe() {
    const btn = document.getElementById('btn-group-pay');
    const btnWa = document.getElementById('btn-whatsapp-groupe');
    const count = document.getElementById('count-sel');
    const countWa = document.getElementById('count-sel-wa');
    
    if (selectedReceptionIds.size > 0) { 
        btn.style.display = 'block'; count.innerText = selectedReceptionIds.size;
        if(btnWa) { btnWa.style.display = 'block'; countWa.innerText = selectedReceptionIds.size; }
    } else { 
        btn.style.display = 'none'; 
        if(btnWa) btnWa.style.display = 'none';
    }
}

const modalBackdrop = document.getElementById('modal-backdrop');
function selectionnerClientViaData(encodedData) { selectionnerClient(JSON.parse(decodeURIComponent(encodedData))); }
function selectionnerClient(envoi) {
    currentEnvoi = envoi;
    if (modalBackdrop) modalBackdrop.style.display = 'flex';
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    set('client-selectionne', envoi.nom); set('ref-attendue', envoi.reference); set('desc-attendue', envoi.description);
    const tEl = document.getElementById('tel-attendu'); if (tEl) tEl.innerText = envoi.tel;
    set('qte-attendue', (envoi.quantiteEnvoyee || 0) + ' colis');
    const expEl = document.getElementById('expediteur-affiche'); if(expEl) expEl.innerText = envoi.expediteur || 'AMT TRANSIT CARGO';
    let isAir = (envoi.type || "").startsWith('aerien');
    set('poids-attendu', (isAir ? envoi.poidsEnvoye : envoi.volumeEnvoye) + (isAir ? ' Kg' : ' CBM'));
    let pB = parseInt((envoi.prixEstime || "0").replace(/\D/g, '')) || 0; let tot = pB + (envoi.fraisSupplementaires||0) - (envoi.remise || 0); let dej = parseInt(envoi.montantPaye) || 0; let res = tot - dej;
    set('prix-attendu', formatArgent(tot) + ' CFA');
    const elR = document.getElementById('prix-restant');
    if (elR) { if (res <= 0) { elR.innerText = "SOLDÉ (0 CFA)"; elR.style.color = "green"; document.getElementById('montant-paye').value = 0; } else { elR.innerText = formatArgent(res) + ' CFA'; elR.style.color = "#dc3545"; document.getElementById('montant-paye').value = res; } }
    const phDiv = document.getElementById('photos-recues-apercu');
    if (phDiv) {
        phDiv.innerHTML = '';
        if (envoi.photosURLs && envoi.photosURLs.length > 0) { document.getElementById('photos-recues-container').style.display = 'block'; envoi.photosURLs.forEach(u => { const i = document.createElement('img'); i.src = u; phDiv.appendChild(i); }); } else document.getElementById('photos-recues-container').style.display = 'none';
    }
    document.getElementById('quantite-recue').value = ''; document.getElementById('poids-recu').value = '';
    const lb = document.getElementById('label-poids-recu'); if (lb) lb.innerText = isAir ? "Poids Reçu (Kg)" : "Vol Reçu (CBM)";
    updateModalStatus(envoi);
    updateModalArriveButton();
}
function updateModalStatus(envoi) {
    const st = envoi.status || 'En attente';
    const el = document.getElementById('reception-status'); const sum = document.getElementById('reception-summary');
    if (el) { el.innerText = st; el.className = 'status-badge ' + (st.includes('Conforme') ? 'status-conforme' : st.includes('Ecart') ? 'status-ecart' : 'status-attente'); }
    if (sum) sum.innerHTML = `Reçu: <strong>${envoi.quantiteRecue || 0}</strong> | <strong>${envoi.poidsRecu || 0}</strong>`;
}

function updateModalArriveButton() {
    const btn = document.getElementById('btn-marquer-arrive');
    if(btn && currentEnvoi) {
        if(currentEnvoi.estArrive) {
            btn.innerHTML = "❌ Annuler Arrivée";
            btn.style.backgroundColor = "#6c757d";
        } else {
            btn.innerHTML = "🛬 Arrivé au Dépôt";
            btn.style.backgroundColor = "#17a2b8";
        }
    }
}

async function basculerStatutArrive() {
    if (!currentEnvoi) return;
    if(currentRole === 'spectateur') { alert("Action non autorisée."); return; }
    const newState = !currentEnvoi.estArrive;
    try {
        await db.collection('expeditions').doc(currentEnvoi.id).update({ estArrive: newState });
        currentEnvoi.estArrive = newState;
        updateModalArriveButton();
        chargerClients();
    } catch (e) { alert(e.message); }
}

function fermerModal(e) { if (e.target === modalBackdrop || e.target.classList.contains('modal-close') || e.target.classList.contains('btn-secondaire')) modalBackdrop.style.display = 'none'; }

async function enregistrerReception() {
    if (!currentEnvoi) return;
    if(currentRole === 'spectateur') { alert("Action non autorisée."); return; }
    const q = parseInt(document.getElementById('quantite-recue').value) || 0; const p = parseFloat(document.getElementById('poids-recu').value) || 0; const m = parseInt(document.getElementById('montant-paye').value) || 0; const via = document.getElementById('moyen-paiement').value;
    const nQ = (currentEnvoi.quantiteRecue || 0) + q; const nP = (currentEnvoi.poidsRecu || 0) + p; const nM = (currentEnvoi.montantPaye || 0) + m;
    let st = 'Reçu - Conforme';
    const diffQ = nQ - currentEnvoi.quantiteEnvoyee; const diffP = nP - ((currentEnvoi.type || "").startsWith('aerien') ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye);
    if (diffQ < 0) st = 'Reçu - Ecart'; else if (diffQ > 0) st = 'Reçu - Supérieur'; else { if (Math.abs(diffP) > 0.1) st = (diffP > 0 ? 'Reçu - Supérieur' : 'Reçu - Ecart'); else st = 'Reçu - Conforme'; }
    let agent = currentUser ? (currentRole === 'abidjan' ? "AGENCE ABIDJAN" : currentUser.email) : "Inconnu";
    let up = { quantiteRecue: nQ, poidsRecu: nP, montantPaye: nM, status: st, moyenPaiement: via, datePaiement: firebase.firestore.FieldValue.serverTimestamp() };
    if (m > 0) up.historiquePaiements = firebase.firestore.FieldValue.arrayUnion({ date: firebase.firestore.Timestamp.now(), montant: m, moyen: via, agent: agent });
    try { await db.collection('expeditions').doc(currentEnvoi.id).update(up); alert("Validé !"); modalBackdrop.style.display = 'none'; chargerClients(); } catch (e) { alert(e.message); }
}

const modalModifRec = document.getElementById('modal-modif-reception');
function ouvrirModalModifReception() {
    if (!currentEnvoi) return;
    if(modalModifRec) modalModifRec.style.display = 'flex';
    document.getElementById('modif-rec-qte').value = currentEnvoi.quantiteRecue || 0;
    document.getElementById('modif-rec-poids').value = currentEnvoi.poidsRecu || 0;
    document.getElementById('modif-rec-paye').value = currentEnvoi.montantPaye || 0;
}
function fermerModalModifReception() { if(modalModifRec) modalModifRec.style.display = 'none'; }
async function sauvegarderCorrectionReception() {
    if (!currentEnvoi) return; if(currentRole === 'spectateur') { alert("Action non autorisée."); return; }
    const nQ = parseInt(document.getElementById('modif-rec-qte').value) || 0; const nP = parseFloat(document.getElementById('modif-rec-poids').value) || 0; const nM = parseInt(document.getElementById('modif-rec-paye').value) || 0;
    
    // Récupérer les données fraîches pour comparer avec ce qui a été envoyé réellement
    let freshDoc;
    try { freshDoc = await db.collection('expeditions').doc(currentEnvoi.id).get(); } catch(e) { alert(e.message); return; }
    const freshData = freshDoc.data();

    let st = 'Reçu - Conforme'; 
    // On met à jour aussi les infos d'envoi pour que le prix (Compta) soit cohérent avec la correction
    let isAir = (freshData.type || "").startsWith('aerien'); 
    
    // Recalcul du prix basé sur le nouveau poids/volume
    let tarif = 0;
    if (freshData.type === 'aerien_normal') tarif = PRIX_AERIEN_NORMAL;
    else if (freshData.type === 'aerien_express') tarif = PRIX_AERIEN_EXPRESS;
    else if (freshData.type === 'maritime') tarif = PRIX_MARITIME_CBM;
    
    const nouveauPrix = Math.round(nP * tarif);
    
    const diffQ = nQ - (freshData.quantiteEnvoyee || 0); 

    if (diffQ < 0) st = 'Reçu - Ecart'; else if (diffQ > 0) st = 'Reçu - Supérieur'; else st = 'Reçu - Conforme';
    
    let updates = { 
        quantiteRecue: nQ, 
        poidsRecu: nP, 
        montantPaye: nM, 
        status: st,
        prixEstime: formatArgent(nouveauPrix) + ' CFA'
    };
    
    // LOGIQUE AUDIT : Détection changement de paiement (Correction manuelle)
    const ancienPaye = parseInt(freshData.montantPaye) || 0;
    if (ancienPaye !== nM) {
        updates.historiqueModifications = firebase.firestore.FieldValue.arrayUnion({
            date: new Date(),
            type: 'paiement',
            ancien: ancienPaye,
            nouveau: nM,
            auteur: currentUser ? currentUser.email : 'Système'
        });
    }

    // Mise à jour du poids/volume envoyé pour correspondre à la correction (la "vraie" valeur)
    if (isAir) updates.poidsEnvoye = nP; else updates.volumeEnvoye = nP;

    try { await db.collection('expeditions').doc(currentEnvoi.id).update(updates); alert("Correction effectuée !"); fermerModalModifReception(); document.getElementById('modal-backdrop').style.display = 'none'; chargerClients(); } catch (e) { alert("Erreur : " + e.message); }
}

const modalGroup = document.getElementById('modal-paiement-groupe');
function fermerModalPaiementGroupe() { if(modalGroup) modalGroup.style.display='none'; }
function ouvrirModalPaiementGroupe() {
    if (selectedReceptionIds.size === 0) return;
    let totalDette = 0;
    selectedReceptionIds.forEach(id => {
        const item = allReceptionData.find(d => d.id === id);
        if (item) {
            let pB = parseInt((item.prixEstime||"0").replace(/\D/g,''))||0;
            let net = pB + (item.fraisSupplementaires||0) - (item.remise||0);
            let deja = parseInt(item.montantPaye)||0;
            let reste = net - deja;
            if (reste > 0) totalDette += reste;
        }
    });
    document.getElementById('group-count').innerText = selectedReceptionIds.size;
    document.getElementById('group-total').innerText = formatArgent(totalDette) + " CFA";
    if(modalGroup) modalGroup.style.display = 'flex';
}
async function validerPaiementGroupe() {
    if (!confirm("Confirmez-vous le paiement TOTAL pour ces colis ?")) return; if(currentRole === 'spectateur') { alert("Action non autorisée."); return; }
    const moyen = document.getElementById('group-moyen').value; const batch = db.batch(); const agent = currentUser ? (currentRole === 'abidjan' ? "AGENCE ABIDJAN" : currentUser.email) : "Inconnu"; let count = 0;
    selectedReceptionIds.forEach(id => {
        const item = allReceptionData.find(d => d.id === id);
        if (item) {
            let pB = parseInt((item.prixEstime||"0").replace(/\D/g,''))||0; let net = pB + (item.fraisSupplementaires||0) - (item.remise||0); let deja = parseInt(item.montantPaye)||0; let reste = net - deja;
            if (reste > 0) { const ref = db.collection('expeditions').doc(id); let updates = { montantPaye: net, quantiteRecue: item.quantiteEnvoyee, status: 'Reçu - Conforme', datePaiement: firebase.firestore.FieldValue.serverTimestamp() }; updates.historiquePaiements = firebase.firestore.FieldValue.arrayUnion({ date: firebase.firestore.Timestamp.now(), montant: reste, moyen: moyen, agent: agent }); batch.update(ref, updates); count++; }
        }
    });
    try { await batch.commit(); alert(`${count} colis ont été soldés avec succès !`); fermerModalPaiementGroupe(); selectedReceptionIds.clear(); document.getElementById('check-all-rec').checked = false; updateBoutonGroupe(); chargerClients(); } catch (e) { alert("Erreur : " + e.message); }
}

const modalWa = document.getElementById('modal-whatsapp-groupe');
function fermerModalWhatsAppGroupe() { if(modalWa) modalWa.style.display='none'; }

function ouvrirModalWhatsAppGroupe() {
    if (selectedReceptionIds.size === 0) return;
    if(modalWa) modalWa.style.display = 'flex';
    genererListeWhatsApp();
}

function genererListeWhatsApp() {
    const container = document.getElementById('wa-clients-list');
    const template = document.getElementById('wa-message-template').value;
    container.innerHTML = '';
    
    selectedReceptionIds.forEach(id => {
        const item = allReceptionData.find(d => d.id === id);
        if (item) {
            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee; background:white; margin-bottom:5px; border-radius:4px;";
            
            let pB = parseInt((item.prixEstime||"0").replace(/\D/g,''))||0;
            let net = pB + (item.fraisSupplementaires||0) - (item.remise||0);
            let reste = net - (parseInt(item.montantPaye)||0);

            let blInfo = item.numBL ? `BL: ${item.numBL}. ` : "";
            let msg = template
                .replace(/{nom}/g, `${item.prenom} ${item.nom}`)
                .replace(/{ref}/g, item.reference)
                .replace(/{colis}/g, item.description)
                .replace(/{reste}/g, formatArgent(reste))
                .replace(/{bl}/g, blInfo);
            
            const encodedMsg = encodeURIComponent(msg);
            let tel = (item.tel || "").replace(/[^0-9]/g, ''); 
            
            row.innerHTML = `<div style="flex:1"><strong>${item.nom}</strong> <span style="color:#666; font-size:0.9em;">(${item.tel})</span></div><a href="https://wa.me/${tel}?text=${encodedMsg}" target="_blank" class="btn-secondaire btn-small" style="background-color:#25D366; color:white; text-decoration:none; width:auto; display:inline-flex; align-items:center; gap:5px;"><i class="fab fa-whatsapp"></i> Envoyer</a>`;
            container.appendChild(row);
        }
    });
}

function envoyerWhatsAppIndividuel() {
    if(!currentEnvoi) return;
    let tel = (currentEnvoi.tel || "").replace(/[^0-9]/g, '');
    if(!tel) { alert("Numéro de téléphone invalide."); return; }
    
    let pB = parseInt((currentEnvoi.prixEstime||"0").replace(/\D/g,''))||0;
    let net = pB + (currentEnvoi.fraisSupplementaires||0) - (currentEnvoi.remise||0);
    let reste = net - (parseInt(currentEnvoi.montantPaye)||0);
    
    let blInfo = currentEnvoi.numBL ? ` BL: ${currentEnvoi.numBL}.` : "";
    let msg = `Bonjour ${currentEnvoi.prenom} ${currentEnvoi.nom}, votre colis ${currentEnvoi.reference} (${currentEnvoi.description}) est arrivé à l'agence AMT Abidjan.${blInfo} Reste à payer: ${formatArgent(reste)} CFA. Merci de passer le récupérer.`;
    
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}
