// =======================================================
// DEMARCHEURS.JS — Système de commissions AMT (Version Pro)
// =======================================================

// ---- État global ----
let tousLesDemarcheurs = [];
let parametresCommissions = { tauxAMT: 0.50, tauxDemarcheur: 0.50, tauxBonusParrainage: 0.10, quiPaieParrainDefaut: 'demarcheur' };
let demarcheurRetraitCourant = null;
let commissionsCharges = [];
let retraitsCharges = [];

// Graphiques
let monthlyChart = null;
let distributionChart = null;
let evolutionChart = null;

// ====================================================
// INITIALISATION
// ====================================================
document.addEventListener('DOMContentLoaded', async () => {
    await chargerParametres();
    await chargerDemarcheurs();
    mettreAJourPreview();

    // Écouteurs d'événements
    document.getElementById('search-demarcheur').addEventListener('input', (e) => {
        afficherReseau(e.target.value.trim().toLowerCase());
    });

    // Afficher bouton nouveau et onglet paramètres uniquement pour superadmin
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
    const onglets = ['dashboard', 'reseau', 'commissions', 'retraits', 'analytique', 'parametres'];
    onglets.forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.style.display = 'none';
    });
    
    document.querySelectorAll('.sub-nav-link').forEach(b => b.classList.remove('active'));
    const target = document.getElementById('tab-' + nom);
    if (target) target.style.display = 'block';
    
    // Marquer le bouton actif
    const btns = document.querySelectorAll('.sub-nav-link');
    for (let btn of btns) {
        if (btn.textContent.toLowerCase().includes(nom) || 
            (nom === 'dashboard' && btn.textContent.includes('Dashboard'))) {
            btn.classList.add('active');
            break;
        }
    }

    // Charger les données selon l'onglet
    if (nom === 'commissions') chargerCommissions();
    if (nom === 'retraits') chargerTousRetraits();
    if (nom === 'analytique') chargerAnalytique();
    if (nom === 'dashboard') {
        mettreAJourKPIsComptables();
        afficherTopDemarcheurs();
        chargerAlertes();
        chargerGraphiqueMensuel();
    }
}

// ====================================================
// PARAMÈTRES
// ====================================================
async function chargerParametres() {
    try {
        const doc = await db.collection('parametres').doc('commissions').get();
        if (doc.exists) {
            parametresCommissions = Object.assign(parametresCommissions, doc.data());
            document.getElementById('param-taux-amt').value = Math.round(parametresCommissions.tauxAMT * 100);
            document.getElementById('param-taux-dem').value = Math.round(parametresCommissions.tauxDemarcheur * 100);
            document.getElementById('param-taux-parrainage').value = Math.round(parametresCommissions.tauxBonusParrainage * 100);
            const selDef = document.getElementById('param-qui-paie-defaut');
            if (selDef) selDef.value = parametresCommissions.quiPaieParrainDefaut || 'demarcheur';
        }
    } catch (e) {
        console.warn('Paramètres par défaut utilisés');
    }
}

