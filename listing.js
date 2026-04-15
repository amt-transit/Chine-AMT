// listing.js — Listing Scans & Photos (Version améliorée)

let allListingDocs = [];
let currentStepFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    chargerListing();
    document.getElementById('search-listing').addEventListener('input', renderListing);
    document.getElementById('sort-listing').addEventListener('change', renderListing);
});

// ─── Chargement ─────────────────────────────────────────
async function chargerListing() {
    const tb = document.getElementById('tbody-listing');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">⏳ Chargement…</td></tr>';

    try {
        const [snapCree, snapModif] = await Promise.all([
            db.collection('expeditions').orderBy('creeLe', 'desc').limit(300).get(),
            db.collection('expeditions').orderBy('dateModification', 'desc').limit(300).get()
        ]).catch(() =>
            Promise.all([db.collection('expeditions').orderBy('creeLe', 'desc').limit(400).get(), { forEach: () => {} }])
        );

        const map = new Map();
        snapCree.forEach(d => map.set(d.id, d.data()));
        snapModif.forEach(d => map.set(d.id, d.data()));

        allListingDocs = Array.from(map.values()).filter(d => {
            const hasPhotos =
                (d.photosChargement?.length > 0) || (d.photos_chargement?.length > 0) ||
                (d.photos_dechargement?.length > 0) || (d.photos_livraison?.length > 0) ||
                (d.photos_livre?.length > 0);
            const hasScans =
                (d.colisScannes_chargement?.length > 0) || (d.colisScannes_dechargement?.length > 0) ||
                (d.colisScannes_livraison?.length > 0) || (d.colisScannes_livre?.length > 0) ||
                ['Au chargement', 'Au déchargement', 'Livré', 'En livraison'].includes(d.status);
            return hasPhotos || hasScans;
        });

        calculerKPIs();
        renderListing();
    } catch (e) {
        console.error(e);
        tb.innerHTML = `<tr><td colspan="8" style="color:red;text-align:center;">Erreur : ${e.message}</td></tr>`;
    }
}

// ─── KPIs & Barre de progression ────────────────────────
function calculerKPIs() {
    let charges = 0, arrives = 0, alertes = 0;
    const allAlerts = [];

    allListingDocs.forEach(d => {
        const total = parseInt(d.quantiteEnvoyee) || 1;
        const sCh = (d.colisScannes_chargement || (d.colisScannes && d.status === 'Au chargement' ? d.colisScannes : []) || []).length;
        const sDe = (d.colisScannes_dechargement || []).length;
        const sLi = (d.colisScannes_livre || []).length;

        if (sCh >= total) charges++;
        if (sDe > 0)      arrives++;

        // Détection des discordances
        if (sCh > 0 && sCh < total) {
            alertes++;
            allAlerts.push({ ref: d.reference, client: `${d.nom} ${d.prenom}`, msg: `Chargement incomplet : ${sCh}/${total} colis`, icon: '⚠️', type: 'warn' });
        }
        if (sDe > 0 && sDe < sCh) {
            alertes++;
            allAlerts.push({ ref: d.reference, client: `${d.nom} ${d.prenom}`, msg: `Manque au déchargement : ${sDe}/${sCh}`, icon: '❌', type: 'err' });
        }
        if (sLi > 0 && sLi < sDe) {
            alertes++;
            allAlerts.push({ ref: d.reference, client: `${d.nom} ${d.prenom}`, msg: `Livraison incomplète : ${sLi}/${sDe}`, icon: '⚠️', type: 'warn' });
        }
        if (sCh > 0 && sDe > sCh) {
            alertes++;
            allAlerts.push({ ref: d.reference, client: `${d.nom} ${d.prenom}`, msg: `Excédent déchargement : ${sDe} déchargés / ${sCh} chargés`, icon: '⚠️', type: 'warn' });
        }
    });

    const total = allListingDocs.length;

    // KPI tiles
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpi-total', total);
    set('kpi-charges', charges);
    set('kpi-arrives', arrives);
    set('kpi-alertes', alertes);

    // Barre de progression
    const pct = total > 0 ? Math.round((arrives / total) * 100) : 0;
    const barEl = document.getElementById('cp-bar');
    const pctEl = document.getElementById('cp-pct');
    if (barEl) barEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    const stagesEl = document.getElementById('cp-stages');
    if (stagesEl) stagesEl.innerHTML = `
        <div class="cp-stage"><div class="cp-stage-dot" style="background:#f39c12;"></div> ${charges} chargés</div>
        <div class="cp-stage"><div class="cp-stage-dot" style="background:#17a2b8;"></div> ${arrives} déchargés</div>
        <div class="cp-stage"><div class="cp-stage-dot" style="background:#27ae60;"></div> ${allListingDocs.filter(d=>(d.colisScannes_livre||[]).length>0).length} livrés</div>
        <div class="cp-stage"><div class="cp-stage-dot" style="background:#c0392b;"></div> ${alertes} alertes</div>`;

    // Panneau alertes
    const panel = document.getElementById('alerts-panel');
    const aList = document.getElementById('alerts-list');
    const aCount = document.getElementById('alerts-count');
    if (panel && aList && aCount) {
        aCount.textContent = alertes;
        if (allAlerts.length > 0) {
            panel.style.display = 'block';
            aList.innerHTML = allAlerts.slice(0, 10).map(a => `
                <div class="alert-item">
                    <div class="alert-icon">${a.icon}</div>
                    <div class="alert-body">
                        <div class="alert-ref">${a.ref}</div>
                        <div class="alert-msg">${a.msg}</div>
                        <div class="alert-client">${a.client}</div>
                    </div>
                </div>`).join('') +
                (allAlerts.length > 10 ? `<div style="font-size:12px;color:#888;margin-top:8px;">…et ${allAlerts.length - 10} autres</div>` : '');
        } else {
            panel.style.display = 'none';
        }
    }
}

