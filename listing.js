document.addEventListener('DOMContentLoaded', () => {
    chargerListing();
});

async function chargerListing() {
    const tb = document.getElementById('tbody-listing');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">⏳ Récupération du listing...</td></tr>';
    
    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(200).get();
        let html = '';
        
        snap.forEach(doc => {
            const d = doc.data();
            
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
                        photosHtml += urls.map(url => `<img src="${url}" onclick="ouvrirApercuPhoto('${url}')" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #ddd;margin-right:4px;" title="Cliquer pour agrandir">`).join('');
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
                
                html += `<tr>
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