async function sauvegarderParametres() {
    const tAMT = parseInt(document.getElementById('param-taux-amt').value) / 100;
    const tDem = parseInt(document.getElementById('param-taux-dem').value) / 100;
    const tPar = parseInt(document.getElementById('param-taux-parrainage').value) / 100;
    const quiPaie = document.getElementById('param-qui-paie-defaut').value;

    if (Math.round((tAMT + tDem) * 100) !== 100) {
        await showCustomAlert('❌ La somme des taux AMT + Démarcheur doit faire 100%.', 'error');
        return;
    }

    await db.collection('parametres').doc('commissions').set({
        tauxAMT: tAMT,
        tauxDemarcheur: tDem,
        tauxBonusParrainage: tPar,
        quiPaieParrainDefaut: quiPaie,
        derniereMaj: firebase.firestore.FieldValue.serverTimestamp(),
        majPar: currentUser ? currentUser.email : 'admin'
    });
    parametresCommissions = { tauxAMT: tAMT, tauxDemarcheur: tDem, tauxBonusParrainage: tPar, quiPaieParrainDefaut: quiPaie };
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
    const quiPaie = document.getElementById('param-qui-paie-defaut')?.value || 'demarcheur';
    const brut = 100000;
    const partDem = brut * tDem / 100;
    const partAMT = brut * tAMT / 100;
    const bonusParrain = partDem * tPar / 100;
    
    let netFilleul = partDem;
    let netAMT = partAMT;

    if (quiPaie === 'amt') {
        netAMT -= bonusParrain;
    } else {
        netFilleul -= bonusParrain;
    }

    const el = document.getElementById('preview-content');
    if (!el) return;
    el.innerHTML = `
      <div style="font-size:13px; line-height:2;">
        <div>💰 Bénéfice brut simulé : <strong>${formatArgent(brut)} CFA</strong></div>
        <hr style="border:none; border-top:1px dashed #ccc; margin:6px 0;"/>
        <div style="font-weight:bold; color:#1C3A5E;">Cas 1 : Sans parrain</div>
        <div style="padding-left:16px;">🏢 AMT reçoit (${tAMT}%) : <strong>${formatArgent(partAMT)} CFA</strong></div>
        <div style="padding-left:16px;">👤 Démarcheur reçoit (${tDem}%) : <strong>${formatArgent(partDem)} CFA</strong></div>
        <hr style="border:none; border-top:1px dashed #ccc; margin:6px 0;"/>
        <div style="font-weight:bold; color:#f39c12;">Cas 2 : Avec parrain (payé par ${quiPaie === 'amt' ? 'AMT' : 'le démarcheur'})</div>
        <div style="padding-left:16px;">🎯 Parrain reçoit en bonus : <strong>${formatArgent(bonusParrain)} CFA</strong></div>
        <div style="padding-left:16px;">👤 Démarcheur final reçoit : <strong>${formatArgent(netFilleul)} CFA</strong></div>
        <div style="padding-left:16px;">🏢 AMT final reçoit : <strong>${formatArgent(netAMT)} CFA</strong></div>
      </div>`;
}

// ====================================================
// DÉMARCHEURS — CRUD
// ====================================================
async function chargerDemarcheurs() {
    try {
        const snap = await db.collection('demarcheurs').orderBy('dateInscription', 'asc').get();
        tousLesDemarcheurs = [];
        snap.forEach(d => {
            const data = d.data();
            // Compter les filleuls
            const filleulsCount = tousLesDemarcheurs.filter(f => f.parrainId === d.id).length;
            tousLesDemarcheurs.push({ id: d.id, ...data, filleulsCount });
        });
        // Recalculer les filleuls après avoir tout chargé
        tousLesDemarcheurs.forEach(d => {
            d.filleulsCount = tousLesDemarcheurs.filter(f => f.parrainId === d.id).length;
        });
        afficherReseau();
        remplirSelectsDemarcheurs();
        mettreAJourKPIsComptables();
    } catch (e) {
        console.error(e);
        document.getElementById('liste-demarcheurs').innerHTML = '<p style="color:red;">Erreur de chargement.</p>';
    }
}

function mettreAJourKPIsComptables() {
    let totalGenere = 0;
    let totalPaye = 0;
    let totalDette = 0;
    tousLesDemarcheurs.forEach(d => {
        totalGenere += (d.totalGagne || 0);
        totalPaye += (d.totalRetire || 0);
        totalDette += (d.soldeDisponible || 0);
    });
    
    const kpiDem = document.getElementById('kpi-total-dem');
    const kpiGenere = document.getElementById('kpi-total-genere');
    const kpiPaye = document.getElementById('kpi-total-paye');
    const kpiDette = document.getElementById('kpi-total-dette');
    
    if(kpiDem) kpiDem.textContent = tousLesDemarcheurs.length;
    if(kpiGenere) kpiGenere.textContent = formatArgent(totalGenere) + ' CFA';
    if(kpiPaye) kpiPaye.textContent = formatArgent(totalPaye) + ' CFA';
    if(kpiDette) kpiDette.textContent = formatArgent(totalDette) + ' CFA';
}

