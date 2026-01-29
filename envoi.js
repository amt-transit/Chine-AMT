// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\envoi.js

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadAllClientsForAutocomplete();
    
    // Auto-remplir la date d'aujourd'hui
    const dateInput = document.getElementById('date-envoi');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    // Autocomplete
    const ni = document.getElementById('client-nom');
    if(ni) { 
        ni.addEventListener('input', ()=>{ 
            const q = ni.value.toLowerCase(); 
            const b = document.getElementById('autocomplete-suggestions'); 
            if(q.length<1) { b.style.display='none'; return; } 
            const m = allPastClients.filter(c=>c.nom.toLowerCase().startsWith(q)); 
            showSuggestions(m); 
        }); 
        document.addEventListener('click', e=>{if(!e.target.closest('.autocomplete-container')) document.getElementById('autocomplete-suggestions').style.display='none';}); 
    }

    // Photos
    const photosInput = document.getElementById('photos-colis');
    if(photosInput) {
        photosInput.addEventListener('change', function() {
            const d = document.getElementById('apercu-photos'); if(d) d.innerHTML='';
            Array.from(this.files).forEach(f => {
                if(f.type.startsWith('image/')){ const r=new FileReader(); r.onload=e=>{const i=document.createElement('img');i.src=e.target.result;d.appendChild(i);}; r.readAsDataURL(f); }
            });
        });
    }
});

// --- LOGIQUE METIER ENVOI ---