// ─── Filtre par étape ────────────────────────────────────
function setStepFilter(filter, btn) {
    currentStepFilter = filter;
    document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderListing();
}

// ─── Rendu tableau ───────────────────────────────────────
function renderListing() {
    const tb = document.getElementById('tbody-listing');
    if (!tb) return;

    const query  = (document.getElementById('search-listing')?.value || '').toLowerCase().trim();
    const sortOp = document.getElementById('sort-listing')?.value || 'date-desc';

    const getTime = v => {
        if (!v) return 0;
        if (v.toMillis) return v.toMillis();
        if (v.seconds)  return v.seconds * 1000;
        return new Date(v).getTime();
    };

    const hasAlert = d => {
        const total = parseInt(d.quantiteEnvoyee) || 1;
        const sCh = (d.colisScannes_chargement || []).length;
        const sDe = (d.colisScannes_dechargement || []).length;
        const sLi = (d.colisScannes_livre || []).length;
        return (sCh > 0 && sCh < total) || (sDe > 0 && sDe < sCh) || (sLi > 0 && sLi < sDe) || (sCh > 0 && sDe > sCh);
    };

    let docs = allListingDocs.filter(d => {
        // Filtre texte
        if (query) {
            const s = `${d.reference||''} ${d.numBL||''} ${d.nom||''} ${d.prenom||''} ${d.status||''}`.toLowerCase();
            if (!s.includes(query)) return false;
        }
        // Filtre étape
        if (currentStepFilter === 'chargement')  return (d.colisScannes_chargement?.length > 0);
        if (currentStepFilter === 'dechargement') return (d.colisScannes_dechargement?.length > 0);
        if (currentStepFilter === 'livre')        return (d.colisScannes_livre?.length > 0);
        if (currentStepFilter === 'alert')        return hasAlert(d);
        return true;
    });

    // Tri
    docs.sort((a, b) => {
        if (sortOp === 'date-desc')  return Math.max(getTime(b.dateModification), getTime(b.creeLe)) - Math.max(getTime(a.dateModification), getTime(a.creeLe));
        if (sortOp === 'date-asc')   return Math.max(getTime(a.dateModification), getTime(a.creeLe)) - Math.max(getTime(b.dateModification), getTime(b.creeLe));
        if (sortOp === 'client')     return (`${a.nom||''} ${a.prenom||''}`).localeCompare(`${b.nom||''} ${b.prenom||''}`);
        if (sortOp === 'status')     return (a.status||'').localeCompare(b.status||'');
        if (sortOp === 'alert')      return (hasAlert(b) ? 1 : 0) - (hasAlert(a) ? 1 : 0);
        return 0;
    });

    if (!docs.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#aaa;">Aucun résultat.</td></tr>';
        return;
    }

    let html = '';
    docs.forEach(d => {
        const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
        const total = parseInt(d.quantiteEnvoyee) || 1;
        const sCh   = (d.colisScannes_chargement || (d.colisScannes && d.status === 'Au chargement' ? d.colisScannes : []) || []).length;
        const sDe   = (d.colisScannes_dechargement || []).length;
        const sLi   = (d.colisScannes_livre || []).length;

        // Mini barre de progression par colis
        const maxScanned = Math.max(sCh, sDe, sLi);
        const progressPct = Math.round((maxScanned / total) * 100);
        const progressColor = sLi > 0 ? '#27ae60' : sDe > 0 ? '#17a2b8' : '#f39c12';
        const progressHtml = `
            <div style="display:flex; align-items:center; gap:6px; white-space:nowrap;">
                <div style="flex:1; height:6px; background:#eee; border-radius:3px; min-width:50px; overflow:hidden;">
                    <div style="height:100%; width:${progressPct}%; background:${progressColor}; border-radius:3px;"></div>
                </div>
                <span style="font-size:11px; font-weight:700; color:${progressColor};">${maxScanned}/${total}</span>
            </div>`;

        // Photos
        let photosHtml = '';
        const addP = (urls, color) => {
            if (urls?.length > 0)
                photosHtml += urls.slice(0, 3).map(u =>
                    `<img src="${u}" onclick="event.stopPropagation();ouvrirApercuPhoto('${u}')"
                         style="width:36px;height:36px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ${color};">`
                ).join('');
        };
        addP(d.photos_chargement || d.photosChargement, '#f39c12');
        addP(d.photos_dechargement, '#17a2b8');
        addP(d.photos_livre, '#27ae60');
        if (!photosHtml) photosHtml = '<span style="color:#ccc;font-size:12px;">—</span>';

        // Concordance
        let concordHtml = '';
        if (sCh > 0 && sCh < total)   concordHtml += `<div class="concord-err">⚠️ Charg. incomplet (${sCh}/${total})</div>`;
        if (sDe > 0 && sDe < sCh)     concordHtml += `<div class="concord-err">❌ Manque décharg. (${sDe}/${sCh})</div>`;
        if (sDe > 0 && sDe > sCh)     concordHtml += `<div class="concord-warn">⚠️ Excédent (${sDe}/${sCh})</div>`;
        if (sLi > 0 && sLi < sDe)     concordHtml += `<div class="concord-warn">⚠️ Livr. incomplète (${sLi}/${sDe})</div>`;
        if (!concordHtml) {
            if (sLi >= total && total > 0)      concordHtml = `<div class="concord-ok">✅ Livraison complète</div>`;
            else if (sDe >= total && total > 0) concordHtml = `<div class="concord-ok">✅ Déchargement complet</div>`;
            else if (sCh >= total && total > 0) concordHtml = `<div class="concord-ok">✅ Chargement complet</div>`;
            else concordHtml = `<span style="color:#aaa;font-size:12px;">En cours…</span>`;
        }

        // Statut badge avec couleur dynamique
        const statusColor = d.status === 'Livré' ? '#27ae60' : d.status === 'Au déchargement' ? '#17a2b8' : '#15609e';
        const safeData = encodeURIComponent(JSON.stringify(d));
        html += `<tr class="interactive-table-row" onclick="ouvrirDetails('${safeData}')">
            <td data-label="Date" style="white-space:nowrap;">${dateStr}</td>
            <td data-label="Réf."><strong style="font-size:13px;">${d.reference}</strong></td>
            <td data-label="Conteneur" style="font-size:12px;">${d.numBL || '—'}</td>
            <td data-label="Client"><strong>${d.nom}</strong> ${d.prenom}</td>
            <td data-label="Statut"><span class="status-badge" style="background:${statusColor}; font-size:10px;">${d.status || '—'}</span></td>
            <td data-label="Progression">${progressHtml}</td>
            <td data-label="Photos" style="display:flex; flex-wrap:wrap; gap:4px;">${photosHtml}</td>
            <td data-label="Concordance">${concordHtml}</td>
        </tr>`;
    });
    tb.innerHTML = html;
}