function afficherReseau(searchQuery = '') {
    const container = document.getElementById('liste-demarcheurs');
    if (!container) return;
    
    const filterStatut = document.getElementById('filter-statut')?.value || 'all';
    const filterParrain = document.getElementById('filter-parrain')?.value || 'all';
    
    let demsFiltres = [...tousLesDemarcheurs];
    
    // Filtre par statut
    if (filterStatut !== 'all') {
        demsFiltres = demsFiltres.filter(d => d.statut === filterStatut);
    }
    
    // Filtre par parrain
    if (filterParrain === 'avec_parrain') {
        demsFiltres = demsFiltres.filter(d => d.parrainId);
    } else if (filterParrain === 'sans_parrain') {
        demsFiltres = demsFiltres.filter(d => !d.parrainId);
    }
    
    // Filtre recherche
    if (searchQuery) {
        demsFiltres = demsFiltres.filter(d => 
            (d.nom + ' ' + d.prenom + ' ' + d.telephone).toLowerCase().includes(searchQuery)
        );
    }
    
    if (demsFiltres.length === 0) {
        container.innerHTML = '<div class="card" style="text-align:center; color:#888;"><i class="fas fa-users" style="font-size:2rem; margin-bottom:10px; display:block;"></i>Aucun démarcheur trouvé.</div>';
        return;
    }

    let html = '';
    
    function construireArbre(demarcheur, niveau, niveauMax = 3) {
        if (niveau > niveauMax) return;
        html += carteReseau(demarcheur, niveau);
        const filleuls = demsFiltres.filter(d => d.parrainId === demarcheur.id);
        filleuls.forEach(f => construireArbre(f, niveau + 1));
    }

    const racines = demsFiltres.filter(d => !d.parrainId);
    racines.forEach(r => construireArbre(r, 0));

    container.innerHTML = `<div style="display:flex; flex-direction:column; gap:8px;">${html}</div>`;
}

