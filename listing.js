document.addEventListener('DOMContentLoaded', () => {
    chargerListing();
});

async function chargerListing() {
    const tb = document.getElementById('tbody-listing');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">⏳ Récupération du listing...</td></tr>';
    
    try {
        // On récupère les 200 plus récents créés ET les 200 plus récemment modifiés/scannés
        const [snapCree, snapModif] = await Promise.all([
            db.collection('expeditions').orderBy('creeLe', 'desc').limit(200).get(),
            db.collection('expeditions').orderBy('dateModification', 'desc').limit(200).get()
        ]).catch(err => {
            console.warn("Fallback sur creeLe uniquement.", err);
            return Promise.all([db.collection('expeditions').orderBy('creeLe', 'desc').limit(300).get(), { forEach: () => {} }]);
        });
        
        const docsMap = new Map();
        snapCree.forEach(doc => docsMap.set(doc.id, doc.data()));
        snapModif.forEach(doc => docsMap.set(doc.id, doc.data()));
        
        const allDocs = Array.from(docsMap.values());
        const getTime = (val) => {
            if (!val) return 0;
            if (val.toMillis) return val.toMillis();
            if (val.seconds) return val.seconds * 1000;
            return new Date(val).getTime();
        };
        
        // Tri final : le plus récemment touché (créé ou scanné) en premier
        allDocs.sort((a, b) => Math.max(getTime(b.dateModification), getTime(b.creeLe)) - Math.max(getTime(a.dateModification), getTime(a.creeLe)));

        let html = '';
        
        allDocs.forEach(d => {
            
            const hasPhotos = (d.photosChargement && d.photosChargement.length > 0) || 
                              (d.photos_chargement && d.photos_chargement.length > 0) ||
                              (d.photos_dechargement && d.photos_dechargement.length > 0) ||
                              (d.photos_livraison && d.photos_livraison.length > 0) ||
                              (d.photos_livre && d.photos_livre.length > 0);

            const hasScans = (d.colisScannes_chargement && d.colisScannes_chargement.length > 0) ||
                             (d.colisScannes_dechargement && d.colisScannes_dechargement.length > 0) ||
                             (d.colisScannes_livraison && d.colisScannes_livraison.length > 0) ||
                             (d.colisScannes_livre && d.colisScannes_livre.length > 0) ||
                             d.status === 'Au chargement' || d.status === 'Au déchargement' || d.status === 'Livré';

            if (hasPhotos || hasScans) {
                const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-';
                let photosHtml = '';
                
                const addPhotos = (urls, label, color) => {
                    if(urls && urls.length > 0) {
                        photosHtml += `<div style="margin-bottom:6px;"><span style="font-size:10px; font-weight:bold; color:${color}; border-bottom:1px solid ${color}; padding-bottom:2px;">${label}</span><br><div style="margin-top:4px;">`;
                        photosHtml += urls.map(url => `<img src="${url}" onclick="event.stopPropagation(); ouvrirApercuPhoto('${url}')" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #ddd;margin-right:4px;" title="Cliquer pour agrandir">`).join('');
                        photosHtml += `</div></div>`;
                    }
                };
                
                let pCh = d.photos_chargement || d.photosChargement || [];
                addPhotos(pCh, "CHARGEMENT", "#f39c12");
                addPhotos(d.photos_dechargement, "DÉCHARGEMENT", "#17a2b8");
                addPhotos(d.photos_livraison, "LIVRAISON", "#8e44ad");
                addPhotos(d.photos_livre, "LIVRÉ", "#27ae60");
                
                if(!photosHtml) photosHtml = '<span style="color:#aaa;font-size:12px;">Aucune photo</span>';

                // ===== SYSTÈME DE CONCORDANCE =====
                let total = parseInt(d.quantiteEnvoyee) || 1;
                let sCh = d.colisScannes_chargement ? d.colisScannes_chargement.length : (d.colisScannes && d.status === 'Au chargement' ? d.colisScannes.length : 0);
                let sDe = d.colisScannes_dechargement ? d.colisScannes_dechargement.length : 0;
                let sLi = d.colisScannes_livre ? d.colisScannes_livre.length : 0;
                
                let alertHtml = '';
                
                if (sCh > 0 && sCh < total) alertHtml += `<div style="color:#c0392b; font-weight:bold; font-size:12px; margin-bottom:4px; background:#fce4ec; padding:4px 8px; border-radius:4px;">⚠️ Chargement incomplet (${sCh}/${total})</div>`;
                if (sDe > 0 && sDe < sCh) alertHtml += `<div style="color:#c0392b; font-weight:bold; font-size:12px; margin-bottom:4px; background:#fce4ec; padding:4px 8px; border-radius:4px;">❌ Manque au déchargement (${sDe}/${sCh})</div>`;
                if (sLi > 0 && sLi < sDe) alertHtml += `<div style="color:#e67e22; font-weight:bold; font-size:12px; margin-bottom:4px; background:#fff3e0; padding:4px 8px; border-radius:4px;">⚠️ Livraison incomplète (${sLi}/${sDe})</div>`;
                
                if (sCh > 0 && sDe > sCh) alertHtml += `<div style="color:#8e44ad; font-weight:bold; font-size:12px; margin-bottom:4px; background:#f3e5f5; padding:4px 8px; border-radius:4px;">⚠️ Excédent au déchargement (${sDe} déchargés / ${sCh} chargés)</div>`;
                
                if (sCh === total && sDe === total && sLi === total) alertHtml = `<div style="color:#27ae60; font-weight:bold; font-size:12px;">✅ Tout est complet</div>`;
                else if (!alertHtml) {
                    if (sCh === total && sDe === 0) alertHtml = `<div style="color:#15609e; font-weight:bold; font-size:12px;">✅ Chargé complet</div>`;
                    else if (sDe === total && sLi === 0) alertHtml = `<div style="color:#15609e; font-weight:bold; font-size:12px;">✅ Déchargé complet</div>`;
                    else alertHtml = `<span style="color:#888; font-size:12px;">Scan en cours...</span>`;
                }
                
                const safeData = encodeURIComponent(JSON.stringify(d));
                html += `<tr class="interactive-table-row" onclick="ouvrirDetails('${safeData}')">
                    <td data-label="Date">${dateStr}</td>
                    <td data-label="Réf."><strong>${d.reference}</strong></td>
                    <td data-label="Conteneur">${d.numBL || '-'}</td>
                    <td data-label="Client">${d.nom} ${d.prenom}</td>
                    <td data-label="Statut"><span class="status-badge" style="background:#15609e;">${d.status || 'En cours'}</span></td>
                    <td data-label="Photos">${photosHtml}</td>
                    <td data-label="Concordance">${alertHtml}</td>
                </tr>`;
            }
        });
        
        if (!html) html = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">Aucun scan ou photo trouvé.</td></tr>';
        tb.innerHTML = html;
    } catch(e) {
        console.error(e);
        tb.innerHTML = `<tr><td colspan="7" style="color:red;text-align:center;">Erreur : ${e.message}</td></tr>`;
    }
}

