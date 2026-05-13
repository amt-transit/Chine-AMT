// =======================================================
// DEMARCHEURS.JS — Système de commissions AMT
// =======================================================

// ---- État global ----
let tousLesDemarcheurs = [];
let parametresCommissions = { tauxAMT: 0.50, tauxDemarcheur: 0.50, tauxBonusParrainage: 0.10 };
let demarcheurRetraitCourant = null;

// ====================================================
// INITIALISATION
// ====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await chargerParametres();
    await chargerDemarcheurs();
    mettreAJourPreview();

    // Afficher bouton + onglet paramètres uniquement pour superadmin
    auth.onAuthStateChanged(user => {
        if (!user) return;
        if (user.email === 'admin@amt.com') {
            const btnTab = document.getElementById('btn-tab-params');
            if (btnTab) btnTab.style.display = 'inline-flex';
            const btnNouveau = document.getElementById('btn-nouveau-demarcheur');
            if (btnNouveau) btnNouveau.style.display = 'inline-flex';
        }
    });
});

// ====================================================
// NAVIGATION ONGLETS
// ====================================================
function ouvrirOnglet(nom) {
    ['reseau', 'commissions', 'retraits', 'parametres'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.sub-nav-link').forEach(b => b.classList.remove('active'));
    const target = document.getElementById('tab-' + nom);
    if (target) target.style.display = 'block';
    event.target.classList.add('active');

    if (nom === 'commissions') chargerCommissions();
    if (nom === 'retraits') chargerTousRetraits();
}

// ====================================================
// PARAMÈTRES — Chargement & Sauvegarde
// ====================================================
async function chargerParametres() {
    try {
        const doc = await db.collection('parametres').doc('commissions').get();
        if (doc.exists) {
            parametresCommissions = doc.data();
            document.getElementById('param-taux-amt').value = Math.round(parametresCommissions.tauxAMT * 100);
            document.getElementById('param-taux-dem').value = Math.round(parametresCommissions.tauxDemarcheur * 100);
            document.getElementById('param-taux-parrainage').value = Math.round(parametresCommissions.tauxBonusParrainage * 100);
        }
    } catch (e) {
        console.warn('Paramètres non trouvés, utilisation des valeurs par défaut');
    }
}

async function sauvegarderParametres() {
    const tAMT = parseInt(document.getElementById('param-taux-amt').value) / 100;
    const tDem = parseInt(document.getElementById('param-taux-dem').value) / 100;
    const tPar = parseInt(document.getElementById('param-taux-parrainage').value) / 100;

    if (Math.round((tAMT + tDem) * 100) !== 100) {
        await showCustomAlert('❌ La somme des taux AMT + Démarcheur doit faire 100%.', 'error');
        return;
    }

    await db.collection('parametres').doc('commissions').set({
        tauxAMT: tAMT,
        tauxDemarcheur: tDem,
        tauxBonusParrainage: tPar,
        derniereMaj: firebase.firestore.FieldValue.serverTimestamp(),
        majPar: currentUser ? currentUser.email : 'admin'
    });
    parametresCommissions = { tauxAMT: tAMT, tauxDemarcheur: tDem, tauxBonusParrainage: tPar };
    await showCustomAlert('✅ Paramètres enregistrés avec succès !', 'success');
}

function syncTaux(modifie) {
    const vAMT = parseInt(document.getElementById('param-taux-amt').value) || 0;
    const vDem = parseInt(document.getElementById('param-taux-dem').value) || 0;
    if (modifie === 'amt') document.getElementById('param-taux-dem').value = 100 - vAMT;
    if (modifie === 'dem') document.getElementById('param-taux-amt').value = 100 - vDem;
    mettreAJourPreview();
}

function mettreAJourPreview() {
    const tAMT = parseInt(document.getElementById('param-taux-amt').value) || 50;
    const tDem = parseInt(document.getElementById('param-taux-dem').value) || 50;
    const tPar = parseInt(document.getElementById('param-taux-parrainage').value) || 10;
    const brut = 100000;
    const partDem = brut * tDem / 100;
    const partAMT = brut * tAMT / 100;
    const bonusParrain = partDem * tPar / 100;
    const netFilleul = partDem - bonusParrain;
    const el = document.getElementById('preview-content');
    if (!el) return;
    el.innerHTML = `
      <div style="font-size:13px; line-height:2;">
        <div>💰 Bénéfice brut : <strong>${formatArgent(brut)} CFA</strong></div>
        <div>🏢 Part AMT (${tAMT}%) : <strong>${formatArgent(partAMT)} CFA</strong></div>
        <div>👤 Part démarcheur (${tDem}%) : <strong>${formatArgent(partDem)} CFA</strong></div>
        <hr style="border:none; border-top:1px dashed #ccc; margin:6px 0;"/>
        <div>Si parrainage actif :</div>
        <div style="padding-left:16px;">↳ Filleul reçoit : <strong>${formatArgent(netFilleul)} CFA</strong> (${tDem - tDem*tPar/100}%)</div>
        <div style="padding-left:16px;">↳ Parrain reçoit en bonus : <strong>${formatArgent(bonusParrain)} CFA</strong> (${tPar}% des gains filleul)</div>
      </div>`;
}

// ====================================================
// DÉMARCHEURS — CRUD
// ====================================================
async function chargerDemarcheurs() {
    try {
        const snap = await db.collection('demarcheurs').orderBy('dateInscription', 'asc').get();
        tousLesDemarcheurs = [];
        snap.forEach(d => tousLesDemarcheurs.push({ id: d.id, ...d.data() }));
        afficherReseau();
        remplirSelectsDemarcheurs();
    } catch (e) {
        console.error(e);
        document.getElementById('liste-demarcheurs').innerHTML = '<p style="color:red;">Erreur de chargement.</p>';
    }
}

function afficherReseau() {
    const container = document.getElementById('liste-demarcheurs');
    if (!container) return;
    if (tousLesDemarcheurs.length === 0) {
        container.innerHTML = '<div class="card" style="text-align:center; color:#888;"><i class="fas fa-users" style="font-size:2rem; margin-bottom:10px; display:block;"></i>Aucun démarcheur enregistré.</div>';
        return;
    }

    // Grouper par parrain
    const parrains = tousLesDemarcheurs.filter(d => !d.parrainId);
    let html = '';
    parrains.forEach(p => {
        const filleuls = tousLesDemarcheurs.filter(d => d.parrainId === p.id);
        html += carteReseau(p, false);
        filleuls.forEach(f => {
            html += carteReseau(f, true);
        });
    });
    // Démarcheurs sans parrain connu mais qui en ont un inconnu
    const orphelins = tousLesDemarcheurs.filter(d => d.parrainId && !tousLesDemarcheurs.find(p => p.id === d.parrainId));
    orphelins.forEach(o => { html += carteReseau(o, true); });
    container.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">${html}</div>`;
}

function carteReseau(d, estFilleul) {
    const filleuls = tousLesDemarcheurs.filter(f => f.parrainId === d.id);
    const parrain = d.parrainId ? tousLesDemarcheurs.find(p => p.id === d.parrainId) : null;
    const isAdmin = currentRole === 'superadmin';
    const solde = (d.soldeDisponible || 0);
    const soldeColor = solde > 0 ? '#27ae60' : '#888';
    const indent = estFilleul ? 'margin-left:32px; border-left:3px solid #e0e0e0; padding-left:16px;' : '';

    return `
    <div class="card" style="${indent} padding:12px 16px; margin-bottom: 8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:40px; height:40px; border-radius:50%; background:${estFilleul ? '#e8f5e9' : '#e3f2fd'}; display:flex; align-items:center; justify-content:center; font-weight:700; color:${estFilleul ? '#2e7d32' : '#1565c0'}; font-size:15px;">
            ${(d.nom[0] || '?').toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600; font-size:15px;">${d.prenom} ${d.nom}</div>
            <div style="font-size:12px; color:#777;">
              ${estFilleul ? '<i class="fas fa-level-up-alt"></i> Filleul de ' + (parrain ? parrain.prenom + ' ' + parrain.nom : '?') + ' &nbsp;|&nbsp; ' : ''}
              <i class="fas fa-phone"></i> ${d.telephone || '-'} &nbsp;|&nbsp;
              <i class="fas fa-sync-alt"></i> ${d.periodeRetrait || 'mensuel'}
              ${filleuls.length > 0 ? ' &nbsp;|&nbsp; <i class="fas fa-users"></i> ' + filleuls.length + ' filleul(s)' : ''}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="text-align:right;">
            <div style="font-size:12px; color:#888;">Solde disponible</div>
            <div style="font-weight:700; color:${soldeColor}; font-size:15px;">${formatArgent(solde)} CFA</div>
          </div>
          ${isAdmin ? `<button class="btn-edit-small" onclick="editerDemarcheur('${d.id}')"><i class="fas fa-edit"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

function remplirSelectsDemarcheurs() {
    ['select-demarcheur-retrait', 'filtre-demarcheur-commi', 'dem-parrain'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const firstOpt = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(firstOpt);
        tousLesDemarcheurs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.prenom + ' ' + d.nom;
            sel.appendChild(opt);
        });
    });
}

