// audit.js — Audit des paiements (avec filtres rapides de date)

let currentAuditType = 'maritime';
let currentDateFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    ouvrirSousOngletAudit('maritime');
    const sIn = document.getElementById('search-audit');
    if (sIn) sIn.addEventListener('input', () => updateAuditView(sIn.value));
});

function ouvrirSousOngletAudit(type) {
    currentAuditType = type;
    const b1 = document.getElementById('btn-audit-maritime');
    const b2 = document.getElementById('btn-audit-aerien');
    if (b1 && b2) {
        if (type === 'maritime') { b1.classList.add('active'); b2.classList.remove('active'); }
        else { b1.classList.remove('active'); b2.classList.add('active'); }
    }
    chargerAudit();
}

// ─── Filtres rapides par date ─────────────────────────────
function setDateFilter(filter, btn) {
    currentDateFilter = filter;
    document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const sIn = document.getElementById('search-audit');
    updateAuditView(sIn ? sIn.value : '');
}

function _matchDateFilter(date) {
    if (currentDateFilter === 'all' || !date) return true;
    const now = new Date();
    const d = new Date(date);
    if (currentDateFilter === 'today') {
        return d.toDateString() === now.toDateString();
    }
    if (currentDateFilter === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek;
    }
    if (currentDateFilter === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
}

let allAuditData = [];

async function chargerAudit() {
    const tb = document.getElementById('tbody-audit');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;">⏳ Chargement des transactions...</td></tr>';

    try {
        let transactions = [];

        // 1. Récupérer les encaissements
        const snapExp = await db.collection('expeditions').get();
        snapExp.forEach(doc => {
            const d = doc.data();
            let isMatch = false;
            if (currentAuditType === 'maritime' && d.type === 'maritime') isMatch = true;
            if (currentAuditType === 'aerien' && (d.type || '').startsWith('aerien')) isMatch = true;
            if (!isMatch) return;

            // Historique détaillé
            if (d.historiquePaiements && Array.isArray(d.historiquePaiements)) {
                d.historiquePaiements.forEach(p => {
                    let dateP = null;
                    if (p.date) {
                        if (p.date.toDate) dateP = p.date.toDate();
                        else if (p.date.seconds) dateP = new Date(p.date.seconds * 1000);
                        else dateP = new Date(p.date);
                    }
                    transactions.push({
                        date: dateP, type: 'Encaissement',
                        ref: d.reference || '?',
                        tiers: `${d.nom || ''} ${d.prenom || ''}`,
                        description: `Paiement — ${d.description || ''}`,
                        montant: parseInt(p.montant) || 0,
                        moyen: p.moyen || '-', agent: p.agent || '-',
                        isDeleted: p.deleted || false,
                    });
                });
            } else if (d.montantPaye && parseInt(d.montantPaye) > 0) {
                let dateP = null;
                if (d.datePaiement) {
                    if (d.datePaiement.toDate) dateP = d.datePaiement.toDate();
                    else if (d.datePaiement.seconds) dateP = new Date(d.datePaiement.seconds * 1000);
                }
                if (!dateP && d.date) dateP = new Date(d.date);
                transactions.push({
                    date: dateP, type: 'Encaissement (Ancien)',
                    ref: d.reference || '?',
                    tiers: `${d.nom || ''} ${d.prenom || ''}`,
                    description: 'Régularisation ancien dossier',
                    montant: parseInt(d.montantPaye) || 0,
                    moyen: d.moyenPaiement || 'Inconnu', agent: 'Système',
                    isDeleted: false,
                });
            }

            // Historique des modifications
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
                        description: `Correction: ${formatArgent(m.ancien)} → ${formatArgent(m.nouveau)}`,
                        montant: parseInt(m.ancien) || 0,
                        moyen: '-', agent: m.auteur || 'Système',
                        isDeleted: false, isModified: true,
                    });
                });
            }
        });

        // 2. Récupérer les dépenses
        const snapDep = await db.collection('depenses').get();
        snapDep.forEach(doc => {
            const d = doc.data();
            if (d.type !== currentAuditType) return;
            let dateD = d.date ? new Date(d.date) : null;
            transactions.push({
                date: dateD, type: 'Dépense',
                ref: 'DEPENSE', tiers: '-',
                description: d.motif || 'Dépense diverse',
                montant: (parseFloat(d.montant) || 0) * -1,
                moyen: d.moyenPaiement || '-', agent: '-',
                isDeleted: d.deleted || false,
            });
        });

        // Tri chronologique + calcul solde
        transactions.sort((a, b) => (a.date || 0) - (b.date || 0));
        let solde = 0;
        transactions.forEach(t => {
            if (!t.isDeleted && !t.isModified) solde += t.montant;
            t.solde = solde;
        });
        transactions.reverse();

        allAuditData = transactions;
        updateAuditView('');

    } catch (e) {
        console.error(e);
        if (tb) tb.innerHTML = `<tr><td colspan="9" style="text-align:center;color:red;padding:20px;">Erreur : ${e.message}</td></tr>`;
    }
}