function ouvrirApercuPhoto(url) {
    document.getElementById('image-en-grand').src = url;
    document.getElementById('modal-photo').style.display = 'flex';
}

function fermerModalPhoto(e) {
    const modal = document.getElementById('modal-photo');
    if (!e || e.target === modal || e.target.classList.contains('modal-close')) {
        modal.style.display = 'none';
    }
}

function ouvrirDetails(dataEnc) {
    const d = JSON.parse(decodeURIComponent(dataEnc));
    const content = document.getElementById('details-listing-content');
    
    let total = parseInt(d.quantiteEnvoyee) || 1;
    let sCh = d.colisScannes_chargement || (d.colisScannes && d.status === 'Au chargement' ? d.colisScannes : []) || [];
    let sDe = d.colisScannes_dechargement || [];
    let sLi = d.colisScannes_livraison || [];
    let sLivre = d.colisScannes_livre || [];
    
    let buildChecklist = (title, arr, color) => {
        let html = `<div style="margin-top:10px;"><strong>${title} :</strong> <span style="font-size:12px; color:#555;">(${arr.length}/${total})</span><div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">`;
        for(let i=1; i<=total; i++) {
            let icon = arr.includes(i) ? '✅' : '⏳';
            let bg = arr.includes(i) ? color : '#f0f0f0';
            let textCol = arr.includes(i) ? '#fff' : '#888';
            html += `<span style="background:${bg}; color:${textCol}; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold;">${icon} Colis ${i}</span>`;
        }
        html += `</div></div>`;
        return html;
    };
    
    let html = `
        <div style="background:#f8f9fa; padding:12px; border-radius:8px; margin-bottom:15px; font-size:14px; line-height:1.6; border:1px solid #eee;">
            <div style="margin-bottom:4px;">👤 <strong>Client :</strong> ${d.nom} ${d.prenom}</div>
            <div style="margin-bottom:4px;">🏷️ <strong>Référence :</strong> <span style="color:#15609e; font-weight:bold;">${d.reference}</span></div>
            <div style="margin-bottom:4px;">📦 <strong>Description :</strong> ${d.description || '-'}</div>
            <div>⚖️ <strong>Quantité totale :</strong> ${total} colis</div>
        </div>
        <h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:5px; color:#333;">Traçabilité des scans</h4>
    `;
    
    html += buildChecklist('🇨🇳 Chargement (Chine)', sCh, '#f39c12');
    html += buildChecklist('🇨🇮 Déchargement (Abidjan)', sDe, '#17a2b8');
    if(sLi.length > 0) html += buildChecklist('🛵 En Livraison', sLi, '#8e44ad');
    if(sLivre.length > 0) html += buildChecklist('✅ Livré au client', sLivre, '#27ae60');
    
    html += `<h4 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-top:15px; margin-bottom:5px; color:#333;">Preuves visuelles (Photos)</h4>`;
    
    let hasPhotos = false;
    const addPhotos = (urls, label) => {
        if(urls && urls.length > 0) {
            hasPhotos = true;
            html += `<div style="margin-top:10px;"><strong>${label} :</strong><br><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">`;
            html += urls.map(url => `<img src="${url}" onclick="ouvrirApercuPhoto('${url}')" style="width:70px;height:70px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #ccc;box-shadow:0 2px 4px rgba(0,0,0,0.1);">`).join('');
            html += `</div></div>`;
        }
    };
    addPhotos(d.photos_chargement || d.photosChargement, '📸 Chargement');
    addPhotos(d.photos_dechargement, '📸 Déchargement');
    addPhotos(d.photos_livraison, '📸 Livraison');
    addPhotos(d.photos_livre, '📸 Livré');
    
    if(!hasPhotos) html += `<div style="color:#888; font-style:italic; margin-top:10px;">Aucune photo attachée à ce colis.</div>`;
    
    content.innerHTML = html;
    document.getElementById('modal-details-listing').style.display = 'flex';
}

function fermerModalDetails(e) {
    const modal = document.getElementById('modal-details-listing');
    if (!e || e.target === modal || e.target.classList.contains('modal-close')) {
        modal.style.display = 'none';
    }
}