function carteReseau(d, niveau = 0) {
    const filleuls = tousLesDemarcheurs.filter(f => f.parrainId === d.id);
    const parrain = d.parrainId ? tousLesDemarcheurs.find(p => p.id === d.parrainId) : null;
    const isAdmin = window.currentRole === 'superadmin';
    const solde = (d.soldeDisponible || 0);
    const soldeColor = solde > 0 ? '#27ae60' : '#888';
    const isFilleul = niveau > 0;
    const indent = isFilleul ? `margin-left:${Math.min(niveau * 32, 96)}px; border-left:3px solid #e0e0e0; padding-left:16px;` : '';

    return `
    <div class="card" style="${indent} padding:12px 16px; margin-bottom: 8px; cursor:pointer;" onclick="voirDetailsDemarcheur('${d.id}')">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:40px; height:40px; border-radius:50%; background:${isFilleul ? '#e8f5e9' : '#e3f2fd'}; display:flex; align-items:center; justify-content:center; font-weight:700; color:${isFilleul ? '#2e7d32' : '#1565c0'}; font-size:15px;">
            ${(d.prenom?.[0] || d.nom?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600; font-size:15px;">${d.prenom} ${d.nom}</div>
            <div style="font-size:12px; color:#777;">
              ${isFilleul && parrain ? '<i class="fas fa-level-up-alt"></i> Filleul de ' + parrain.prenom + ' ' + parrain.nom + ' &nbsp;|&nbsp; ' : ''}
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
          ${isAdmin ? `<button class="btn-icon" onclick="event.stopPropagation(); editerDemarcheur('${d.id}')"><i class="fas fa-edit"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

window.voirDetailsDemarcheur = async function(id) {
    const d = tousLesDemarcheurs.find(x => x.id === id);
    if (!d) return;

    const parrain = d.parrainId ? tousLesDemarcheurs.find(p => p.id === d.parrainId) : null;
    const filleuls = tousLesDemarcheurs.filter(f => f.parrainId === d.id);

    const tAMT = parametresCommissions.tauxAMT || 0.50;
    const tDem = parametresCommissions.tauxDemarcheur || 0.50;
    const tParBase = parametresCommissions.tauxBonusParrainage || 0.10;
    const tauxNiveaux = [tParBase, tParBase / 2, tParBase / 4];
    const quiPaie = d.quiPaieParrain || parametresCommissions.quiPaieParrainDefaut || 'demarcheur';

    // Récupérer la chaîne de parrainage complète (ascendants)
    let upline = [];
    let parentId = d.parrainId;
    while (parentId && upline.length < 3) {
        const p = tousLesDemarcheurs.find(dem => dem.id === parentId);
        if (!p) break;
        upline.push(p);
        parentId = p.parrainId;
    }

    // Simulation sur une vente de 100 000 CFA
    const brut = 100000;
    const partDemBrute = brut * tDem;
    const partAMTBrute = brut * tAMT;
    
    let totalBonusDistribue = 0;
    let bonusParNiveau = [];
    upline.forEach((p, i) => {
        const bonus = partDemBrute * tauxNiveaux[i];
        bonusParNiveau.push({ parrain: p, montant: bonus });
        totalBonusDistribue += bonus;
    });

    let partDemNette = partDemBrute;
    let partAMTNette = partAMTBrute;
    if (totalBonusDistribue > 0) {
        if (quiPaie === 'amt') {
            partAMTNette -= totalBonusDistribue;
        } else {
            partDemNette -= totalBonusDistribue;
        }
    }

    let html = `<div style="font-size:14px; line-height:1.7;">
        <h4 style="margin:0 0 12px 0; font-size:16px; color:#1C3A5E; border-bottom:2px solid #eee; padding-bottom:8px;">Simulation sur une vente de ${formatArgent(brut)} CFA</h4>
        <ul style="list-style:none; padding:0; margin:0;">
            <li style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span><i class="fas fa-user-tie" style="color:#27ae60; width:20px;"></i> <strong>${d.prenom} ${d.nom} (Net)</strong></span> <strong style="color:#27ae60;">${formatArgent(partDemNette)} CFA</strong></li>`;
    
    bonusParNiveau.forEach((item, i) => {
        html += `<li style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;">
            <span style="padding-left:${(i+1)*10}px;"><i class="fas fa-level-up-alt" style="color:#f39c12; width:20px;"></i> Parrain N-${i+1} (${item.parrain.prenom})</span> 
            <strong style="color:#f39c12;">+ ${formatArgent(item.montant)} CFA</strong>
        </li>`;
    });

    html += `<li style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0f0f0;"><span><i class="fas fa-building" style="color:#1C3A5E; width:20px;"></i> Part AMT (Net)</span> <strong style="color:#1C3A5E;">${formatArgent(partAMTNette)} CFA</strong></li></ul>`;

    if (totalBonusDistribue > 0) {
        const payeur = quiPaie === 'amt' ? 'AMT Transit' : 'le démarcheur';
        html += `<div style="font-size:12px; color:#888; text-align:center; margin-top:10px; padding:8px; background:#f8f9fa; border-radius:6px;"><i class="fas fa-info-circle"></i> Le bonus total de <strong>${formatArgent(totalBonusDistribue)} CFA</strong> est déduit de la part de <strong>${payeur}</strong>.</div>`;
    }

    if (filleuls.length > 0) {
        const bonusFilleul = (brut * tDem) * tParBase;
        html += `<hr style="margin:16px 0; border:none; border-top:1px dashed #ccc;"><h4 style="margin:0 0 10px 0; font-size:16px; color:#1565c0;">Gains sur son réseau (${filleuls.length} filleul(s))</h4><div style="background:#e3f2fd; padding:12px; border-radius:8px; border-left:4px solid #1565c0; font-size:13px;">Pour chaque vente de <strong>${formatArgent(brut)} CFA</strong> faite par un de ses filleuls directs, il gagne un bonus de <strong style="color:#1565c0;">+${formatArgent(bonusFilleul)} CFA</strong>.</div>`;
    }
    html += `</div>`;
    
    document.getElementById('modal-det-titre').textContent = `Détails : ${d.prenom} ${d.nom}`;
    document.getElementById('modal-det-body').innerHTML = html;
    document.getElementById('modal-details-demarcheur').style.display = 'flex';
};

function remplirSelectsDemarcheurs() {
    const selectIds = ['select-demarcheur-retrait', 'filtre-demarcheur-commi', 'dem-parrain'];
    selectIds.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const selectedValue = sel.value;
        const firstOpt = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(firstOpt);
        tousLesDemarcheurs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.prenom + ' ' + d.nom;
            sel.appendChild(opt);
        });
        if (selectedValue && [...sel.options].some(opt => opt.value === selectedValue)) {
            sel.value = selectedValue;
        }
    });
}

function ouvrirModalDemarcheur(id = null) {
    remplirSelectsDemarcheurs();

    document.getElementById('dem-id').value = id || '';
    document.getElementById('dem-nom').value = '';
    document.getElementById('dem-prenom').value = '';
    document.getElementById('dem-telephone').value = '';
    document.getElementById('dem-email').value = '';
    document.getElementById('dem-parrain').value = '';
    document.getElementById('dem-qui-paie-parrain').value = parametresCommissions.quiPaieParrainDefaut || 'demarcheur';
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
            document.getElementById('dem-qui-paie-parrain').value = d.quiPaieParrain || parametresCommissions.quiPaieParrainDefaut || 'demarcheur';
            document.getElementById('dem-periode').value = d.periodeRetrait || 'mensuel';
        }
    }
    toggleQuiPaieParrain();
    document.getElementById('modal-demarcheur').style.display = 'flex';
}