// ─── Détail (modal) ──────────────────────────────────────
function ouvrirDetails(dataEnc) {
    const d = JSON.parse(decodeURIComponent(dataEnc));
    const total  = parseInt(d.quantiteEnvoyee) || 1;
    const sCh    = d.colisScannes_chargement || (d.colisScannes && d.status === 'Au chargement' ? d.colisScannes : []) || [];
    const sDe    = d.colisScannes_dechargement || [];
    const sLiv   = d.colisScannes_livraison || [];
    const sLivre = d.colisScannes_livre || [];

    // Timeline horizontale
    const steps = [
        { label: '🇨🇳 Chine',      done: sCh.length > 0,    active: sCh.length > 0 && sDe.length === 0 },
        { label: '🚢 En transit',  done: sDe.length > 0,    active: sCh.length > 0 && sDe.length === 0 },
        { label: '🛬 Abidjan',     done: sDe.length > 0,    active: sDe.length > 0 && sLivre.length === 0 },
        { label: '📦 Livré',       done: sLivre.length > 0, active: sLivre.length > 0 },
    ];
    let tlHtml = '<div class="timeline-track">';
    steps.forEach((s, i) => {
        const cls = s.done ? 'done' : (s.active ? 'active' : '');
        tlHtml += `<div class="tl-step">
            <div class="tl-circle ${cls}">${s.done ? '✓' : (s.active ? '●' : '')}</div>
            <div class="tl-label ${cls}">${s.label}</div>
        </div>`;
        if (i < steps.length - 1) tlHtml += `<div class="tl-line ${s.done ? 'done' : ''}"></div>`;
    });
    tlHtml += '</div>';

    // Checklists
    const buildChecklist = (title, arr, color) => {
        if (arr.length === 0 && total <= 1) return '';
        let html = `<div style="margin-top:10px; background:#fff; padding:10px; border-radius:10px; border:1px solid #eee;">
            <div style="font-size:12px; font-weight:700; color:${color}; margin-bottom:8px;">
                ${title} — <span style="background:${color}; color:#fff; border-radius:10px; padding:2px 8px;">${arr.length}/${total}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">`;
        for (let i = 1; i <= total; i++) {
            const ok = arr.includes(i);
            html += `<div style="width:32px; height:32px; border-radius:8px; background:${ok ? color : '#f0f2f5'};
                color:${ok ? '#fff' : '#bbb'}; display:flex; align-items:center; justify-content:center;
                font-size:11px; font-weight:700; border:${ok ? 'none' : '1.5px dashed #ddd'};">${i}</div>`;
        }
        html += '</div></div>';
        return html;
    };

    // Photos
    const buildPhotos = (urls, label, color) => {
        if (!urls?.length) return '';
        let html = `<div style="margin-top:10px;">
            <div style="font-size:12px; font-weight:700; color:${color}; margin-bottom:6px;">${label}</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">`;
        html += urls.map(u => `<img src="${u}" onclick="ouvrirApercuPhoto('${u}')"
            style="width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,.1);">`).join('');
        html += '</div></div>';
        return html;
    };

    const isAir = (d.type || '').startsWith('aerien');
    let pB = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
    let reste = pN - (parseInt(d.montantPaye) || 0);

    const content = document.getElementById('details-listing-content');
    content.innerHTML = `
        <div style="background:#f8f9fa; padding:12px; border-radius:10px; margin-bottom:14px; font-size:14px; line-height:1.8; border:1px solid #eee;">
            <div>👤 <strong>${d.nom} ${d.prenom}</strong></div>
            <div>🏷️ <span style="color:#15609e; font-weight:700;">${d.reference}</span> ${d.numBL ? `· 🚢 ${d.numBL}` : ''}</div>
            <div>📦 ${d.description || '—'} · ${isAir ? d.poidsEnvoye + ' Kg' : d.volumeEnvoye + ' CBM'}</div>
            <div>💰 Reste : <strong style="color:${reste > 0 ? '#c0392b' : '#27ae60'};">${reste > 0 ? formatArgent(reste) + ' CFA' : '✅ Soldé'}</strong></div>
        </div>
        ${tlHtml}
        <div style="margin-top:4px;">
            <div style="font-size:13px; font-weight:700; color:#333; margin-bottom:6px;">Scans par étape</div>
            ${buildChecklist('🇨🇳 Chargement', sCh, '#f39c12')}
            ${buildChecklist('🛬 Déchargement', sDe, '#17a2b8')}
            ${sLiv.length > 0 ? buildChecklist('🛵 En livraison', sLiv, '#8e44ad') : ''}
            ${sLivre.length > 0 ? buildChecklist('✅ Livré', sLivre, '#27ae60') : ''}
        </div>
        <div style="margin-top:14px;">
            <div style="font-size:13px; font-weight:700; color:#333; margin-bottom:2px;">📷 Preuves photos</div>
            ${buildPhotos(d.photos_chargement || d.photosChargement, '🇨🇳 Chargement', '#f39c12')}
            ${buildPhotos(d.photos_dechargement, '🛬 Déchargement', '#17a2b8')}
            ${buildPhotos(d.photos_livraison, '🛵 Livraison', '#8e44ad')}
            ${buildPhotos(d.photos_livre, '✅ Livré', '#27ae60')}
            ${!d.photos_chargement?.length && !d.photos_dechargement?.length && !d.photos_livre?.length
                ? '<div style="color:#aaa;font-style:italic;margin-top:8px;">Aucune photo attachée.</div>' : ''}
        </div>
    `;
    document.getElementById('modal-details-listing').style.display = 'flex';
}

