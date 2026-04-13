// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\comptabilite.js

document.addEventListener('DOMContentLoaded', () => {
    ouvrirSousOngletCompta('maritime');
});

function ouvrirSousOngletCompta(type) {
    currentComptaType = type;
    document.querySelectorAll('.sub-nav-link').forEach(btn => { btn.classList.remove('active'); if (btn.textContent.toLowerCase().includes(type)) btn.classList.add('active'); });
    chargerCompta(type);
}

async function chargerCompta(type) {
    const tbody = document.getElementById('tbody-compta'); if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10">Chargement...</td></tr>';
    try {
        const snapE = await db.collection('expeditions').get(); const snapS = await db.collection('depenses').orderBy('date', 'desc').get();
        let items = [];
        snapE.forEach(d => {
            const data = d.data(); let match = false;
            if (type === 'maritime' && data.type === 'maritime') match = true; if (type === 'aerien' && (data.type || "").startsWith('aerien')) match = true;
            if (match) {
                let dRef = data.datePaiement ? data.datePaiement.toDate() : new Date(data.date); let grp = data.refGroupe || "ZZZ";
                if (grp === "ZZZ" && data.reference) { let pts = data.reference.split('-'); if (pts.length > 0 && pts[pts.length - 1].startsWith('EV')) grp = pts[pts.length - 1]; }
                items.push({ ...data, id: d.id, isDep: false, sortDate: dRef, grp: grp, sortRef: data.reference || "ZZZ", hist: data.historiquePaiements || [] });
            }
        });
        snapS.forEach(d => { const data = d.data(); if (data.type === type && !data.deleted) { let g = (data.refGroupe && data.refGroupe.trim()) ? data.refGroupe.toUpperCase() : "ZZZ_GEN"; items.push({ ...data, id: d.id, isDep: true, sortDate: new Date(data.date), grp: g, sortRef: "DEPENSE" }); } });
        items.sort((a, b) => { if (a.grp.startsWith('EV') && b.grp.startsWith('EV')) { const numA = parseInt(a.grp.replace('EV', '')) || 0; const numB = parseInt(b.grp.replace('EV', '')) || 0; return numB - numA; } return a.grp.localeCompare(b.grp); });
        let cred = 0, caisse = 0, bonus = 0; let modes = { Esp: 0, Chq: 0, OM: 0, Wav: 0, CB: 0 }, outM = { Esp: 0, Chq: 0, OM: 0, Wav: 0, CB: 0 };
        let curGrp = null, grpDu = 0, grpReste = 0, grpEntree = 0, grpSortie = 0; let GT_Q = 0, GT_V = 0; let html = '';
        items.forEach((it, idx) => {
            if (curGrp !== null && it.grp !== curGrp && !curGrp.startsWith('ZZZ')) {
                let benef = grpEntree - grpSortie; let colorBenef = benef >= 0 ? '#76ff03' : '#ff5252';
            html += `<tr class="group-summary-row"><td colspan="5">TOTAL ${curGrp}</td><td style="white-space:nowrap;">${formatArgent(grpDu)}</td><td style="white-space:nowrap;">${formatArgent(grpReste)}</td><td style="white-space:nowrap;">${formatArgent(grpEntree)}</td><td style="white-space:nowrap;">${formatArgent(grpSortie)}</td><td style="color:${colorBenef}; font-weight:bold; white-space:nowrap;">${formatArgent(benef)}</td> </tr>`;
                grpDu = 0; grpReste = 0; grpEntree = 0; grpSortie = 0;
            }
            curGrp = it.grp;
            let dS = it.sortDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); let rowClass = `row-month-${it.sortDate.getMonth()}`;
            if (it.isDep) {
                let m = parseFloat(it.montant) || 0; caisse -= m; grpSortie += m; let v = it.moyenPaiement || 'Espèce';
                if (v.includes('Chèque')) outM.Chq += m; else if (v.includes('OM')) outM.OM += m; else if (v.includes('Wave')) outM.Wav += m; else if (v.includes('CB')) outM.CB += m; else outM.Esp += m;
                const btnSuppr = (currentRole === 'spectateur') ? '' : `<button class="btn-suppr-small" onclick="supprimerDepense('${it.id}')">X</button>`;
            html += `<tr class="${rowClass}"><td>${dS}</td><td>-</td><td>-</td><td>${it.motif}</td><td>Dépense</td><td>-</td><td>-</td><td>-</td><td class="text-red" style="white-space:nowrap;">${formatArgent(m)}</td><td>${btnSuppr}</td></tr>`;
            } else {
                GT_Q += parseInt(it.quantiteEnvoyee)||0; GT_V += parseFloat(type.startsWith('aerien')?it.poidsEnvoye:it.volumeEnvoye)||0;
                let pB = parseInt((it.prixEstime || "0").replace(/\D/g, '')) || 0; let du = pB + (it.fraisSupplementaires||0) - (it.remise || 0); let paye = 0;
                if (it.hist.length > 0) { it.hist.forEach(h => { if(h.deleted) return; let m = parseFloat(h.montant) || 0; paye += m; let t = h.moyen || 'Espèce'; if (t.includes('Chèque')) modes.Chq += m; else if (t.includes('OM')) modes.OM += m; else if (t.includes('Wave')) modes.Wav += m; else if (t.includes('CB')) modes.CB += m; else modes.Esp += m; }); } else { paye = it.montantPaye || 0; modes.Esp += paye; }
                let r = du - paye; caisse += paye; if (r > 0) cred += r; let diff = paye - du; if (diff > 0) bonus += diff; else if (diff < 0 && Math.abs(diff) < 500) bonus += diff;
                grpDu += du; grpReste += (r > 0 ? r : 0); grpEntree += paye;
                let recuIcon = (it.quantiteRecue > 0 || it.estArrive) ? '<i class="fas fa-check-circle" style="color:#27ae60; margin-left:5px;" title="Reçu / Arrivé"></i>' : '';
            html += `<tr class="${rowClass} interactive-table-row" onclick='voirHistoriquePaiementViaData("${encodeURIComponent(JSON.stringify({ id: it.id, nom: it.nom, reference: it.reference, history: it.hist }))}")'><td>${dS}</td><td>${it.reference}${recuIcon}</td><td>${it.numBL || '-'}</td><td>${it.description}</td><td>${it.nom} ${it.prenom}</td><td style="white-space:nowrap;">${formatArgent(du)}</td><td style="color:${r > 0 ? 'red' : 'green'}; white-space:nowrap;">${formatArgent(r)}</td><td class="text-green" style="white-space:nowrap;">${formatArgent(paye)}</td><td>-</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
        });
    if (curGrp && !curGrp.startsWith('ZZZ')) { let benef = grpEntree - grpSortie; let colorBenef = benef >= 0 ? '#76ff03' : '#ff5252'; html += `<tr class="group-summary-row"><td colspan="5">TOTAL ${curGrp}</td><td style="white-space:nowrap;">${formatArgent(grpDu)}</td><td style="white-space:nowrap;">${formatArgent(grpReste)}</td><td style="white-space:nowrap;">${formatArgent(grpEntree)}</td><td style="white-space:nowrap;">${formatArgent(grpSortie)}</td><td style="color:${colorBenef}; font-weight:bold; white-space:nowrap;">${formatArgent(benef)}</td> </tr>`; }
        tbody.innerHTML = html;
        let u = type==='aerien'?'Kg':'CBM'; const footerRow = document.createElement('tr'); footerRow.style.cssText = "background-color:#000; color:cyan; font-weight:bold; font-size:1.1em; text-align:center;"; footerRow.innerHTML = `<td colspan="10">GRAND TOTAL (Tous Groupes) : ${GT_Q} Colis  |  ${GT_V.toFixed(2)} ${u}</td>`; tbody.appendChild(footerRow);
        document.getElementById('total-credit').innerText = formatArgent(cred) + ' CFA'; const elC = document.getElementById('total-caisse'); elC.innerText = formatArgent(caisse) + ' CFA'; elC.className = caisse >= 0 ? 'text-green' : 'text-red'; document.getElementById('total-bonus').innerText = formatArgent(bonus) + ' CFA';
        document.getElementById('pay-espece-in').innerText = formatArgent(modes.Esp); document.getElementById('pay-espece-out').innerText = formatArgent(outM.Esp); document.getElementById('pay-cheque-in').innerText = formatArgent(modes.Chq); document.getElementById('pay-cheque-out').innerText = formatArgent(outM.Chq); document.getElementById('pay-om-in').innerText = formatArgent(modes.OM); document.getElementById('pay-om-out').innerText = formatArgent(outM.OM); document.getElementById('pay-wave-in').innerText = formatArgent(modes.Wav); document.getElementById('pay-wave-out').innerText = formatArgent(outM.Wav); document.getElementById('pay-cb-in').innerText = formatArgent(modes.CB); document.getElementById('pay-cb-out').innerText = formatArgent(outM.CB);
        let tIn = Object.values(modes).reduce((a, b) => a + b, 0); let tOut = Object.values(outM).reduce((a, b) => a + b, 0); document.getElementById('pay-total-in').innerText = formatArgent(tIn); document.getElementById('pay-total-out').innerText = formatArgent(tOut);
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="10">Erreur chargement.</td></tr>'; }
}

function voirHistoriquePaiementViaData(enc) { voirHistoriquePaiement(JSON.parse(decodeURIComponent(enc))); }
const modalHist = document.getElementById('modal-historique');
function voirHistoriquePaiement(item) {
    if (item.isDepense) return;
    currentIdPaiementOpen = item.id;
    modalHist.style.display = 'flex';
    document.getElementById('hist-client-nom').innerText = item.nom;
    const refEl = document.getElementById('hist-ref'); if(refEl) refEl.innerText = item.reference;
    const tb = document.getElementById('tbody-historique'); 
    let html = '';
    if (item.history && item.history.length > 0) {
        item.history.forEach((h, index) => {
            let d = new Date(h.date.seconds * 1000).toLocaleDateString('fr-FR');
            if (h.deleted) {
                html += `<tr style="background:#f9f9f9; color:#aaa; text-decoration:line-through;"><td>${d}</td><td style="white-space:nowrap;">${formatArgent(parseInt(h.montant))} CFA</td><td>${h.moyen}</td><td>${h.agent || '-'}</td><td>Annulé</td></tr>`;
            } else {
                let btnSuppr = '';
                if (currentRole !== 'spectateur') { btnSuppr = `<button class="btn-suppr-small" onclick="supprimerPaiement(${index})" style="background-color: #c0392b; color: white; border: none; border-radius: 3px; cursor: pointer;">X</button>`; }
                html += `<tr><td>${d}</td><td class="text-green" style="white-space:nowrap;">${formatArgent(parseInt(h.montant))} CFA</td><td>${h.moyen}</td><td>${h.agent || '-'}</td><td>${btnSuppr}</td></tr>`;
            }
        });
    } else { html = '<tr><td colspan="5" style="text-align:center">Aucun historique de paiement.</td></tr>'; }
    tb.innerHTML = html;
}
async function supprimerPaiement(index) {
    if (!currentIdPaiementOpen) return;
    if (!confirm("⚠️ Êtes-vous sûr de vouloir ANNULER ce paiement ?\nLe montant sera déduit du total payé.")) return;
    try {
        const docRef = db.collection('expeditions').doc(currentIdPaiementOpen); const docSnap = await docRef.get();
        if (!docSnap.exists) { alert("Erreur: Document introuvable"); return; }
        const data = docSnap.data(); let historique = data.historiquePaiements || [];
        if (index < 0 || index >= historique.length || historique[index].deleted) return;
        
        historique[index].deleted = true;
        historique[index].dateSuppression = new Date();
        historique[index].agentSuppression = currentUser ? currentUser.email : 'Inconnu';
        
        // Recalcul du montant total payé basé sur l'historique restant pour éviter les erreurs de synchro
        let nouveauMontantPaye = 0;
        historique.forEach(h => { if(!h.deleted) nouveauMontantPaye += (parseInt(h.montant) || 0); });

        await docRef.update({ historiquePaiements: historique, montantPaye: nouveauMontantPaye });
        alert("Paiement annulé avec succès."); modalHist.style.display = 'none'; chargerCompta(currentComptaType); if(typeof chargerClients === 'function') chargerClients();
    } catch (e) { console.error(e); alert("Erreur lors de l'annulation : " + e.message); }
}
function fermerModalHistorique(e) { if (e.target === modalHist || e.target.classList.contains('modal-close') || e.target.classList.contains('btn-secondaire')) modalHist.style.display = 'none'; }

const modalDepense = document.getElementById('modal-depense');
function ouvrirModalDepense() { 
    const selectType = document.getElementById('depense-type');
    if (selectType && currentComptaType) selectType.value = currentComptaType;
    if(modalDepense) modalDepense.style.display = 'flex'; 
}
function fermerModalDepense(e) { if (e.target === modalDepense || e.target.classList.contains('modal-close')) modalDepense.style.display = 'none'; }
async function enregistrerDepense() {
    const d = document.getElementById('depense-date').value; const mt = document.getElementById('depense-motif').value; const m = parseFloat(document.getElementById('depense-montant').value) || 0; const grp = document.getElementById('depense-groupe').value.toUpperCase().trim();
    if (!d || !mt || m <= 0) { alert('Erreur saisie.'); return; }
    try { await db.collection('depenses').add({ date: d, type: document.getElementById('depense-type').value, refGroupe: grp, motif: mt, montant: m, moyenPaiement: document.getElementById('depense-moyen').value, creeLe: firebase.firestore.FieldValue.serverTimestamp() }); alert('OK'); modalDepense.style.display = 'none'; document.getElementById('form-depense').reset(); chargerCompta(currentComptaType); } catch (e) { alert(e.message); }
}
async function supprimerDepense(id) { if (confirm('Supprimer ?')) { await db.collection('depenses').doc(id).update({ deleted: true }); chargerCompta(currentComptaType); } }
