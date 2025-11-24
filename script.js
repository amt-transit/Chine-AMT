// =======================================================
// 1. CONFIGURATION FIREBASE
// =======================================================
const firebaseConfig = {
  apiKey: "AIzaSyA0_2U_6muRzphWlvKZN-lP6mytzaKIj1A",
  authDomain: "chine-amt.firebaseapp.com",
  projectId: "chine-amt",
  storageBucket: "chine-amt.firebasestorage.app",
  messagingSenderId: "864644062373",
  appId: "1:864644062373:web:a3066965408fdd9387c14c"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// =======================================================
// 2. VARIABLES GLOBALES
// =======================================================
let envoiEnCours = [];
let clientsCharges = [];
let allPastClients = [];
let currentUser = null;
let currentRole = null;

const PRIX_AERIEN_NORMAL = 10000;
const PRIX_AERIEN_EXPRESS = 12000;
const PRIX_MARITIME_CBM = 250000;

let currentReceptionType = 'maritime';
let currentHistoriqueType = 'maritime';
let currentComptaType = 'maritime';
let currentEnvoi = null;
let currentModifEnvoi = null;

function formatArgent(montant) {
    if (isNaN(montant)) return "0";
    return parseInt(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// =======================================================
// 3. NAVIGATION ET AUTH
// =======================================================
function ouvrirPage(event, nomPage) {
    const contents = document.getElementsByClassName("page-content");
    for (let i = 0; i < contents.length; i++) {
        if(contents[i]) contents[i].style.display = "none";
    }
    
    const links = document.getElementsByClassName("nav-link");
    for (let i = 0; i < links.length; i++) {
        if(links[i]) links[i].className = links[i].className.replace(" active", "");
    }
    
    const page = document.getElementById(nomPage);
    if (page) page.style.display = "block";
    
    if (event && event.currentTarget) event.currentTarget.className += " active";
    
    // Changement de titre sécurisé
    const agenceEl = document.getElementById('agence-nom');
    if (agenceEl) {
        if (nomPage === 'Envoi') {
            agenceEl.innerText = 'Chine';
            loadAllClientsForAutocomplete();
        } else if (nomPage === 'Historique') {
            agenceEl.innerText = 'Chine - Historique';
            ouvrirSousOngletHistorique('maritime');
        } else if (nomPage === 'Reception') {
            agenceEl.innerText = 'Abidjan';
            ouvrirSousOngletReception('maritime');
        } else if (nomPage === 'Comptabilite') {
            agenceEl.innerText = 'Abidjan - Compta';
            ouvrirSousOngletCompta('maritime');
        }
    }
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        auth.signInWithEmailAndPassword(email, pass).catch(err => {
            const errEl = document.getElementById('login-error');
            if(errEl) errEl.innerText = "Erreur: " + err.message;
        });
    });
}

auth.onAuthStateChanged(user => {
    const overlay = document.getElementById('login-overlay');
    const app = document.getElementById('app-container');
    const userDisplay = document.getElementById('user-display');

    if (user) {
        currentUser = user;
        if(overlay) overlay.style.display = 'none';
        if(app) app.style.display = 'block';
        
        if (user.email.includes('chine')) {
            currentRole = 'chine';
            if(userDisplay) userDisplay.innerText = "Agence Chine";
            const nR = document.getElementById('nav-reception'); if(nR) nR.style.display = 'none';
            const nC = document.getElementById('nav-compta'); if(nC) nC.style.display = 'none';
            ouvrirPage(null, 'Envoi');
        } else {
            currentRole = 'abidjan';
            if(userDisplay) userDisplay.innerText = "Agence Abidjan";
            const nR = document.getElementById('nav-reception'); if(nR) nR.style.display = 'inline-block';
            const nC = document.getElementById('nav-compta'); if(nC) nC.style.display = 'inline-block';
            ouvrirPage(null, 'Reception');
        }
    } else {
        if(overlay) overlay.style.display = 'flex';
        if(app) app.style.display = 'none';
    }
});

function deconnexion() { auth.signOut().then(() => window.location.reload()); }

// =======================================================
// FONCTIONS D'EXPORT (À PLACER AVANT LE DOMContentLoaded)
// =======================================================
function exporterExcel() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    // Ajout de "Téléphone" dans l'en-tête
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Client,Téléphone,Desc,Type,Qté,Poids,Prix,Statut\r\n";
    
    clientsCharges.forEach(c => {
        // Ajout de c.tel ici
        csvContent += `"${c.reference}","${c.date}","${c.nom}","${c.tel || ''}","${c.description}","${c.type}",${c.quantiteEnvoyee},"${c.poidsEnvoye||c.volumeEnvoye}","${c.prixEstime}","${c.status}"\r\n`;
    });
    
    var link = document.createElement("a"); 
    link.setAttribute("href", encodeURI(csvContent)); 
    link.setAttribute("download", "expeditions.csv"); 
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exporterPDF() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    const { jsPDF } = window.jspdf; 
    const doc = new jsPDF('l', 'mm', 'a4');
    
    // Ajout de "Tél" dans les headers
    const headers = [["Ref", "Date", "Client", "Tél", "Desc", "Type", "Qté", "Poids", "Prix", "Statut"]];
    
    const body = clientsCharges.map(c => [
        c.reference, 
        c.date, 
        c.nom, 
        c.tel || '', // Ajout du téléphone ici
        c.description, 
        c.type, 
        c.quantiteEnvoyee, 
        c.poidsEnvoye||c.volumeEnvoye, 
        formatArgent(c.prixEstime.replace(/\D/g,'')), 
        c.status
    ]);
    
    doc.autoTable({ head: headers, body: body, styles: { fontSize: 7 } }); 
    doc.save('expeditions.pdf');
}