// Nouvelle fonction pour gérer la sélection visuelle (Cartes)
function selectType(type, element) {
    // 1. Mettre à jour l'input caché
    document.getElementById('type-envoi').value = type;
    
    // 2. Gérer l'aspect visuel (classe .selected)
    document.querySelectorAll('.type-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
    
    // 3. Déclencher la logique existante de changement de labels
    gererChampsEnvoi();
}

function gererChampsEnvoi(){
    const t = document.getElementById('type-envoi').value;
    const lbl = document.getElementById('label-sub-poids-vol');
    const unit = document.getElementById('display-unit');
    if(t.startsWith('aerien')) { lbl.innerText = "Poids (Kg)"; unit.innerText = "Kg"; } 
    else { lbl.innerText = "Volume (CBM)"; unit.innerText = "CBM"; }
    recalculerTotalClient();
}

function ajouterSousColis() {
    const desc = document.getElementById('sub-desc').value || "Colis";
    const qte = parseInt(document.getElementById('sub-qte').value) || 0;
    const val = parseFloat(document.getElementById('sub-poids-vol').value) || 0;
    if(qte <= 0 || val <= 0) { alert("Quantité et Valeur doivent être > 0"); return; }
    sousColisList.push({ desc: desc, qte: qte, val: val });
    document.getElementById('sub-desc').value = ""; document.getElementById('sub-qte').value = "1"; document.getElementById('sub-poids-vol').value = "";
    updateSousColisTable();
}

function updateSousColisTable() {
    const tbody = document.getElementById('tbody-sub-colis');
    let html = '';
    sousColisList.forEach((item, index) => {
        html += `<tr><td>${item.desc}</td><td>${item.qte}</td><td>${item.val}</td><td><button class="btn-suppr-small" onclick="supprimerSousColis(${index})">X</button></td></tr>`;
    });
    tbody.innerHTML = html;
    recalculerTotalClient();
}

function supprimerSousColis(index) { sousColisList.splice(index, 1); updateSousColisTable(); }

function recalculerTotalClient() {
    let totalQ = 0; let totalV = 0;
    sousColisList.forEach(item => { totalQ += item.qte; totalV += item.val; });
    document.getElementById('display-total-qte').innerText = totalQ;
    document.getElementById('display-total-vol').innerText = totalV.toFixed(3);
    const type = document.getElementById('type-envoi').value;
    let prix = 0;
    if (type === 'aerien_normal') prix = totalV * PRIX_AERIEN_NORMAL;
    else if (type === 'aerien_express') prix = totalV * PRIX_AERIEN_EXPRESS;
    else if (type === 'maritime') prix = totalV * PRIX_MARITIME_CBM;
    document.getElementById('prix-calcule').innerText = formatArgent(prix) + ' CFA';
}

function ajouterClientALaListe() {
    const n = document.getElementById('client-nom').value;
    const typeEnvoi = document.getElementById('type-envoi').value;
    
    if (!typeEnvoi) { alert("Veuillez d'abord sélectionner un Mode de Transport (Avion/Bateau) en haut."); return; }
    if (!n) { alert('Nom du client requis'); return; }
    
    let details = [...sousColisList];
    const totalQte = parseInt(document.getElementById('display-total-qte').innerText) || 0;
    const totalVal = parseFloat(document.getElementById('display-total-vol').innerText) || 0;
    
    if(totalQte === 0) { alert("Veuillez ajouter au moins un colis."); return; }

    const descriptionResume = details.length > 0 ? details.map(item => item.desc).join(', ') : "Colis divers";

    let poids = 0; let volume = 0;
    if (typeEnvoi.startsWith('aerien')) poids = totalVal; else volume = totalVal;

    envoiEnCours.push({
        expediteur: document.getElementById('expediteur-nom').value,
        telExpediteur: document.getElementById('expediteur-tel').value,
        nom: n, 
        prenom: document.getElementById('client-prenom').value, 
        tel: document.getElementById('client-tel').value,
        description: descriptionResume, 
        detailsColis: details,
        quantiteEnvoyee: totalQte, 
        poidsEnvoye: poids, 
        volumeEnvoye: volume,
        prixEstime: document.getElementById('prix-calcule').innerText,
        photosFiles: Array.from(document.getElementById('photos-colis').files)
    });

    mettreAJourTableauEnvoiEnCours();
    
    document.getElementById('form-ajout-client').reset();
    document.getElementById('expediteur-nom').value = "AMT TRANSIT CARGO"; 
    document.getElementById('expediteur-tel').value = "+225 0703165050";
    document.getElementById('apercu-photos').innerHTML = '';
    sousColisList = []; updateSousColisTable(); 
    document.getElementById('autocomplete-suggestions').style.display='none';
}

function mettreAJourTableauEnvoiEnCours(){
    const tb = document.getElementById('tbody-envoi-en-cours'); tb.innerHTML='';
    if(envoiEnCours.length===0) { tb.innerHTML='<tr><td colspan="7" style="text-align:center">Aucun client.</td></tr>'; return; }
    let html = '';
    envoiEnCours.forEach((c,i)=>{
        const t = document.getElementById('type-envoi').value;
        let unit = t.startsWith('aerien') ? ' Kg' : ' CBM';
        let pv = t.startsWith('aerien') ? c.poidsEnvoye : c.volumeEnvoye;
        html +=`<tr>
            <td>${c.expediteur}</td>
            <td>${c.nom} ${c.prenom}</td>
            <td>${c.tel}</td>
            <td>${c.quantiteEnvoyee}</td>
            <td>${pv} ${unit}</td>
            <td>${c.prixEstime}</td>
            <td>
                <button class="btn-action" style="background:#f39c12;color:white;" onclick="editerEnvoi(${i})"><i class="fas fa-edit"></i></button>
                <button class="btn-action btn-supprimer" onclick="envoiEnCours.splice(${i},1);mettreAJourTableauEnvoiEnCours()">X</button>
            </td>
        </tr>`;
    });
    tb.innerHTML = html;
}

function editerEnvoi(i) {
    const c = envoiEnCours[i];
    document.getElementById('client-nom').value = c.nom; document.getElementById('client-prenom').value = c.prenom; document.getElementById('client-tel').value = c.tel;
    document.getElementById('expediteur-nom').value = c.expediteur; document.getElementById('expediteur-tel').value = c.telExpediteur;
    if (c.detailsColis && c.detailsColis.length > 0) { sousColisList = [...c.detailsColis]; } 
    else { sousColisList = [{ desc: c.description, qte: parseInt(c.quantiteEnvoyee), val: c.poidsEnvoye > 0 ? c.poidsEnvoye : c.volumeEnvoye }]; }
    updateSousColisTable();
    envoiEnCours.splice(i, 1); mettreAJourTableauEnvoiEnCours();
}

async function validerEnvoiGroupe() {
    if (envoiEnCours.length === 0) return;
    const btn = document.getElementById('btn-valider-envoi-groupe');
    btn.disabled = true; btn.innerText = 'En cours...';

    try {
        const d = document.getElementById('date-envoi').value;
        
        if (d) {
            const lastSnap = await db.collection('expeditions').orderBy('date', 'desc').limit(1).get();
            if (!lastSnap.empty) {
                const lastDate = lastSnap.docs[0].data().date;
                if (lastDate && d < lastDate) {
                    const dStr = d.split('-').reverse().join('/');
                    const lastStr = lastDate.split('-').reverse().join('/');
                    if (!confirm(`⚠️ ATTENTION : La date d'envoi (${dStr}) est antérieure au dernier envoi enregistré (${lastStr}).\n\nÊtes-vous sûr de vouloir continuer ?`)) {
                        btn.disabled = false; btn.innerText = 'Valider l\'envoi Global'; return;
                    }
                }
            }
        }

        const t = document.getElementById('type-envoi').value;
        let refG = ""; 
        const pref = t.startsWith('aerien') ? 'AIR' : 'MRT';
        const now = new Date();
        const batchId = `${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        
        const batch = db.batch();

        for (let i = 0; i < envoiEnCours.length; i++) {
            const c = envoiEnCours[i];
            const dateFinale = c.dateImportee ? c.dateImportee : d;
            const idx = String(i+1).padStart(2, '0');
            const newRef = db.collection('expeditions').doc();
            
            batch.set(newRef, {
                reference: `${pref}-${batchId}-${idx}`, 
                refGroupe: refG, 
                date: dateFinale, 
                type: t,
                nom: c.nom, prenom: c.prenom, tel: c.tel, description: c.description, detailsColis: c.detailsColis || [],
                expediteur: c.expediteur, telExpediteur: c.telExpediteur,
                quantiteEnvoyee: parseInt(c.quantiteEnvoyee) || 0, 
                poidsEnvoye: c.poidsEnvoye, volumeEnvoye: c.volumeEnvoye,
                prixEstime: c.prixEstime, remise: 0, 
                creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'En attente', quantiteRecue: 0, poidsRecu: 0, montantPaye: 0, historiquePaiements: [], photosURLs: []
            });
        }
        await batch.commit();
        alert(`Envoi validé avec succès !`);
        envoiEnCours = []; mettreAJourTableauEnvoiEnCours(); document.getElementById('form-envoi-commun').reset();
    } catch (e) { alert("Erreur : " + e.message); console.error(e); } 
    finally { btn.disabled = false; btn.innerText = 'Valider l\'envoi Global'; }
}

async function loadAllClientsForAutocomplete(){
    try{ 
        const s=await db.collection('expeditions').orderBy('creeLe', 'desc').limit(1000).get(); 
        const m=new Map(); 
        s.forEach(d=>{
            const da=d.data(); 
            if(da.tel && !m.has(da.tel)) m.set(da.tel, {nom: da.nom, prenom: da.prenom, tel: da.tel});
        }); 
        allPastClients=Array.from(m.values()); 
    }catch(e){}
}

function showSuggestions(m){
    const b=document.getElementById('autocomplete-suggestions'); b.innerHTML=''; if(m.length===0){b.style.display='none';return;}
    m.slice(0,5).forEach(c=>{
        const d=document.createElement('div'); d.innerHTML=`<strong>${c.nom}</strong> ${c.prenom}`;
        d.onclick=()=>{document.getElementById('client-nom').value=c.nom;document.getElementById('client-prenom').value=c.prenom;document.getElementById('client-tel').value=c.tel;b.style.display='none';};
        b.appendChild(d);
    }); b.style.display='block';
}