// ---- Formulaire nouveau/édition ----
function ouvrirModalDemarcheur(id = null) {
    document.getElementById('dem-id').value = id || '';
    document.getElementById('dem-nom').value = '';
    document.getElementById('dem-prenom').value = '';
    document.getElementById('dem-telephone').value = '';
    document.getElementById('dem-email').value = '';
    document.getElementById('dem-parrain').value = '';
    document.getElementById('dem-periode').value = 'mensuel';
    document.getElementById('modal-dem-titre').textContent = id ? 'Modifier le démarcheur' : 'Nouveau démarcheur';
    if (id) {
        const d = tousLesDemarcheurs.find(x => x.id === id);
        if (d) {
            document.getElementById('dem-nom').value = d.nom || '';
            document.getElementById('dem-prenom').value = d.prenom || '';
            document.getElementById('dem-telephone').value = d.telephone || '';
            document.getElementById('dem-email').value = d.email || '';
            document.getElementById('dem-parrain').value = d.parrainId || '';
            document.getElementById('dem-periode').value = d.periodeRetrait || 'mensuel';
        }
    }
    remplirSelectsDemarcheurs();
    document.getElementById('modal-demarcheur').style.display = 'flex';
}

function editerDemarcheur(id) { ouvrirModalDemarcheur(id); }