// =======================================================
// 4. INITIALISATION (DOM READY)
// =======================================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink) activeLink.click();
    }, 10);
    loadAllClientsForAutocomplete();

    // --- PAGE ENVOI ---
    const typeEnvoiSelect = document.getElementById('type-envoi');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const photosInput = document.getElementById('photos-colis');
    const btnAjouterClient = document.getElementById('btn-ajouter-client');
    const btnValiderEnvoiGroupe = document.getElementById('btn-valider-envoi-groupe');

    if(typeEnvoiSelect) {
        typeEnvoiSelect.addEventListener('change', gererChampsEnvoi);
        if(poidsInput) poidsInput.addEventListener('input', calculerPrixClient);
        if(volumeInput) volumeInput.addEventListener('input', calculerPrixClient);
        gererChampsEnvoi();
    }

    if(photosInput) {
        photosInput.addEventListener('change', function() {
            const apercuDiv = document.getElementById('apercu-photos');
            if(apercuDiv) apercuDiv.innerHTML = '';
            if (this.files.length > 0) {
                Array.from(this.files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = e => {
                            const img = document.createElement('img'); img.src = e.target.result;
                            if(apercuDiv) apercuDiv.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        });
    }

    if(btnAjouterClient) btnAjouterClient.addEventListener('click', ajouterClientALaListe);
    if(btnValiderEnvoiGroupe) btnValiderEnvoiGroupe.addEventListener('click', validerEnvoiGroupe);

    // Recherche & Export
    const searchInput = document.getElementById('search-input');
    if(searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            const rows = document.getElementById('liste-clients-tbody').getElementsByTagName('tr');
            for(let row of rows) {
                if(row.cells.length < 2) continue;
                const txt = row.innerText.toLowerCase();
                row.style.display = txt.includes(query) ? "" : "none";
            }
        });
    }
    const btnExpPDF = document.getElementById('btn-export-pdf');
    const btnExpExcel = document.getElementById('btn-export-excel');
    if(btnExpPDF) btnExpPDF.addEventListener('click', exporterPDF);
    if(btnExpExcel) btnExpExcel.addEventListener('click', exporterExcel);

    // Autocomplete
    const nomInput = document.getElementById('client-nom');
    if(nomInput) {
        nomInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            const box = document.getElementById('autocomplete-suggestions');
            if (query.length < 1) { if(box) box.style.display = 'none'; return; }
            const matches = allPastClients.filter(c => c.nom.toLowerCase().startsWith(query));
            showSuggestions(matches);
        });
        document.addEventListener('click', e => {
            if(!e.target.closest('.autocomplete-container')) {
                const box = document.getElementById('autocomplete-suggestions');
                if(box) box.style.display = 'none';
            }
        });
    }

    // Modifs dynamiques
    const modifP = document.getElementById('modif-poids');
    const modifR = document.getElementById('modif-remise');
    if(modifP) modifP.oninput = calculerPrixModif;
    if(modifR) modifR.oninput = calculerPrixModif;
});

// --- FONCTIONS ENVOI ---
function gererChampsEnvoi() {
    const type = document.getElementById('type-envoi').value;
    const p = document.getElementById('champ-poids');
    const v = document.getElementById('champ-volume');
    const vi = document.getElementById('volume-envoye');
    const pi = document.getElementById('poids-envoye');
    
    if (type.startsWith('aerien')) {
        p.style.display='block'; v.style.display='none'; if(vi) vi.value=0;
    } else if (type==='maritime') {
        p.style.display='none'; v.style.display='block'; if(pi) pi.value=0;
    } else {
        p.style.display='none'; v.style.display='none';
    }
    calculerPrixClient();
}

function calculerPrixClient() {
    const type = document.getElementById('type-envoi').value;
    const p = parseFloat(document.getElementById('poids-envoye').value)||0;
    const v = parseFloat(document.getElementById('volume-envoye').value)||0;
    let prix = 0;
    if(type==='aerien_normal') prix = p * PRIX_AERIEN_NORMAL;
    else if(type==='aerien_express') prix = p * PRIX_AERIEN_EXPRESS;
    else if(type==='maritime') prix = v * PRIX_MARITIME_CBM;
    
    const el = document.getElementById('prix-calcule');
    if(el) el.innerText = formatArgent(prix) + ' CFA';
}

function ajouterClientALaListe() {
    const t = document.getElementById('type-envoi').value;
    const d = document.getElementById('date-envoi').value;
    if(!t||!d) { alert("Date et Type requis."); return; }
    const n = document.getElementById('client-nom').value;
    if(!n) { alert("Nom requis."); return; }
    
    const expN = document.getElementById('expediteur-nom').value || "AMT TRANSIT CARGO";
    const expT = document.getElementById('expediteur-tel').value || "+225 0703165050";

    const c = {
        expediteur: expN, telExpediteur: expT,
        nom: n,
        prenom: document.getElementById('client-prenom').value,
        tel: document.getElementById('client-tel').value,
        description: document.getElementById('client-desc').value,
        quantiteEnvoyee: document.getElementById('quantite-envoyee').value,
        poidsEnvoye: parseFloat(document.getElementById('poids-envoye').value)||0,
        volumeEnvoye: parseFloat(document.getElementById('volume-envoye').value)||0,
        prixEstime: document.getElementById('prix-calcule').innerText,
        photosFiles: Array.from(document.getElementById('photos-colis').files)
    };
    envoiEnCours.push(c);
    mettreAJourTableauEnvoiEnCours();
    document.getElementById('form-ajout-client').reset();
    
    // Remettre valeurs par défaut
    document.getElementById('expediteur-nom').value = "AMT TRANSIT CARGO";
    document.getElementById('expediteur-tel').value = "+225 0703165050";
    
    const ap = document.getElementById('apercu-photos');
    if(ap) ap.innerHTML='';
    calculerPrixClient();
}