// ─── Photos ──────────────────────────────────────────────
function ouvrirApercuPhoto(url) {
    document.getElementById('image-en-grand').src = url;
    document.getElementById('modal-photo').style.display = 'flex';
}
function fermerModalPhoto(e) {
    const m = document.getElementById('modal-photo');
    if (!e || e.target === m || e.target.classList.contains('modal-close')) m.style.display = 'none';
}
function fermerModalDetails(e) {
    const m = document.getElementById('modal-details-listing');
    if (!e || e.target === m || e.target.classList.contains('modal-close')) m.style.display = 'none';
}

// ─── Export ──────────────────────────────────────────────
function exporterListingCSV() {
    let csv = 'data:text/csv;charset=utf-8,Date,Référence,Conteneur,Client,Statut,Chargés,Déchargés,Livrés,Total,Concordance\r\n';
    allListingDocs.forEach(d => {
        const total = parseInt(d.quantiteEnvoyee) || 1;
        const sCh = (d.colisScannes_chargement || []).length;
        const sDe = (d.colisScannes_dechargement || []).length;
        const sLi = (d.colisScannes_livre || []).length;
        const ok  = sCh >= total && sDe >= total ? 'OK' : (sCh < total ? 'Charg.incomplet' : sDe < sCh ? 'Décharg.manque' : 'En cours');
        csv += `"${d.date||''}","${d.reference||''}","${d.numBL||''}","${d.nom||''} ${d.prenom||''}","${d.status||''}",${sCh},${sDe},${sLi},${total},"${ok}"\r\n`;
    });
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', 'listing_concordance.csv');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

async function exporterListingPDF() {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
        showCustomAlert('Bibliothèque PDF non disponible.', 'error'); return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(14); doc.setTextColor(28, 58, 94);
    doc.text('AMT TRANSIT — Listing Concordance', 14, 16);
    doc.setFontSize(9); doc.setTextColor(100);
    doc.text(`Exporté le ${new Date().toLocaleDateString('fr-FR')}`, 14, 22);

    const headers = [['Date', 'Référence', 'Conteneur', 'Client', 'Statut', 'Chargés', 'Décharg.', 'Livrés', 'Total', 'Concordance']];
    const body = allListingDocs.map(d => {
        const total = parseInt(d.quantiteEnvoyee) || 1;
        const sCh = (d.colisScannes_chargement || []).length;
        const sDe = (d.colisScannes_dechargement || []).length;
        const sLi = (d.colisScannes_livre || []).length;
        const ok  = sCh >= total && sDe >= total ? '✓ OK' : sCh < total ? '⚠ Charg.' : '⚠ Décharg.';
        return [d.date||'', d.reference||'', d.numBL||'—', `${d.nom||''} ${d.prenom||''}`, d.status||'', sCh, sDe, sLi, total, ok];
    });
    doc.autoTable({
        startY: 27, head: headers, body, styles: { fontSize: 8 },
        headStyles: { fillColor: [28, 58, 94] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    doc.save('listing_concordance.pdf');
}
