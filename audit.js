// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\audit.js
let currentAuditType = 'maritime';

document.addEventListener('DOMContentLoaded', () => {
    ouvrirSousOngletAudit('maritime');
    const sIn = document.getElementById('search-audit');
    if(sIn) sIn.addEventListener('input', () => updateAuditView(sIn.value));
});

function ouvrirSousOngletAudit(type) {
    currentAuditType = type;
    const b1 = document.getElementById('btn-audit-maritime');
    const b2 = document.getElementById('btn-audit-aerien');
    if(b1 && b2) {
        if(type === 'maritime') { b1.classList.add('active'); b2.classList.remove('active'); }
        else { b1.classList.remove('active'); b2.classList.add('active'); }
    }
    chargerAudit();
}

let allAuditData = [];

async function chargerAudit() {
    const tb = document.getElementById('tbody-audit');
    if(!tb) return;
    tb.innerHTML = '<tr><td colspan="9">Chargement des transactions...</td></tr>';
    
    try {
        let transactions = [];

        // 1. Récupérer les encaissements (Expeditions)
        // On utilise .get() sans orderBy pour être sûr de récupérer TOUS les documents, même les anciens sans date de création
        const snapExp = await db.collection('expeditions').get();
        
        snapExp.forEach(doc => {
            const d = doc.data();
            
            // Filtrage par type (Maritime / Aérien)
            let isMatch = false;
            if (currentAuditType === 'maritime' && d.type === 'maritime') isMatch = true;
            if (currentAuditType === 'aerien' && (d.type || '').startsWith('aerien')) isMatch = true;
            
            if (isMatch) {
            
            // Cas 1 : Historique détaillé disponible (Nouveau système)
            // On vérifie l'existence du tableau (même vide) pour éviter de basculer en mode "Ancien" par erreur si on a tout supprimé
            if (d.historiquePaiements && Array.isArray(d.historiquePaiements)) {
                d.historiquePaiements.forEach(p => {
                    let dateP = null;
                    if (p.date) {
                        if (p.date.toDate) dateP = p.date.toDate();
                        else if (p.date.seconds) dateP = new Date(p.date.seconds * 1000);
                        else dateP = new Date(p.date);
                    }
                    
                    transactions.push({
                        date: dateP,
                        type: 'Encaissement',
                        ref: d.reference || '?',
                        tiers: `${d.nom || ''} ${d.prenom || ''}`,
                        description: `Paiement colis ${d.description || ''}`,
                        montant: parseInt(p.montant) || 0,
                        moyen: p.moyen || '-',
                        agent: p.agent || '-',
                        isDeleted: p.deleted || false
                    });
                });
            } 
            // Cas 2 : Pas d'historique mais un montant payé (Ancien système / Legacy)
            // La comptabilité prend ça en compte, donc l'audit doit le faire aussi
            else if (d.montantPaye && parseInt(d.montantPaye) > 0) {
                let dateP = null;
                // On essaie de trouver une date approximative pour ce paiement ancien
                if (d.datePaiement) {
                    if (d.datePaiement.toDate) dateP = d.datePaiement.toDate();
                    else if (d.datePaiement.seconds) dateP = new Date(d.datePaiement.seconds * 1000);
                } 
                if (!dateP && d.date) dateP = new Date(d.date); // Fallback sur date envoi

                transactions.push({
                    date: dateP,
                    type: 'Encaissement (Ancien)',
                    ref: d.reference || '?',
                    tiers: `${d.nom || ''} ${d.prenom || ''}`,
                    description: `Régularisation ancien dossier`,
                    montant: parseInt(d.montantPaye) || 0,
                    moyen: d.moyenPaiement || 'Inconnu',
                    agent: 'Système',
                    isDeleted: false
                });
            }

            // Cas 3 : Historique des modifications (Prix / Paiement)
            if (d.historiqueModifications && Array.isArray(d.historiqueModifications)) {
                d.historiqueModifications.forEach(m => {
                    let dateM = null;
                    if (m.date) {
                        if (m.date.toDate) dateM = m.date.toDate();
                        else if (m.date.seconds) dateM = new Date(m.date.seconds * 1000);
                        else dateM = new Date(m.date);
                    }
                    
                    transactions.push({
                        date: dateM,
                        type: m.type === 'prix' ? 'Modif. Facture' : 'Modif. Paiement',
                        ref: d.reference || '?',
                        tiers: `${d.nom || ''} ${d.prenom || ''}`,
                        description: `Correction: ${formatArgent(m.ancien)} -> ${formatArgent(m.nouveau)}`,
                        montant: parseInt(m.ancien) || 0, // On affiche l'ancien montant
                        moyen: '-',
                        agent: m.auteur || 'Système',
                        isDeleted: false,
                        isModified: true // Marqueur pour le style
                    });
                });
            }

            }
        });

        // 2. Récupérer les dépenses
        // Idem, on récupère tout sans filtre pour être sûr
        const snapDep = await db.collection('depenses').get();
        snapDep.forEach(doc => {
            const d = doc.data();
            if (d.type !== currentAuditType) return; // Filtre dépense selon l'onglet actif

            let dateD = d.date ? new Date(d.date) : null;
            transactions.push({
                date: dateD,
                type: 'Dépense',
                ref: 'DEPENSE',
                tiers: '-',
                description: d.motif || 'Dépense diverse',
                montant: (parseFloat(d.montant) || 0) * -1, // Négatif pour dépense
                moyen: d.moyenPaiement || '-',
                agent: '-',
                isDeleted: d.deleted || false
            });
        });

        // Calcul du solde progressif
        // 1. Tri chronologique (Ancien -> Récent)
        transactions.sort((a, b) => (a.date || 0) - (b.date || 0));
        
        let solde = 0;
        transactions.forEach(t => {
            if (!t.isDeleted && !t.isModified) { // On ignore les modifications pour le solde de caisse
                solde += t.montant;
            }
            t.solde = solde;
        });

        // 2. Inversion pour affichage (Récent -> Ancien)
        transactions.reverse();

        allAuditData = transactions;
        updateAuditView('');
        
    } catch (e) {
        console.error(e);
        tb.innerHTML = '<tr><td colspan="9">Erreur de chargement : ' + e.message + '</td></tr>';
    }
}