function updateAuditView(search) {
    const tb = document.getElementById('tbody-audit');
    if (!tb) return;

    const filtered = allAuditData.filter(t => {
        if (!_matchDateFilter(t.date)) return false;
        if (!search) return true;
        return JSON.stringify(t).toLowerCase().includes(search.toLowerCase());
    });

    let html = '';
    filtered.forEach(t => {
        const dateStr = t.date
            ? t.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) +
              ' ' + t.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '-';

        let typeLabel, rowStyle = '', amountStyle = '';
        const montantAbs = Math.abs(t.montant);

        if (t.isDeleted) {
            rowStyle = 'background:#f9f9f9;';
            amountStyle = 'text-decoration:line-through;color:#bbb;';
            typeLabel = '<span class="status-badge" style="background:#999;font-size:10px;">SUPPRIMÉ</span>';
        } else if (t.isModified) {
            rowStyle = 'background:#fffbf0;';
            amountStyle = 'color:#aaa;font-style:italic;';
            typeLabel = '<span class="status-badge" style="background:#f0ad4e;font-size:10px;">MODIFIÉ</span>';
        } else if (t.montant >= 0) {
            typeLabel = '<span class="status-badge status-conforme" style="font-size:10px;">Entrée</span>';
            amountStyle = 'color:#27ae60;font-weight:700;';
        } else {
            typeLabel = '<span class="status-badge status-ecart" style="font-size:10px;">Sortie</span>';
            amountStyle = 'color:#c0392b;font-weight:700;';
        }

        const soldeColor = t.solde >= 0 ? '#15609e' : '#c0392b';

        html += `<tr style="${rowStyle}">
            <td data-label="Date" style="white-space:nowrap;font-size:12px;">${dateStr}</td>
            <td data-label="Type">${typeLabel}</td>
            <td data-label="Référence" style="font-size:12px;">${t.ref}</td>
            <td data-label="Client" style="font-size:12px;">${t.tiers}</td>
            <td data-label="Description" style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.description}">${t.description}</td>
            <td data-label="Montant" style="text-align:right;${amountStyle} white-space:nowrap;">${formatArgent(t.montant)} CFA</td>
            <td data-label="Solde" style="text-align:right;font-weight:700;color:${soldeColor}; white-space:nowrap;">${formatArgent(t.solde)} CFA</td>
            <td data-label="Moyen" style="font-size:12px;">${t.moyen}</td>
            <td data-label="Agent" style="font-size:12px;color:#888;">${t.agent}</td>
        </tr>`;
    });

    if (filtered.length === 0) {
        html = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#aaa;font-size:15px;">Aucune transaction trouvée 🔍</td></tr>';
    }

    tb.innerHTML = html;
}