async function sauvegarderDemarcheur() {
    const id = document.getElementById('dem-id').value;
    const nom = document.getElementById('dem-nom').value.trim();
    const prenom = document.getElementById('dem-prenom').value.trim();
    const telephone = document.getElementById('dem-telephone').value.trim();
    const email = document.getElementById('dem-email').value.trim();
    const parrainId = document.getElementById('dem-parrain').value || null;
    const periodeRetrait = document.getElementById('dem-periode').value;

    if (!nom || !prenom) { await showCustomAlert('Nom et prénom sont obligatoires.', 'error'); return; }

    const data = { nom, prenom, telephone, email, parrainId, periodeRetrait };

    if (id) {
        await db.collection('demarcheurs').doc(id).update(data);
    } else {
        data.dateInscription = firebase.firestore.FieldValue.serverTimestamp();
        data.totalGagne = 0;
        data.totalRetire = 0;
        data.soldeDisponible = 0;
        data.statut = 'actif';
        await db.collection('demarcheurs').add(data);
    }
    fermerModal('modal-demarcheur');
    await chargerDemarcheurs();
    await showCustomAlert('✅ Démarcheur enregistré !', 'success');
}

// ====================================================
// COMMISSIONS — Calcul & Affichage
// ====================================================
async function chargerCommissions() {
    const filtreId = document.getElementById('filtre-demarcheur-commi').value;
    const tbody = document.getElementById('tbody-commissions');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">Chargement...</td></tr>';

    try {
        let query = db.collection('commissions').orderBy('dateCreation', 'desc');
        if (filtreId) query = query.where('demarcheurId', '==', filtreId);
        const snap = await query.get();

        let totalGenere = 0, totalAMT = 0, totalDem = 0, totalBonus = 0;
        let html = '';

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#888;">Aucune commission enregistrée.</td></tr>';
        } else {
            snap.forEach(d => {
                const c = d.data();
                const dem = tousLesDemarcheurs.find(x => x.id === c.demarcheurId);
                const nomDem = dem ? dem.prenom + ' ' + dem.nom : c.demarcheurId;
                const date = c.dateCreation ? c.dateCreation.toDate().toLocaleDateString('fr-FR') : '-';
                const typeBadge = c.type === 'parrainage'
                    ? '<span style="background:#fff3e0; color:#e65100; padding:2px 8px; border-radius:20px; font-size:11px;">Parrainage</span>'
                    : '<span style="background:#e3f2fd; color:#1565c0; padding:2px 8px; border-radius:20px; font-size:11px;">Direct</span>';
                const statutBadge = c.statut === 'retire'
                    ? '<span style="color:#27ae60;">✓ Retiré</span>'
                    : '<span style="color:#F5A623;">En attente</span>';

                totalGenere += c.montantBrut || 0;
                totalAMT += c.montantAMT || 0;
                totalDem += c.montantDemarcheur || 0;
                totalBonus += c.bonusParrainage || 0;

                html += `<tr>
                  <td data-label="Date">${date}</td>
                  <td data-label="Démarcheur">${nomDem}</td>
                  <td data-label="Type">${typeBadge}</td>
                  <td data-label="Bénéfice CBM" style="white-space:nowrap;">${formatArgent(c.montantBrut || 0)} CFA</td>
                  <td data-label="Part (50%)" style="white-space:nowrap; color:#1565c0;">${formatArgent(c.montantDemarcheur || 0)} CFA</td>
                  <td data-label="Bonus parrain" style="white-space:nowrap; color:#e65100;">${formatArgent(c.bonusParrainage || 0)} CFA</td>
                  <td data-label="Net démarcheur" style="white-space:nowrap; font-weight:600; color:#27ae60;">${formatArgent((c.montantDemarcheur || 0) - (c.bonusParrainage || 0))} CFA</td>
                  <td data-label="Part AMT" style="white-space:nowrap;">${formatArgent(c.montantAMT || 0)} CFA</td>
                  <td data-label="Statut">${statutBadge}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        document.getElementById('stat-total-genere').textContent = formatArgent(totalGenere) + ' CFA';
        document.getElementById('stat-part-amt').textContent = formatArgent(totalAMT) + ' CFA';
        document.getElementById('stat-part-demarcheurs').textContent = formatArgent(totalDem) + ' CFA';
        document.getElementById('stat-bonus-parrainage').textContent = formatArgent(totalBonus) + ' CFA';
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="9" style="color:red; padding:20px;">Erreur.</td></tr>';
    }
}

// ====================================================
// FONCTION PRINCIPALE — Créer les commissions
// appelée lors de la réception confirmée d'un envoi
// ====================================================
async function creerCommissionPourExpedition(expeditionId, benéficeBrut, demarcheurId) {
    if (!demarcheurId || benéficeBrut <= 0) return;
    const dem = tousLesDemarcheurs.find(d => d.id === demarcheurId);
    if (!dem) return;

    const tAMT = parametresCommissions.tauxAMT || 0.50;
    const tDem = parametresCommissions.tauxDemarcheur || 0.50;
    const tPar = parametresCommissions.tauxBonusParrainage || 0.10;

    const partDemarcheurBrute = benéficeBrut * tDem;
    const partAMT = benéficeBrut * tAMT;
    const bonusParrainage = dem.parrainId ? partDemarcheurBrute * tPar : 0;
    const partDemarcheurNette = partDemarcheurBrute - bonusParrainage;

    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    // Commission du démarcheur direct
    const refComDirect = db.collection('commissions').doc();
    batch.set(refComDirect, {
        expeditionId,
        demarcheurId,
        type: 'direct',
        montantBrut: benéficeBrut,
        tauxDemarcheur: tDem,
        montantDemarcheur: partDemarcheurBrute,
        tauxAMT: tAMT,
        montantAMT: partAMT,
        bonusParrainage: bonusParrainage, // montant cédé au parrain
        montantNet: partDemarcheurNette,
        dateCreation: now,
        statut: 'en_attente'
    });

    // Mise à jour solde du démarcheur
    const refDem = db.collection('demarcheurs').doc(demarcheurId);
    batch.update(refDem, {
        totalGagne: firebase.firestore.FieldValue.increment(partDemarcheurNette),
        soldeDisponible: firebase.firestore.FieldValue.increment(partDemarcheurNette)
    });

    // Si parrain : créer sa commission de parrainage
    if (dem.parrainId && bonusParrainage > 0) {
        const refComParrain = db.collection('commissions').doc();
        batch.set(refComParrain, {
            expeditionId,
            demarcheurId: dem.parrainId,
            type: 'parrainage',
            filleulId: demarcheurId,
            montantBrut: benéficeBrut,
            tauxDemarcheur: tPar,
            montantDemarcheur: 0,
            tauxAMT: tAMT,
            montantAMT: 0,
            bonusParrainage: bonusParrainage,
            montantNet: bonusParrainage,
            dateCreation: now,
            statut: 'en_attente'
        });
        const refParrain = db.collection('demarcheurs').doc(dem.parrainId);
        batch.update(refParrain, {
            totalGagne: firebase.firestore.FieldValue.increment(bonusParrainage),
            soldeDisponible: firebase.firestore.FieldValue.increment(bonusParrainage)
        });
    }

    await batch.commit();
    console.log(`✅ Commission créée pour expédition ${expeditionId}`);
}

// ====================================================
// RETRAITS
// ====================================================
async function chargerSoldeDemarcheur() {
    const id = document.getElementById('select-demarcheur-retrait').value;
    const bloc = document.getElementById('bloc-solde');
    if (!id) { bloc.style.display = 'none'; return; }
    const dem = tousLesDemarcheurs.find(d => d.id === id);
    if (!dem) return;

    demarcheurRetraitCourant = dem;
    document.getElementById('rd-total-gagne').textContent = formatArgent(dem.totalGagne || 0) + ' CFA';
    document.getElementById('rd-total-retire').textContent = formatArgent(dem.totalRetire || 0) + ' CFA';
    document.getElementById('rd-solde').textContent = formatArgent(dem.soldeDisponible || 0) + ' CFA';
    document.getElementById('rd-periode').textContent = dem.periodeRetrait || 'mensuel';
    bloc.style.display = 'block';

    // Charger les retraits de ce démarcheur
    await chargerRetraitsDemarcheur(id);
}

async function chargerRetraitsDemarcheur(id) {
    const tbody = document.getElementById('tbody-retraits');
    if (!tbody) return;
    const snap = await db.collection('retraits').where('demarcheurId', '==', id).orderBy('dateRetrait', 'desc').get();
    if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">Aucun retrait effectué.</td></tr>';
        return;
    }
    let html = '';
    snap.forEach(d => {
        const r = d.data();
        const date = r.dateRetrait ? r.dateRetrait.toDate().toLocaleDateString('fr-FR') : '-';
        const dem = tousLesDemarcheurs.find(x => x.id === r.demarcheurId);
        const nomDem = dem ? dem.prenom + ' ' + dem.nom : r.demarcheurId;
        html += `<tr>
          <td>${date}</td>
          <td>${nomDem}</td>
          <td class="text-green" style="font-weight:600;">${formatArgent(r.montant || 0)} CFA</td>
          <td>${r.periode || '-'}</td>
          <td>${r.moyenPaiement || '-'}</td>
          <td>${r.validePar || '-'}</td>
          <td><span style="color:#27ae60;">✓ Payé</span></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function chargerTousRetraits() {
    // Pré-remplir le select
    remplirSelectsDemarcheurs();
}

function validerRetrait() {
    if (!demarcheurRetraitCourant) return;
    const solde = demarcheurRetraitCourant.soldeDisponible || 0;
    document.getElementById('retrait-dem-nom').textContent = demarcheurRetraitCourant.prenom + ' ' + demarcheurRetraitCourant.nom;
    document.getElementById('retrait-solde-info').textContent = 'Solde disponible : ' + formatArgent(solde) + ' CFA';
    document.getElementById('retrait-montant').value = '';
    document.getElementById('retrait-periode').value = '';
    document.getElementById('modal-retrait').style.display = 'flex';
}

async function confirmerRetrait() {
    const montant = parseFloat(document.getElementById('retrait-montant').value);
    const periode = document.getElementById('retrait-periode').value.trim();
    const moyen = document.getElementById('retrait-moyen').value;
    const dem = demarcheurRetraitCourant;

    if (!montant || montant <= 0) { await showCustomAlert('Montant invalide.', 'error'); return; }
    if (montant > (dem.soldeDisponible || 0)) { await showCustomAlert('Montant supérieur au solde disponible.', 'error'); return; }
    if (!periode) { await showCustomAlert('Veuillez préciser la période.', 'error'); return; }

    const confirm = await showCustomConfirm(`⚠️ Confirmer le retrait de ${formatArgent(montant)} CFA pour ${dem.prenom} ${dem.nom} ?`);
    if (!confirm) return;

    const batch = db.batch();
    // Créer le retrait
    const refRetrait = db.collection('retraits').doc();
    batch.set(refRetrait, {
        demarcheurId: dem.id,
        montant,
        dateRetrait: firebase.firestore.FieldValue.serverTimestamp(),
        periode,
        moyenPaiement: moyen,
        validePar: currentUser ? currentUser.email : 'admin',
        statut: 'paye'
    });
    // Mettre à jour le solde
    batch.update(db.collection('demarcheurs').doc(dem.id), {
        totalRetire: firebase.firestore.FieldValue.increment(montant),
        soldeDisponible: firebase.firestore.FieldValue.increment(-montant)
    });
    // Marquer les commissions comme retirées (facultatif, pour traçabilité)
    await batch.commit();

    fermerModal('modal-retrait');
    await chargerDemarcheurs();
    await chargerSoldeDemarcheur();
    await showCustomAlert('✅ Retrait enregistré avec succès !', 'success');
}

// ====================================================
// UTILITAIRES
// ====================================================
function fermerModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// Exposer pour usage depuis reception.js
window.creerCommissionPourExpedition = creerCommissionPourExpedition;