function updateAuditView(search) {
    const tb = document.getElementById('tbody-audit');
    const filtered = allAuditData.filter(t => {
        if(!search) return true;
        const str = JSON.stringify(t).toLowerCase();
        return str.includes(search.toLowerCase());
    });
    
    let html = '';
    filtered.forEach(t => {
        const dateStr = t.date ? t.date.toLocaleDateString('fr-FR') + ' ' + t.date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '-';
        let color = t.montant >= 0 ? '#27ae60' : '#c0392b';
        let typeLabel = t.montant >= 0 ? '<span class="status-badge status-conforme">Entrée</span>' : '<span class="status-badge status-ecart">Sortie</span>';
        let rowStyle = '';
        let amountStyle = `font-weight:bold; color:${color}`;

        if (t.isDeleted) {
            rowStyle = 'style="background-color: #f2f2f2; color: #999;"';
            amountStyle = 'style="text-decoration: line-through; color: #999;"';
            typeLabel = '<span class="status-badge" style="background-color:#999;">SUPPRIMÉ</span>';
            color = '#999';
        } else if (t.isModified) {
            // Style spécifique pour les modifications (Grisé mais pas barré)
            rowStyle = 'style="background-color: #fcf8e3; color: #7f8c8d;"';
            amountStyle = 'style="color: #7f8c8d; font-style: italic;"';
            typeLabel = '<span class="status-badge" style="background-color:#95a5a6;">MODIFIÉ</span>';
            color = '#7f8c8d';
        }
        
        html += `
            <tr ${rowStyle}>
                <td>${dateStr}</td>
                <td>${typeLabel}</td>
                <td>${t.ref}</td>
                <td>${t.tiers}</td>
                <td>${t.description}</td>
                <td ${amountStyle}>${formatArgent(t.montant)} CFA</td>
                <td style="font-weight:bold; color:#15609e">${formatArgent(t.solde)} CFA</td>
                <td>${t.moyen}</td>
                <td>${t.agent}</td>
            </tr>
        `;
    });
    
    if(filtered.length === 0) html = '<tr><td colspan="9" style="text-align:center">Aucune transaction trouvée.</td></tr>';
    
    tb.innerHTML = html;
}