function mettreAJourTableauEnvoiEnCours() {
    const tbody = document.getElementById('tbody-envoi-en-cours');
    if(!tbody) return;
    tbody.innerHTML = '';
    envoiEnCours.forEach((c, i) => {
        let pv = document.getElementById('type-envoi').value.startsWith('aerien') ? c.poidsEnvoye : c.volumeEnvoye;
        tbody.innerHTML += `<tr><td>${c.expediteur}</td><td>${c.nom}</td><td>${c.quantiteEnvoyee}</td><td>${pv}</td><td>${c.prixEstime}</td><td><button class="btn-action btn-supprimer" onclick="envoiEnCours.splice(${i},1);mettreAJourTableauEnvoiEnCours()">X</button></td></tr>`;
    });
}

async function validerEnvoiGroupe() {
    if(envoiEnCours.length===0) return;
    const btn = document.getElementById('btn-valider-envoi-groupe');
    btn.disabled=true; btn.innerText='En cours...';
    try {
        const d = document.getElementById('date-envoi').value;
        const t = document.getElementById('type-envoi').value;
        const refG = await genererRefGroupe(t);
        const pref = t.startsWith('aerien') ? 'AIR' : 'MRT';

        for(let i=0; i<envoiEnCours.length; i++) {
            const c = envoiEnCours[i];
            const idx = String(i+1).padStart(3,'0');
            const ref = `${pref}-${idx}-${refG}`;
            let photosURLs = [];
            
            await db.collection('expeditions').add({
                reference: ref, refGroupe: refG, date: d, type: t,
                nom: c.nom, prenom: c.prenom, tel: c.tel, description: c.description,
                expediteur: c.expediteur, telExpediteur: c.telExpediteur,
                quantiteEnvoyee: parseInt(c.quantiteEnvoyee)||0,
                poidsEnvoye: c.poidsEnvoye, volumeEnvoye: c.volumeEnvoye,
                prixEstime: c.prixEstime, remise: 0,
                creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'En attente', quantiteRecue: 0, poidsRecu: 0, montantPaye: 0, historiquePaiements: [], photosURLs: photosURLs
            });
        }
        alert('Groupe '+refG+' enregistré !');
        envoiEnCours = []; mettreAJourTableauEnvoiEnCours();
        document.getElementById('form-envoi-commun').reset();
        loadAllClientsForAutocomplete();
    } catch(e) { alert(e.message); }
    finally { btn.disabled=false; btn.innerText='Valider'; }
}

async function genererRefGroupe(t) {
    const s = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(50).get();
    let max=0; s.forEach(d=>{ let g=d.data().refGroupe||""; if(g.startsWith('EV')){ let n=parseInt(g.replace('EV','')); if(n>max) max=n; } });
    return 'EV'+(max+1);
}

async function loadAllClientsForAutocomplete() {
    try {
        const s = await db.collection('expeditions').get();
        const m = new Map();
        s.forEach(d => { const da=d.data(); if(da.tel) m.set(da.tel, {nom:da.nom, prenom:da.prenom, tel:da.tel}); });
        allPastClients = Array.from(m.values());
    } catch(e) {}
}