window.toggleQuiPaieParrain = function() {
    const p = document.getElementById('dem-parrain').value;
    document.getElementById('group-qui-paie-parrain').style.display = p ? 'block' : 'none';
};

function editerDemarcheur(id) { ouvrirModalDemarcheur(id); }

async function sauvegarderDemarcheur() {
    const id = document.getElementById('dem-id').value;
    const nom = document.getElementById('dem-nom').value.trim();
    const prenom = document.getElementById('dem-prenom').value.trim();
    const telephone = document.getElementById('dem-telephone').value.trim();
    const email = document.getElementById('dem-email').value.trim();
    const parrainId = document.getElementById('dem-parrain').value || null;
    const quiPaieParrain = document.getElementById('dem-qui-paie-parrain').value;
    const periodeRetrait = document.getElementById('dem-periode').value;

    if (!nom || !prenom) { await showCustomAlert('Nom et prénom sont obligatoires.', 'error'); return; }

    const data = { nom, prenom, telephone, email, parrainId, quiPaieParrain: parrainId ? quiPaieParrain : 'demarcheur', periodeRetrait };

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
// COMMISSIONS
// ====================================================
async function chargerCommissions() {
    const filtreId = document.getElementById('filtre-demarcheur-commi').value;
    const filtreDate = document.getElementById('filtre-date-commi').value;
    const filtreType = document.getElementById('filtre-type-commi').value;
    const tbody = document.getElementById('tbody-commissions');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">Chargement...</td></tr>';

    let dateDebut = null;
    let dateFin = null;
    const now = new Date();
    
    if (filtreDate === 'month') {
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFin = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (filtreDate === 'last_month') {
        dateDebut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        dateFin = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (filtreDate === 'quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        dateDebut = new Date(now.getFullYear(), quarter * 3, 1);
        dateFin = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59);
    } else if (filtreDate === 'year') {
        dateDebut = new Date(now.getFullYear(), 0, 1);
        dateFin = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    try {
        let query = db.collection('commissions').orderBy('dateCreation', 'desc');
        if (filtreId) query = query.where('demarcheurId', '==', filtreId);
        
        const snap = await query.get();

        let totalGenere = 0, totalAMT = 0, totalDemNet = 0, totalBonus = 0;
        let html = '';
        commissionsCharges = [];

        snap.forEach(d => {
            const c = d.data();
            const dateDoc = c.dateCreation ? c.dateCreation.toDate() : new Date();
            
            if (dateDebut && dateFin) {
                if (dateDoc < dateDebut || dateDoc > dateFin) return;
            }
            
            if (filtreType !== 'all' && c.type !== filtreType) return;

            // Logique de calcul pour les statistiques
            if (c.type === 'direct') {
                totalGenere += c.montantBrut || 0;
                totalAMT += c.montantAMT || 0;
            }
            if (c.type === 'parrainage') {
                totalBonus += c.bonusParrainage || 0;
            }
            totalDemNet += c.montantNet || 0; // Somme de tous les gains nets des démarcheurs

            const dem = tousLesDemarcheurs.find(x => x.id === c.demarcheurId);
            const nomDem = dem ? dem.prenom + ' ' + dem.nom : c.demarcheurId;
            const date = c.dateCreation ? c.dateCreation.toDate().toLocaleDateString('fr-FR') : '-';
            const typeBadge = c.type === 'parrainage'
                ? '<span class="badge badge-warning">Parrainage</span>'
                : '<span class="badge badge-info">Direct</span>';
            const statutBadge = c.statut === 'retire'
                ? '<span class="badge badge-success">✓ Retiré</span>'
                : '<span class="badge badge-warning">En attente</span>';

            commissionsCharges.push({ date, nomDem, type: c.type, base: c.montantBrut, netDem: c.montantNet, partAMT: c.montantAMT, bonus: c.bonusParrainage });

            html += `<tr>
              <td data-label="Date">${date}</td>
              <td data-label="Démarcheur">${nomDem}</td>
              <td data-label="Type">${typeBadge}</td>
              <td data-label="Niveau">${c.type === 'parrainage' ? `N-${c.niveau || 1}` : '—'}</td>
              <td data-label="Bénéfice CBM">${formatArgent(c.montantBrut || 0)} CFA</td>
              <td data-label="Part">${formatArgent(c.montantDemarcheur || 0)} CFA</td>
              <td data-label="Bonus parrain">${formatArgent(c.bonusParrainage || 0)} CFA</td>
              <td data-label="Net démarcheur" style="font-weight:600; color:#27ae60;">${formatArgent(c.montantNet || 0)} CFA</td>
              <td data-label="Part AMT">${formatArgent(c.montantAMT || 0)} CFA</td>
              <td data-label="Statut">${statutBadge}</td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="10" style="text-align:center; padding:20px; color:#888;">Aucune commission trouvée</td></tr>';

        document.getElementById('stat-total-genere').textContent = formatArgent(totalGenere) + ' CFA';
        document.getElementById('stat-part-amt').textContent = formatArgent(totalAMT) + ' CFA';
        document.getElementById('stat-part-demarcheurs').textContent = formatArgent(totalDemNet) + ' CFA';
        document.getElementById('stat-bonus-parrainage').textContent = formatArgent(totalBonus) + ' CFA';
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="10" style="color:red; padding:20px;">Erreur de chargement</td></tr>';
    }
}

// ====================================================
// FONCTION PRINCIPALE — Créer les commissions
// ====================================================
async function creerCommissionPourExpedition(expeditionId, beneficeBrut, demarcheurId) {
    if (!demarcheurId || beneficeBrut <= 0) return;
    const dem = tousLesDemarcheurs.find(d => d.id === demarcheurId);
    if (!dem) return;

    const tAMT = parametresCommissions.tauxAMT || 0.50;
    const tDem = parametresCommissions.tauxDemarcheur || 0.50;
    const tPar = parametresCommissions.tauxBonusParrainage || 0.10;

    let partDemarcheurBrute = beneficeBrut * tDem;
    let partAMTBrute = beneficeBrut * tAMT;
    
    const bonusParrainage = dem.parrainId ? partDemarcheurBrute * tPar : 0;
    
    let partDemarcheurNette = partDemarcheurBrute;
    let partAMTNette = partAMTBrute;

    if (dem.parrainId && bonusParrainage > 0) {
        if (dem.quiPaieParrain === 'amt') {
            partAMTNette = partAMTBrute - bonusParrainage;
        } else {
            partDemarcheurNette = partDemarcheurBrute - bonusParrainage;
        }
    }

    const batch = db.batch();
    const now = firebase.firestore.FieldValue.serverTimestamp();

    const refComDirect = db.collection('commissions').doc();
    batch.set(refComDirect, {
        expeditionId,
        demarcheurId,
        type: 'direct',
        montantBrut: beneficeBrut,
        tauxDemarcheur: tDem,
        montantDemarcheur: partDemarcheurBrute,
        tauxAMT: tAMT,
        montantAMT: partAMTNette,
        bonusParrainage: bonusParrainage,
        quiPaieParrain: dem.quiPaieParrain || 'demarcheur',
        montantNet: partDemarcheurNette,
        dateCreation: now,
        statut: 'en_attente'
    });

    const refDem = db.collection('demarcheurs').doc(demarcheurId);
    batch.update(refDem, {
        totalGagne: firebase.firestore.FieldValue.increment(partDemarcheurNette),
        soldeDisponible: firebase.firestore.FieldValue.increment(partDemarcheurNette)
    });

    if (dem.parrainId && bonusParrainage > 0) {
        const refComParrain = db.collection('commissions').doc();
        batch.set(refComParrain, {
            expeditionId,
            demarcheurId: dem.parrainId,
            type: 'parrainage',
            filleulId: demarcheurId,
            montantBrut: beneficeBrut,
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

    await chargerRetraitsDemarcheur(id);
}

async function chargerRetraitsDemarcheur(id) {
    const tbody = document.getElementById('tbody-retraits');
    if (!tbody) return;
    const snap = await db.collection('retraits').where('demarcheurId', '==', id).orderBy('dateRetrait', 'desc').get();
    if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">Aucun retrait effectué</td></tr>';
        return;
    }
    let html = '';
    retraitsCharges = [];
    snap.forEach(d => {
        const r = d.data();
        const date = r.dateRetrait ? r.dateRetrait.toDate().toLocaleDateString('fr-FR') : '-';
        const dem = tousLesDemarcheurs.find(x => x.id === r.demarcheurId);
        const nomDem = dem ? dem.prenom + ' ' + dem.nom : r.demarcheurId;
        
        retraitsCharges.push({ date, nomDem, montant: r.montant, periode: r.periode, moyen: r.moyenPaiement, agent: r.validePar });

        html += `<tr>
          <td>${date}</td>
          <td>${nomDem}</td>
          <td style="font-weight:600; color:#27ae60;">${formatArgent(r.montant || 0)} CFA</td>
          <td>${r.periode || '-'}</td>
          <td>${r.moyenPaiement || '-'}</td>
          <td>${r.validePar || '-'}</td>
          <td><span class="badge badge-success">✓ Payé</span></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function chargerTousRetraits() {
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
    batch.update(db.collection('demarcheurs').doc(dem.id), {
        totalRetire: firebase.firestore.FieldValue.increment(montant),
        soldeDisponible: firebase.firestore.FieldValue.increment(-montant)
    });
    await batch.commit();

    fermerModal('modal-retrait');
    await chargerDemarcheurs();
    await chargerSoldeDemarcheur();
    await showCustomAlert('✅ Retrait enregistré avec succès !', 'success');
}

// ====================================================
// ANALYTIQUE (NOUVEAU)
// ====================================================
async function chargerAnalytique() {
    const commissionsSnap = await db.collection('commissions').get();
    const commissions = commissionsSnap.docs.map(d => d.data());
    
    // Commission moyenne
    const totalCommissions = commissions.reduce((sum, c) => sum + (c.montantBrut || 0), 0);
    const avgComm = totalCommissions / (commissions.length || 1);
    document.getElementById('avg-commission').textContent = formatArgent(avgComm) + ' CFA';
    
    // Meilleur mois
    const monthlyMap = new Map();
    commissions.forEach(c => {
        const date = c.dateCreation?.toDate();
        if (date) {
            const key = `${date.toLocaleString('fr', { month: 'long' })} ${date.getFullYear()}`;
            monthlyMap.set(key, (monthlyMap.get(key) || 0) + (c.montantBrut || 0));
        }
    });
    let bestMonth = '';
    let bestAmount = 0;
    for (let [month, amount] of monthlyMap) {
        if (amount > bestAmount) {
            bestAmount = amount;
            bestMonth = month;
        }
    }
    document.getElementById('best-month').textContent = bestMonth ? `${bestMonth} (${formatArgent(bestAmount)} CFA)` : '—';
    
    // Taux de parrainage actif
    const avecParrain = tousLesDemarcheurs.filter(d => d.parrainId).length;
    const tauxParrainage = tousLesDemarcheurs.length ? (avecParrain / tousLesDemarcheurs.length * 100).toFixed(1) : 0;
    document.getElementById('active-sponsor').textContent = `${tauxParrainage}%`;
    
    // Graphique de distribution
    const directTotal = commissions.reduce((sum, c) => sum + ((c.type === 'direct' ? c.montantNet : 0) || 0), 0);
    const parrainTotal = commissions.reduce((sum, c) => sum + ((c.type === 'parrainage' ? c.montantNet : 0) || 0), 0);
    
    if (distributionChart) distributionChart.destroy();
    const ctxDist = document.getElementById('distributionChart')?.getContext('2d');
    if (ctxDist) {
        distributionChart = new Chart(ctxDist, {
            type: 'pie',
            data: {
                labels: ['Commissions directes', 'Bonus parrainage'],
                datasets: [{ data: [directTotal, parrainTotal], backgroundColor: ['#27ae60', '#f39c12'] }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
    
    // Graphique d'évolution
    const evolutionMap = new Map();
    commissions.forEach(c => {
        const date = c.dateCreation?.toDate();
        if (date) {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            evolutionMap.set(key, (evolutionMap.get(key) || 0) + (c.montantBrut || 0));
        }
    });
    const sorted = Array.from(evolutionMap.entries()).sort();
    
    if (evolutionChart) evolutionChart.destroy();
    const ctxEvo = document.getElementById('evolutionChart')?.getContext('2d');
    if (ctxEvo) {
        evolutionChart = new Chart(ctxEvo, {
            type: 'line',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{ label: 'Commissions (CFA)', data: sorted.map(s => s[1]), borderColor: '#27ae60', tension: 0.3, fill: true, backgroundColor: 'rgba(39,174,96,0.1)' }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// ====================================================
// DASHBOARD
// ====================================================
async function afficherTopDemarcheurs() {
    const container = document.getElementById('top-demarcheurs-list');
    if (!container) return;
    const sorted = [...tousLesDemarcheurs].sort((a, b) => (b.totalGagne || 0) - (a.totalGagne || 0)).slice(0, 5);
    if (sorted.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888;">Aucun démarcheur</p>';
        return;
    }
    container.innerHTML = sorted.map((d, idx) => `
        <div class="ranking-item" onclick="voirDetailsDemarcheur('${d.id}')">
            <div class="ranking-number ${idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : ''}">${idx + 1}</div>
            <div style="flex:1;"><strong>${d.prenom} ${d.nom}</strong><br><small>${d.telephone || '-'}</small></div>
            <div style="text-align:right;"><strong style="color:#27ae60;">${formatArgent(d.totalGagne || 0)} CFA</strong><br><small>${d.filleulsCount || 0} filleuls</small></div>
        </div>
    `).join('');
}

async function chargerAlertes() {
    const container = document.getElementById('alerts-container');
    if (!container) return;
    let alerts = [];
    const seuilAlerte = 50000;
    const demEnDette = tousLesDemarcheurs.filter(d => (d.soldeDisponible || 0) > seuilAlerte);
    if (demEnDette.length > 0) {
        alerts.push(`⚠️ ${demEnDette.length} démarcheur(s) ont un solde > ${formatArgent(seuilAlerte)} CFA à payer`);
    }
    const inactifs = tousLesDemarcheurs.filter(d => d.statut === 'inactif');
    if (inactifs.length > 0) {
        alerts.push(`📌 ${inactifs.length} démarcheur(s) inactif(s) - Relance recommandée`);
    }
    const topPerformers = tousLesDemarcheurs.filter(d => (d.totalGagne || 0) > 100000);
    if (topPerformers.length > 0) {
        alerts.push(`🏆 Félicitations ! ${topPerformers.length} démarcheur(s) ont dépassé 100 000 CFA de commissions`);
    }
    if (alerts.length === 0) alerts.push('✅ Aucune alerte majeure');
    container.innerHTML = alerts.map(a => `<div style="padding:8px 0; border-bottom:1px solid #ffeaa7;">${a}</div>`).join('');
}

async function chargerGraphiqueMensuel() {
    const commissionsSnap = await db.collection('commissions').get();
    const monthlyMap = new Map();
    commissionsSnap.docs.forEach(doc => {
        const c = doc.data();
        const date = c.dateCreation?.toDate();
        if (date) {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap.set(key, (monthlyMap.get(key) || 0) + (c.montantBrut || 0));
        }
    });
    const sorted = Array.from(monthlyMap.entries()).sort().slice(-6);
    
    if (monthlyChart) monthlyChart.destroy();
    const ctx = document.getElementById('monthlyChart')?.getContext('2d');
    if (ctx) {
        monthlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{ label: 'Commissions (CFA)', data: sorted.map(s => s[1]), backgroundColor: '#27ae60', borderRadius: 8 }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
        });
    }
}

// ====================================================
// UTILITAIRES
// ====================================================
function exporterCommissionsCSV() {
    if (commissionsCharges.length === 0) { showCustomAlert("Rien à exporter.", "warning"); return; }
    let csvContent = "data:text/csv;charset=utf-8,Date,Démarcheur,Type,Bénéfice Base,Net Démarcheur,Bonus Parrain,Part AMT\r\n";
    commissionsCharges.forEach(c => {
        csvContent += `"${c.date}","${c.nomDem}","${c.type}",${c.base || 0},${c.netDem || 0},${c.bonus || 0},${c.partAMT || 0}\r\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Commissions_Export_${new Date().toLocaleDateString('fr-FR')}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exporterRetraitsCSV() {
    if (retraitsCharges.length === 0) { showCustomAlert("Rien à exporter.", "warning"); return; }
    let csvContent = "data:text/csv;charset=utf-8,Date,Démarcheur,Montant,Période,Moyen,Validé Par\r\n";
    retraitsCharges.forEach(r => {
        csvContent += `"${r.date}","${r.nomDem}",${r.montant || 0},"${r.periode || ''}","${r.moyen || ''}","${r.agent || ''}"\r\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Retraits_Export_${new Date().toLocaleDateString('fr-FR')}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function fermerModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function formatArgent(montant) {
    return new Intl.NumberFormat('fr-FR').format(Math.round(montant || 0));
}

window.creerCommissionPourExpedition = creerCommissionPourExpedition;