function showSuggestions(matches) {
    const box = document.getElementById('autocomplete-suggestions');
    if(box) box.innerHTML = '';
    if (matches.length === 0) { if(box) box.style.display = 'none'; return; }
    matches.slice(0, 5).forEach(c => {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${c.nom}</strong> ${c.prenom}`;
        div.onclick = () => {
            document.getElementById('client-nom').value = c.nom;
            document.getElementById('client-prenom').value = c.prenom||'';
            document.getElementById('client-tel').value = c.tel||'';
            box.style.display = 'none';
        };
        box.appendChild(div);
    });
    if(box) box.style.display = 'block';
}

// =======================================================
// 5. HISTORIQUE (SOUS-ONGLETS)
// =======================================================
function ouvrirSousOngletHistorique(type) {
    currentHistoriqueType = type;
    const b1 = document.getElementById('btn-hist-maritime');
    const b2 = document.getElementById('btn-hist-aerien');
    if(b1&&b2) { 
        if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} 
        else {b1.classList.remove('active');b2.classList.add('active');} 
    }
    chargerHistoriqueChine();
}

async function chargerHistoriqueChine() {
    const tb = document.getElementById('tbody-historique-chine');
    if(!tb) return;
    tb.innerHTML = '<tr><td colspan="8">Chargement...</td></tr>';
    
    const s = document.getElementById('search-hist-chine');
    if(s) s.oninput = () => { const q = s.value.toLowerCase(); Array.from(tb.rows).forEach(r => r.style.display = r.innerText.toLowerCase().includes(q) ? "" : "none"); };

    try {
        const snap = await db.collection('expeditions').limit(200).get();
        let docs=[]; snap.forEach(d=>docs.push({id:d.id, ...d.data()}));
        docs.sort((a,b)=>(b.creeLe?b.creeLe.seconds:0)-(a.creeLe?a.creeLe.seconds:0));
        
        tb.innerHTML='';
        docs.forEach(d => {
            let m = false;
            if(currentHistoriqueType==='maritime' && d.type==='maritime') m=true;
            if(currentHistoriqueType==='aerien' && (d.type||"").startsWith('aerien')) m=true;
            
            if(m) {
                const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-';
                let pv = (d.type||"").startsWith('aerien') ? d.poidsEnvoye+' Kg' : d.volumeEnvoye+' CBM';
                let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
                let final = pB - (d.remise||0);
                let mod = d.dernierModificateur ? `<span class="modif-info">Par ${d.dernierModificateur}</span>` : '-';
                
                // SÉCURISATION DES DONNÉES POUR ONCLICK
                const safeData = encodeURIComponent(JSON.stringify({id:d.id, ...d}));
                
                const tr = document.createElement('tr');
                tr.className = 'interactive-table-row';
                tr.innerHTML = `<td>${d.reference}</td><td>${dateStr}</td><td>${d.nom}</td><td>${d.quantiteEnvoyee}</td><td>${pv}</td><td>${formatArgent(final)} CFA</td><td>${mod}</td>`;
                tr.onclick = () => ouvrirModalModifViaData(safeData);
                tb.appendChild(tr);
            }
        });
    } catch(e) { console.error(e); }
}

function ouvrirModalModifViaData(encodedData) {
    const envoi = JSON.parse(decodeURIComponent(encodedData));
    ouvrirModalModif(envoi);
}

const modalModif = document.getElementById('modal-modif-chine');
function ouvrirModalModif(envoi) {
    currentModifEnvoi = envoi;
    modalModif.style.display='flex';
    document.getElementById('modif-client-titre').innerText = envoi.nom;
    document.getElementById('modif-ref-titre').innerText = envoi.reference;
    document.getElementById('modif-desc-titre').innerText = envoi.description;
    
    document.getElementById('modif-qte').value = envoi.quantiteEnvoyee;
    document.getElementById('modif-remise').value = envoi.remise||0;
    const elP = document.getElementById('modif-poids');
    elP.value = (envoi.type||"").startsWith('aerien') ? envoi.poidsEnvoye : envoi.volumeEnvoye;
    calculerPrixModif();
}

function calculerPrixModif() {
    if(!currentModifEnvoi) return;
    const v = parseFloat(document.getElementById('modif-poids').value)||0;
    const r = parseInt(document.getElementById('modif-remise').value)||0;
    let t = 0;
    if(currentModifEnvoi.type==='aerien_normal') t=PRIX_AERIEN_NORMAL;
    else if(currentModifEnvoi.type==='aerien_express') t=PRIX_AERIEN_EXPRESS;
    else t=PRIX_MARITIME_CBM;
    document.getElementById('modif-prix-final').value = formatArgent((v*t)-r)+' CFA';
}

async function sauvegarderModificationChine() {
    if(!currentModifEnvoi) return;
    const q = parseInt(document.getElementById('modif-qte').value)||0;
    const v = parseFloat(document.getElementById('modif-poids').value)||0;
    const r = parseInt(document.getElementById('modif-remise').value)||0;
    
    let up = { quantiteEnvoyee: q, remise: r, dernierModificateur: currentRole==='chine'?'Agence Chine':'Agence Abidjan', dateModification: firebase.firestore.FieldValue.serverTimestamp() };
    if((currentModifEnvoi.type||"").startsWith('aerien')) up.poidsEnvoye=v; else up.volumeEnvoye=v;
    
    let t = 0;
    if(currentModifEnvoi.type==='aerien_normal') t=PRIX_AERIEN_NORMAL;
    else if(currentModifEnvoi.type==='aerien_express') t=PRIX_AERIEN_EXPRESS;
    else t=PRIX_MARITIME_CBM;
    up.prixEstime = formatArgent(v * t) + ' CFA';

    try {
        await db.collection('expeditions').doc(currentModifEnvoi.id).update(up);
        alert('Modifié.'); modalModif.style.display='none'; chargerHistoriqueChine();
    } catch(e) { alert(e.message); }
}
function fermerModalModif(e) { if(e.target===modalModif||e.target.classList.contains('modal-close')) modalModif.style.display='none'; }

// =======================================================
// 6. RECEPTION
// =======================================================
function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    const b1 = document.getElementById('btn-rec-maritime');
    const b2 = document.getElementById('btn-rec-aerien');
    if(b1&&b2) { 
        if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} 
        else {b1.classList.remove('active');b2.classList.add('active');} 
    }
    chargerClients();
}

async function chargerClients() {
    const tb = document.getElementById('liste-clients-tbody');
    if(!tb) return;
    tb.innerHTML='<tr><td colspan="9">Chargement...</td></tr>';
    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        tb.innerHTML=''; clientsCharges=[];
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentReceptionType==='maritime' && data.type==='maritime') match=true;
            if(currentReceptionType==='aerien' && (data.type||"").startsWith('aerien')) match=true;
            if(match) {
                clientsCharges.push({id:d.id, ...data});
                let pv = (data.type||"").startsWith('aerien') ? data.poidsEnvoye : data.volumeEnvoye;
                let st = data.status || 'En attente';
                let cl = st.includes('Conforme')?'status-conforme':st.includes('Ecart')?'status-ecart':st.includes('Supérieur')?'status-superieur':'status-attente';
                let pN = (parseInt((data.prixEstime||"0").replace(/\D/g,''))||0) - (data.remise||0);
                let dej = parseInt(data.montantPaye)||0;
                let res = pN - dej;

                // SÉCURISATION DES DONNÉES POUR ONCLICK
                const safeData = encodeURIComponent(JSON.stringify({id:d.id, ...data}));

                const tr = document.createElement('tr');
                tr.className='interactive-table-row';
                tr.innerHTML=`<td>${data.reference}</td><td>${data.date}</td><td>${data.nom}</td><td>${data.description||''}</td><td>${data.type}</td><td>${data.quantiteEnvoyee}</td><td>${pv}</td><td>${formatArgent(res)} CFA</td><td><span class="status-badge ${cl}">${st}</span></td>`;
                tr.onclick = () => selectionnerClientViaData(safeData);
                tb.appendChild(tr);
            }
        });
    } catch(e) { console.error(e); }
}

function selectionnerClientViaData(encodedData) {
    const envoi = JSON.parse(decodeURIComponent(encodedData));
    selectionnerClient(envoi);
}

// Modal Reception Variables
const modalBackdrop = document.getElementById('modal-backdrop');
function selectionnerClient(envoi) {
    currentEnvoi = envoi;
    modalBackdrop.style.display='flex';
    
    const set = (id,v) => { const e = document.getElementById(id); if(e) e.innerText=v; };
    set('client-selectionne', envoi.nom);
    set('ref-attendue', envoi.reference);
    set('desc-attendue', envoi.description);
    set('tel-attendue', envoi.tel);
    const tEl = document.getElementById('tel-attendu'); if(tEl) tEl.innerText = envoi.tel;
    set('qte-attendue', (envoi.quantiteEnvoyee||0)+' colis');

    let isAir = (envoi.type||"").startsWith('aerien');
    set('poids-attendu', (isAir?envoi.poidsEnvoye:envoi.volumeEnvoye) + (isAir?' Kg':' CBM'));

    let pB = parseInt((envoi.prixEstime||"0").replace(/\D/g,''))||0;
    let tot = pB - (envoi.remise||0);
    let dej = parseInt(envoi.montantPaye)||0;
    let res = tot - dej;
    
    set('prix-attendu', formatArgent(tot)+' CFA');
    const elR = document.getElementById('prix-restant');
    if(elR) {
        if(res<=0) { elR.innerText="SOLDÉ"; elR.style.color="green"; document.getElementById('montant-paye').value=0; }
        else { elR.innerText=formatArgent(res)+' CFA'; elR.style.color="#dc3545"; document.getElementById('montant-paye').value=res; }
    }

    const phDiv = document.getElementById('photos-recues-apercu');
    if(phDiv) {
        phDiv.innerHTML = '';
        if(envoi.photosURLs && envoi.photosURLs.length > 0) {
            document.getElementById('photos-recues-container').style.display='block';
            envoi.photosURLs.forEach(u => { const i=document.createElement('img'); i.src=u; phDiv.appendChild(i); });
        } else document.getElementById('photos-recues-container').style.display='none';
    }

    document.getElementById('quantite-recue').value='';
    document.getElementById('poids-recu').value='';
    const lb = document.getElementById('label-poids-recu');
    if(lb) lb.innerText = isAir ? "Poids Reçu (Kg)" : "Vol Reçu (CBM)";

    updateModalStatus(envoi);
}

function updateModalStatus(envoi) {
    const st = envoi.status || 'En attente';
    const el = document.getElementById('reception-status');
    if(el) {
        el.innerText = st;
        el.className = 'status-badge ' + (st.includes('Conforme')?'status-conforme':st.includes('Ecart')?'status-ecart':'status-attente');
    }
    const sum = document.getElementById('reception-summary');
    if(sum) sum.innerHTML = `Reçu: <strong>${envoi.quantiteRecue||0} colis</strong> | <strong>${envoi.poidsRecu||0}</strong>`;
}
function fermerModal(e) { if(e.target===modalBackdrop||e.target.classList.contains('modal-close')||e.target.classList.contains('btn-secondaire')) modalBackdrop.style.display='none'; }

async function enregistrerReception() {
    if(!currentEnvoi) return;
    const q = parseInt(document.getElementById('quantite-recue').value)||0;
    const p = parseFloat(document.getElementById('poids-recu').value)||0;
    const m = parseInt(document.getElementById('montant-paye').value)||0;
    const via = document.getElementById('moyen-paiement').value;
    
    const nQ = (currentEnvoi.quantiteRecue||0)+q;
    const nP = (currentEnvoi.poidsRecu||0)+p;
    const nM = (currentEnvoi.montantPaye||0)+m;
    
    let st = 'Reçu - Conforme';
    const diffQ = nQ - currentEnvoi.quantiteEnvoyee;
    const diffP = nP - ((currentEnvoi.type||"").startsWith('aerien')?currentEnvoi.poidsEnvoye:currentEnvoi.volumeEnvoye);
    
    if(diffQ < 0) st = 'Reçu - Ecart';
    else if(diffQ > 0) st = 'Reçu - Supérieur';
    else { if(Math.abs(diffP) > 0.1) st = (diffP>0?'Reçu - Supérieur':'Reçu - Ecart'); else st = 'Reçu - Conforme'; }
    
    let agent = currentUser ? (currentRole==='abidjan'?"AGENCE ABIDJAN":currentUser.email) : "Inconnu";
    let up = { quantiteRecue:nQ, poidsRecu:nP, montantPaye:nM, status:st, moyenPaiement:via, datePaiement: firebase.firestore.FieldValue.serverTimestamp() };
    if(m>0) up.historiquePaiements = firebase.firestore.FieldValue.arrayUnion({ date: firebase.firestore.Timestamp.now(), montant:m, moyen:via, agent:agent });
    
    await db.collection('expeditions').doc(currentEnvoi.id).update(up);
    alert('Validé'); modalBackdrop.style.display='none'; chargerClients();
}

// =======================================================
// 7. COMPTA
// =======================================================
function ouvrirSousOngletCompta(type) {
    currentComptaType = type;
    const b1 = document.querySelector('#Comptabilite .sub-nav-link:first-child');
    const b2 = document.querySelector('#Comptabilite .sub-nav-link:last-child');
    if(b1&&b2) { if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} else {b1.classList.remove('active');b2.classList.add('active');} }
    chargerCompta(type);
}

async function chargerCompta(type) {
    const tb = document.getElementById('tbody-compta'); if(!tb) return;
    tb.innerHTML='<tr><td colspan="10">Chargement...</td></tr>';
    try {
        const snapE = await db.collection('expeditions').get();
        const snapS = await db.collection('depenses').orderBy('date','desc').get();
        let items = [];
        snapE.forEach(d => {
            const data = d.data();
            let match=false;
            if(type==='maritime' && data.type==='maritime') match=true;
            if(type==='aerien' && (data.type||"").startsWith('aerien')) match=true;
            if(match) {
                let dRef = data.datePaiement ? data.datePaiement.toDate() : new Date(data.date);
                let grp = data.refGroupe || "ZZZ";
                if(grp==="ZZZ" && data.reference) { let pts=data.reference.split('-'); if(pts.length>0 && pts[pts.length-1].startsWith('EV')) grp=pts[pts.length-1]; }
                items.push({ ...data, id:d.id, isDep:false, sortDate:dRef, grp:grp, sortRef:data.reference||"ZZZ", hist:data.historiquePaiements||[] });
            }
        });
        snapS.forEach(d => {
            const data = d.data();
            if(data.type===type) {
                let g = (data.refGroupe && data.refGroupe.trim()) ? data.refGroupe.toUpperCase() : "ZZZ_GEN";
                items.push({ ...data, id:d.id, isDep:true, sortDate:new Date(data.date), grp:g, sortRef:"DEPENSE" });
            }
        });
        items.sort((a,b) => {
            if(a.grp.startsWith('EV') && b.grp.startsWith('EV')) return parseInt(a.grp.replace('EV','')) - parseInt(b.grp.replace('EV',''));
            return a.grp.localeCompare(b.grp);
        });
        
        let cred=0, caisse=0, bonus=0;
        let modes={Esp:0,Chq:0,OM:0,Wav:0,CB:0}, outM={Esp:0,Chq:0,OM:0,Wav:0,CB:0};
        let curGrp=null, grpDu=0, grpReste=0, grpEntree=0, grpSortie=0;
        tb.innerHTML='';
        
        items.forEach((it, idx) => {
            if(curGrp!==null && it.grp!==curGrp && !curGrp.startsWith('ZZZ')) {
                tb.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${curGrp}</td><td>${formatArgent(grpDu)}</td><td>${formatArgent(grpReste)}</td><td>${formatArgent(grpEntree)}</td><td>${formatArgent(grpSortie)}</td><td></td></tr>`;
                grpDu=0; grpReste=0; grpEntree=0; grpSortie=0;
            }
            curGrp = it.grp;
            
            let dS = it.sortDate.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
            let rowClass = `row-month-${it.sortDate.getMonth()}`;
            
            if(it.isDep) {
                let m = parseFloat(it.montant)||0;
                caisse -= m; grpSortie += m;
                let v = it.moyenPaiement || 'Espèce';
                if(v.includes('Chèque')) outM.Chq+=m; else if(v.includes('OM')) outM.OM+=m; else if(v.includes('Wave')) outM.Wav+=m; else if(v.includes('CB')) outM.CB+=m; else outM.Esp+=m;
                tb.innerHTML += `<tr class="${rowClass}"><td>${dS}</td><td>-</td><td>${it.motif}</td><td>Dépense</td><td>-</td><td>-</td><td>-</td><td class="text-red">${formatArgent(m)}</td><td><button class="btn-suppr-small" onclick="supprimerDepense('${it.id}')">X</button></td></tr>`;
            } else {
                let pB = parseInt((it.prixEstime||"0").replace(/\D/g,''))||0;
                let du = pB - (it.remise||0);
                let paye = 0;
                if(it.hist.length>0) it.hist.forEach(h => {
                    let v=parseFloat(h.montant); paye+=v;
                    let t=h.moyen||'Espèce';
                    if(t.includes('Chèque')) modes.Chq+=v; else if(t.includes('OM')) modes.OM+=v; else if(t.includes('Wave')) modes.Wav+=v; else if(t.includes('CB')) modes.CB+=v; else modes.Esp+=v;
                });
                else { paye = it.montantPaye||0; modes.Esp+=paye; }
                
                let r = du - paye;
                caisse += paye;
                if(r>0) cred+=r;
                let diff = paye - du;
                if(diff>0) bonus+=diff; else if(diff<0 && Math.abs(diff)<500) bonus+=diff;
                
                grpDu+=du; grpReste+=(r>0?r:0); grpEntree+=paye;

                // SÉCURISATION DATA POUR ONCLICK
                const safeData = encodeURIComponent(JSON.stringify({id:it.id, nom:it.nom, reference:it.reference, history:it.hist}));

                tb.innerHTML += `<tr class="${rowClass} interactive-table-row" onclick='voirHistoriquePaiementViaData("${safeData}")'><td>${dS}</td><td>${it.reference}</td><td>${it.description}</td><td>${it.nom}</td><td>${formatArgent(du)}</td><td style="color:${r>0?'red':'green'}">${formatArgent(r)}</td><td class="text-green">${formatArgent(paye)}</td><td>-</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
        });
        
        if(curGrp && !curGrp.startsWith('ZZZ')) tb.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${curGrp}</td><td>${formatArgent(grpDu)}</td><td>${formatArgent(grpReste)}</td><td>${formatArgent(grpEntree)}</td><td>${formatArgent(grpSortie)}</td><td></td></tr>`;

        document.getElementById('total-credit').innerText = formatArgent(cred)+' CFA';
        document.getElementById('total-caisse').innerText = formatArgent(caisse)+' CFA';
        document.getElementById('total-bonus').innerText = formatArgent(bonus)+' CFA';
        
        document.getElementById('pay-espece-in').innerText = formatArgent(modes.Esp); document.getElementById('pay-espece-out').innerText = formatArgent(outM.Esp);
        document.getElementById('pay-cheque-in').innerText = formatArgent(modes.Chq); document.getElementById('pay-cheque-out').innerText = formatArgent(outM.Chq);
        document.getElementById('pay-om-in').innerText = formatArgent(modes.OM); document.getElementById('pay-om-out').innerText = formatArgent(outM.OM);
        document.getElementById('pay-wave-in').innerText = formatArgent(modes.Wav); document.getElementById('pay-wave-out').innerText = formatArgent(outM.Wav);
        document.getElementById('pay-cb-in').innerText = formatArgent(modes.CB); document.getElementById('pay-cb-out').innerText = formatArgent(outM.CB);
        
        let tIn = Object.values(modes).reduce((a,b)=>a+b,0); let tOut = Object.values(outM).reduce((a,b)=>a+b,0);
        document.getElementById('pay-total-in').innerText = formatArgent(tIn); document.getElementById('pay-total-out').innerText = formatArgent(tOut);
    } catch(e) { console.error(e); }
}

function voirHistoriquePaiementViaData(encoded) {
    const item = JSON.parse(decodeURIComponent(encoded));
    voirHistoriquePaiement(item);
}

// MODALS UTILITAIRES
const modalHist = document.getElementById('modal-historique');
function voirHistoriquePaiement(item) {
    if(item.isDepense) return;
    modalHist.style.display='flex';
    document.getElementById('hist-client-nom').innerText = item.nom;
    document.getElementById('hist-ref').innerText = item.reference;
    const tb = document.getElementById('tbody-historique'); tb.innerHTML = '';
    if(item.history && item.history.length>0){
        item.history.forEach(h => {
            let d = new Date(h.date.seconds*1000).toLocaleDateString('fr-FR');
            let agent = h.agent || '-';
            tb.innerHTML += `<tr><td>${d}</td><td class="text-green">${formatArgent(parseInt(h.montant))} CFA</td><td>${h.moyen}</td></tr>`;
        });
    } else { tb.innerHTML='<tr><td colspan="3">Aucun historique.</td></tr>'; }
}
function fermerModalHistorique(e) { if(e.target===modalHist||e.target.classList.contains('modal-close')||e.target.classList.contains('btn-secondaire')) modalHist.style.display='none'; }

const modalDepense = document.getElementById('modal-depense');
function ouvrirModalDepense() { modalDepense.style.display = 'flex'; }
function fermerModalDepense(e) { if(e.target===modalDepense||e.target.classList.contains('modal-close')) modalDepense.style.display='none'; }
async function enregistrerDepense() {
    const date = document.getElementById('depense-date').value;
    const type = document.getElementById('depense-type').value;
    const motif = document.getElementById('depense-motif').value;
    const grp = document.getElementById('depense-groupe').value.toUpperCase().trim();
    const montant = parseFloat(document.getElementById('depense-montant').value)||0;
    const moyen = document.getElementById('depense-moyen').value;
    if(!date || !motif || montant<=0) { alert("Erreur saisie."); return; }
    try {
        await db.collection('depenses').add({ date, type, refGroupe: grp, motif, montant, moyenPaiement: moyen, creeLe: firebase.firestore.FieldValue.serverTimestamp() });
        alert("Enregistré."); modalDepense.style.display='none'; document.getElementById('form-depense').reset();
        if(document.getElementById('Comptabilite').style.display==='block') chargerCompta(currentComptaType);
    } catch(e){ alert(e.message); }
}
async function supprimerDepense(id) {
    if(confirm("Supprimer ?")) { await db.collection('depenses').doc(id).delete(); chargerCompta(currentComptaType); }
}

// CHARGEURS LOGO & PDF
function chargerLogo() {
    return new Promise((resolve) => {
        const img = new Image(); img.src = '/logo_amt.png';
        img.onload = () => resolve(img); img.onerror = () => resolve(null);
    });
}
async function genererEtiquette() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', [100, 150]);
    const logo = await chargerLogo();
    doc.setDrawColor(255, 165, 0); doc.setLineWidth(1.5); doc.rect(2, 2, 146, 96); doc.rect(4, 4, 142, 92);
    if (logo) doc.addImage(logo, 'PNG', 6, 6, 20, 20);
    doc.setTextColor(255, 140, 0); doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.text("amt TRANSIT CARGO", 30, 15);
    doc.setTextColor(0); doc.setFontSize(10); doc.text("+225 89 84 46 57", 30, 22);
    doc.setFontSize(30); doc.text("N", 130, 20);
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    let y = 35; const x = 10;
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("EXPEDITEUR", x, y); y+=4;
    doc.setFont("helvetica", "normal"); doc.text(`NOM ET PRENOM: ${currentEnvoi.expediteur || 'AMT TRANSIT CARGO'}`, x, y); doc.line(40, y+1, 140, y+1); y+=7;
    doc.text(`NUMERO: ${currentEnvoi.telExpediteur || '+225 0703165050'}`, x, y); doc.line(25, y+1, 140, y+1); y+=8;
    doc.setFont("helvetica", "bold"); doc.text("DESTINATAIRE", x, y); y+=4;
    doc.setFont("helvetica", "normal"); doc.text(`NOM ET PRENOM: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 5, y); doc.line(40, y+1, 140, y+1); y+=5;
    doc.text(`NUMERO: ${currentEnvoi.tel}`, 5, y); doc.line(25, y+1, 140, y+1); y+=5;
    let pv = (currentEnvoi.type||"").startsWith('aerien') ? `${currentEnvoi.poidsEnvoye} Kg` : `${currentEnvoi.volumeEnvoye} CBM`;
    doc.text(`KILOS: ${pv} / ${currentEnvoi.quantiteEnvoyee} Colis`, x, y); doc.line(20, y+1, 140, y+1); y+=8;
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("+8619515284352    +2250703165050", 40, 90);
    doc.save(`Etiquette_${currentEnvoi.nom}.pdf`);
}
async function genererFacture() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf; const doc = new jsPDF('p', 'mm', 'a4');
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'PNG', 10, 10, 30, 30);
    doc.setFontSize(18); doc.setTextColor(21, 96, 158); doc.setFont("helvetica", "bold"); doc.text("AMT TRANSIT CARGO", 50, 20);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Agence: Abidjan - Chine", 50, 26);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 50, 32);
    doc.line(10, 40, 200, 40);
    let y = 50; const gap = 7;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("INFORMATIONS CLIENT", 10, y); y+=6;
    doc.setFont("helvetica", "normal"); doc.text(`Nom: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y); y+=5; doc.text(`Tél: ${currentEnvoi.tel}`, 10, y); y+=5; doc.text(`Réf: ${currentEnvoi.reference}`, 10, y); y+=10;
    const headers1 = [["SERVICES", "DESCRIPTION", "QUANTITE", "PRIX UNITAIRE", "PRIX TOTAL"]];
    let pBrut = parseInt((currentEnvoi.prixEstime||"0").replace(/\D/g,''))||0;
    let pNet = pBrut - (currentEnvoi.remise||0);
    let vol = (currentEnvoi.type||"").startsWith('aerien') ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye;
    let pu = vol>0 ? (pNet/vol).toFixed(0) : 0;
    const data1 = [[ currentEnvoi.type, currentEnvoi.description, `${currentEnvoi.quantiteEnvoyee} / ${vol}`, formatArgent(pu), formatArgent(pNet) ]];
    doc.autoTable({ startY: y, head: headers1, body: data1, theme: 'grid', headStyles: { fillColor: [21, 96, 158] } });
    y = doc.lastAutoTable.finalY + 15;
    doc.text("HISTORIQUE DES PAIEMENTS", 10, y); y += 5;
    const headers2 = [["DATE", "PRIX TOTAL", "MNT. PAYE", "RESTANT", "AGENT"]];
    let histRows = [];
    let cumul = 0;
    if(currentEnvoi.historiquePaiements) {
        currentEnvoi.historiquePaiements.sort((a,b)=>a.date.seconds-b.date.seconds).forEach(h => {
            let m = parseInt(h.montant)||0; cumul += m;
            let d = new Date(h.date.seconds*1000).toLocaleString('fr-FR');
            histRows.push([ d, formatArgent(pNet), `${formatArgent(m)} (${h.moyen})`, formatArgent(pNet-cumul), h.agent||'-' ]);
        });
    } else {
        let deja = parseInt(currentEnvoi.montantPaye)||0;
        if(deja>0) histRows.push(["-", formatArgent(pNet), formatArgent(deja), formatArgent(pNet-deja), "Ancien"]);
    }
    doc.autoTable({ startY: y, head: headers2, body: histRows, theme: 'grid', headStyles: { fillColor: [50, 50, 50] } });
    y = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    let resteFinal = pNet - (parseInt(currentEnvoi.montantPaye)||0);
    if(resteFinal <= 0) doc.setTextColor(40, 167, 69); else doc.setTextColor(220, 53, 69);
    doc.text(`SOLDE À PAYER : ${formatArgent(resteFinal)} CFA`, 140, y, {align:'right'});
    doc.setTextColor(150); doc.setFontSize(8); doc.text("Merci de votre confiance - AMT Transit Cargo", 105, 280, {align: 'center'});
    doc.save(`Facture_${currentEnvoi.nom}.pdf`);
}