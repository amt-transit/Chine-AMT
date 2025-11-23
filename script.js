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
let currentComptaType = 'maritime';
let currentHistoriqueType = 'maritime';
let currentEnvoi = null;
let currentModifEnvoi = null;

function formatArgent(montant) {
    if (isNaN(montant)) return "0";
    return parseInt(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// =======================================================
// 3. AUTHENTIFICATION & NAVIGATION
// =======================================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        auth.signInWithEmailAndPassword(email, pass).catch(err => {
            const errDiv = document.getElementById('login-error');
            if(errDiv) errDiv.innerText = "Erreur: " + err.message;
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
            const navRec = document.getElementById('nav-reception');
            const navCompta = document.getElementById('nav-compta');
            if(navRec) navRec.style.display = 'none';
            if(navCompta) navCompta.style.display = 'none';
            ouvrirPage(null, 'Envoi');
        } else {
            currentRole = 'abidjan';
            if(userDisplay) userDisplay.innerText = "Agence Abidjan";
            const navRec = document.getElementById('nav-reception');
            const navCompta = document.getElementById('nav-compta');
            if(navRec) navRec.style.display = 'inline-block';
            if(navCompta) navCompta.style.display = 'inline-block';
            ouvrirPage(null, 'Reception');
        }
    } else {
        if(overlay) overlay.style.display = 'flex';
        if(app) app.style.display = 'none';
    }
});

function deconnexion() { auth.signOut().then(() => window.location.reload()); }

function ouvrirPage(event, nomPage) {
    const contents = document.getElementsByClassName("page-content");
    for (let i = 0; i < contents.length; i++) if(contents[i]) contents[i].style.display = "none";
    const links = document.getElementsByClassName("nav-link");
    for (let i = 0; i < links.length; i++) if(links[i]) links[i].className = links[i].className.replace(" active", "");
    
    const page = document.getElementById(nomPage);
    if (page) page.style.display = "block";
    
    if (event && event.currentTarget) event.currentTarget.className += " active";
    
    const agenceEl = document.getElementById('agence-nom');
    if (agenceEl) {
        if (nomPage === 'Envoi') {
            agenceEl.innerText = 'Chine';
            // On charge les clients ici pour être sûr
            loadAllClientsForAutocomplete();
        } else if (nomPage === 'Historique') {
            agenceEl.innerText = 'Chine - Historique';
            chargerHistoriqueChine();
        } else if (nomPage === 'Reception') {
            agenceEl.innerText = 'Abidjan';
            ouvrirSousOngletReception('maritime');
        } else if (nomPage === 'Comptabilite') {
            agenceEl.innerText = 'Abidjan - Compta';
            ouvrirSousOngletCompta('maritime');
        }
    }
}

// =======================================================
// 4. INITIALISATION & PAGE ENVOI
// =======================================================
document.addEventListener('DOMContentLoaded', function() {
    // loadAllClientsForAutocomplete appelé via ouvrirPage/Auth
    
    const typeEnvoiSelect = document.getElementById('type-envoi');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const photosInput = document.getElementById('photos-colis');
    const btnAjouterClient = document.getElementById('btn-ajouter-client');
    const btnValiderEnvoiGroupe = document.getElementById('btn-valider-envoi-groupe');

    if(typeEnvoiSelect) {
        typeEnvoiSelect.addEventListener('change', gererChampsEnvoi);
        poidsInput.addEventListener('input', calculerPrixClient);
        volumeInput.addEventListener('input', calculerPrixClient);
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

    if(btnAjouterClient) {
        btnAjouterClient.addEventListener('click', ajouterClientALaListe);
    }

    if(btnValiderEnvoiGroupe) {
        btnValiderEnvoiGroupe.addEventListener('click', validerEnvoiGroupe);
    }
    
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
            if (!e.target.closest('.autocomplete-container')) {
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
    
    if (type.startsWith('aerien')) { p.style.display='block'; v.style.display='none'; vi.value=0; }
    else if (type==='maritime') { p.style.display='none'; v.style.display='block'; pi.value=0; }
    else { p.style.display='none'; v.style.display='none'; }
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
    if(!t||!d) { alert("Remplir Date et Type"); return; }
    
    const n = document.getElementById('client-nom').value;
    if(!n) { alert("Remplir Nom"); return; }
    
    const c = {
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
    const ap = document.getElementById('apercu-photos');
    if(ap) ap.innerHTML='';
    calculerPrixClient();
}

function mettreAJourTableauEnvoiEnCours() {
    const tbody = document.getElementById('tbody-envoi-en-cours');
    tbody.innerHTML = '';
    if (envoiEnCours.length === 0) { tbody.innerHTML = '<tr><td colspan="6">Aucun client.</td></tr>'; return; }
    envoiEnCours.forEach((c, i) => {
        const type = document.getElementById('type-envoi').value;
        let pv = type.startsWith('aerien') ? `${c.poidsEnvoye} Kg` : `${c.volumeEnvoye} CBM`;
        tbody.innerHTML += `<tr><td>${c.nom}</td><td>${c.description}</td><td>${c.quantiteEnvoyee}</td><td>${pv}</td><td>${c.prixEstime}</td><td><button class="btn-action btn-supprimer" onclick="envoiEnCours.splice(${i},1);mettreAJourTableauEnvoiEnCours()">X</button></td></tr>`;
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
        const pref = t.startsWith('aerien') ? 'AIR' : 'MRT'; // NOUVELLE REFERENCE

        for(let i=0; i<envoiEnCours.length; i++) {
            const c = envoiEnCours[i];
            const idx = String(i+1).padStart(3,'0');
            const ref = `${pref}-${idx}-${refG}`;
            
            let photosURLs = []; // Upload logic placeholder
            
            await db.collection('expeditions').add({
                reference: ref, refGroupe: refG, date: d, type: t,
                nom: c.nom, prenom: c.prenom, tel: c.tel, description: c.description,
                quantiteEnvoyee: parseInt(c.quantiteEnvoyee)||0,
                poidsEnvoye: c.poidsEnvoye, volumeEnvoye: c.volumeEnvoye,
                prixEstime: c.prixEstime, remise: 0,
                creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'En attente', quantiteRecue: 0, poidsRecu: 0, montantPaye: 0, historiquePaiements: []
            });
        }
        alert('Groupe '+refG+' enregistré !');
        envoiEnCours = []; mettreAJourTableauEnvoiEnCours();
        document.getElementById('form-envoi-commun').reset();
        loadAllClientsForAutocomplete();
    } catch(e) { alert(e.message); }
    finally { btn.disabled=false; btn.innerText='Valider'; }
}

async function genererRefGroupe(typeEnvoi) {
    const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(50).get();
    let last = 0;
    snap.forEach(d => {
        let g = d.data().refGroupe||"";
        if(g.startsWith('EV')) { let n = parseInt(g.replace('EV','')); if(n>last) last=n; }
    });
    return 'EV'+(last+1);
}

async function loadAllClientsForAutocomplete() {
    try {
        const snap = await db.collection('expeditions').get();
        const map = new Map();
        snap.forEach(d => { const da=d.data(); if(da.nom) map.set(da.nom+da.tel, da); });
        allPastClients = Array.from(map.values());
    } catch(e) {}
}

function showSuggestions(matches) {
    const box = document.getElementById('autocomplete-suggestions');
    box.innerHTML = '';
    if (matches.length === 0) { box.style.display = 'none'; return; }
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
    box.style.display = 'block';
}

// =======================================================
// 5. HISTORIQUE CHINE
// =======================================================
function ouvrirSousOngletHistorique(type) {
    currentHistoriqueType = type;
    const b1 = document.getElementById('btn-hist-maritime');
    const b2 = document.getElementById('btn-hist-aerien');
    if(b1 && b2) {
        if(type==='maritime') { b1.classList.add('active'); b2.classList.remove('active'); }
        else { b1.classList.remove('active'); b2.classList.add('active'); }
    }
    chargerHistoriqueChine();
}

async function chargerHistoriqueChine() {
    const tbody = document.getElementById('tbody-historique-chine');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">Chargement...</td></tr>';

    // Recherche
    const s = document.getElementById('search-hist-chine');
    if(s) s.oninput = () => {
        const q = s.value.toLowerCase();
        Array.from(tbody.rows).forEach(r => r.style.display = r.innerText.toLowerCase().includes(q) ? "" : "none");
    };

    try {
        const snap = await db.collection('expeditions').get(); // On récupère tout pour tri client
        let docs = [];
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentHistoriqueType==='maritime' && data.type==='maritime') match=true;
            if(currentHistoriqueType==='aerien' && data.type.startsWith('aerien')) match=true;
            if(match) docs.push({id: d.id, ...data});
        });
        
        // Tri par date création
        docs.sort((a,b) => (b.creeLe?b.creeLe.seconds:0) - (a.creeLe?a.creeLe.seconds:0));
        
        tbody.innerHTML = '';
        if(docs.length===0) tbody.innerHTML='<tr><td colspan="8">Aucun élément.</td></tr>';

        docs.forEach(d => {
            const dateStr = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-';
            let pv = d.type.startsWith('aerien') ? d.poidsEnvoye+' Kg' : d.volumeEnvoye+' CBM';
            let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
            let final = pB - (d.remise||0);
            let mod = d.dernierModificateur ? `<span class="modif-info">Par ${d.dernierModificateur}</span>` : '-';
            
            // JSON safe
            const j = JSON.stringify({id:d.id, ...d}).replace(/'/g, "&#39;");
            
            const tr = document.createElement('tr');
            tr.className = 'interactive-table-row';
            tr.innerHTML = `<td>${d.reference}</td><td>${dateStr}</td><td>${d.nom}</td><td>${d.quantiteEnvoyee}</td><td>${pv}</td><td>${formatArgent(final)} CFA</td><td>${mod}</td>`;
            tr.onclick = () => ouvrirModalModif(d.id, d); // On passe directement l'objet
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

const modalModif = document.getElementById('modal-modif-chine');
function ouvrirModalModif(id, envoi) { // Modifié pour être robuste
    currentModifEnvoi = {id: id, ...envoi};
    if(modalModif) {
        modalModif.style.display = 'flex';
        document.getElementById('modif-qte').value = envoi.quantiteEnvoyee;
        document.getElementById('modif-remise').value = envoi.remise||0;
        const elP = document.getElementById('modif-poids');
        if(envoi.type.startsWith('aerien')) elP.value = envoi.poidsEnvoye;
        else elP.value = envoi.volumeEnvoye;
        calculerPrixModif();
    }
}
function calculerPrixModif() {
    if(!currentModifEnvoi) return;
    const v = parseFloat(document.getElementById('modif-poids').value)||0;
    const r = parseInt(document.getElementById('modif-remise').value)||0;
    let t = 0;
    if(currentModifEnvoi.type==='aerien_normal') t = PRIX_AERIEN_NORMAL;
    else if(currentModifEnvoi.type==='aerien_express') t = PRIX_AERIEN_EXPRESS;
    else t = PRIX_MARITIME_CBM;
    let total = (v * t) - r;
    document.getElementById('modif-prix-final').value = formatArgent(total) + ' CFA';
}
async function sauvegarderModificationChine() {
    if(!currentModifEnvoi) return;
    const q = parseInt(document.getElementById('modif-qte').value)||0;
    const v = parseFloat(document.getElementById('modif-poids').value)||0;
    const r = parseInt(document.getElementById('modif-remise').value)||0;
    
    let up = { quantiteEnvoyee: q, remise: r, dernierModificateur: currentRole==='chine'?'Agence Chine':'Agence Abidjan', dateModification: firebase.firestore.FieldValue.serverTimestamp() };
    if(currentModifEnvoi.type.startsWith('aerien')) up.poidsEnvoye=v; else up.volumeEnvoye=v;
    
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
function fermerModalModif(e) { if(e.target===modalModif || e.target.classList.contains('modal-close')) modalModif.style.display='none'; }


// =======================================================
// 6. RECEPTION
// =======================================================
function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    const b1 = document.getElementById('btn-rec-maritime');
    const b2 = document.getElementById('btn-rec-aerien');
    if(b1 && b2) {
        if(type==='maritime') { b1.classList.add('active'); b2.classList.remove('active'); }
        else { b1.classList.remove('active'); b2.classList.add('active'); }
    }
    chargerClients();
}

async function chargerClients() {
    const tbody = document.getElementById('liste-clients-tbody');
    if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="9">Chargement...</td></tr>';
    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        tbody.innerHTML=''; clientsCharges=[];
        let hasData=false;
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentReceptionType==='maritime' && data.type==='maritime') match=true;
            if(currentReceptionType==='aerien' && data.type.startsWith('aerien')) match=true;
            
            if(match) {
                hasData=true;
                clientsCharges.push({id:d.id, ...data});
                let pv = data.type.startsWith('aerien') ? `${data.poidsEnvoye} Kg` : `${data.volumeEnvoye} CBM`;
                let st = data.status || 'En attente';
                let cl = st.includes('Conforme')?'status-conforme':(st.includes('Ecart')?'status-ecart':'status-attente');
                let pB = parseInt((data.prixEstime||"0").replace(/\D/g,''))||0;
                let pN = pB - (data.remise||0);
                
                const tr = document.createElement('tr');
                tr.className='interactive-table-row';
                tr.innerHTML=`<td>${data.reference}</td><td>${data.date}</td><td>${data.nom}</td><td>${data.description||''}</td><td>${data.type}</td><td>${data.quantiteEnvoyee}</td><td>${pv}</td><td>${formatArgent(pN)} CFA</td><td><span class="status-badge ${cl}">${st}</span></td>`;
                tr.onclick = () => selectionnerClient({id:d.id, ...data});
                tbody.appendChild(tr);
            }
        });
        if(!hasData) tbody.innerHTML='<tr><td colspan="9">Aucun envoi.</td></tr>';
    } catch(e) { console.error(e); }
}

// Modal Reception
const modalBackdrop = document.getElementById('modal-backdrop');
function selectionnerClient(envoi) {
    currentEnvoi = envoi;
    if(modalBackdrop) modalBackdrop.style.display='flex';
    
    // Remplissage SÉCURISÉ des champs
    const setTxt = (id, val) => { const el=document.getElementById(id); if(el) el.innerText=val; };
    
    setTxt('client-selectionne', envoi.nom||'');
    setTxt('ref-attendue', envoi.reference||'');
    setTxt('desc-attendue', envoi.description||'');
    setTxt('tel-attendue', envoi.tel||''); // Attention ID HTML
    // ID HTML corrigé pour tel : tel-attendu
    const telEl = document.getElementById('tel-attendu'); if(telEl) telEl.innerText = envoi.tel||'';
    
    setTxt('qte-attendue', (envoi.quantiteEnvoyee||0)+' colis');
    
    let isAir = (envoi.type||"").startsWith('aerien');
    setTxt('poids-attendu', (isAir?envoi.poidsEnvoye:envoi.volumeEnvoye) + (isAir?' Kg':' CBM'));
    
    let pB = parseInt((envoi.prixEstime||"0").replace(/\D/g,''))||0;
    let tot = pB - (envoi.remise||0);
    let dej = parseInt(envoi.montantPaye)||0;
    let res = tot - dej;
    
    setTxt('prix-attendu', formatArgent(tot)+' CFA');
    
    const elR = document.getElementById('prix-restant');
    if(elR) {
        if(res<=0) { elR.innerText="SOLDÉ"; elR.style.color="green"; document.getElementById('montant-paye').value=0; }
        else { elR.innerText=formatArgent(res)+' CFA'; elR.style.color="#dc3545"; document.getElementById('montant-paye').value=res; }
    }
    
    const phDiv = document.getElementById('photos-recues-apercu');
    if(phDiv) {
        phDiv.innerHTML='';
        if(envoi.photosURLs && envoi.photosURLs.length>0) {
            document.getElementById('photos-recues-container').style.display='block';
            envoi.photosURLs.forEach(u => { const i=document.createElement('img'); i.src=u; phDiv.appendChild(i); });
        } else document.getElementById('photos-recues-container').style.display='none';
    }
    
    document.getElementById('quantite-recue').value='';
    document.getElementById('poids-recu').value='';
    
    const lblP = document.getElementById('label-poids-recu');
    if(lblP) lblP.innerText = isAir ? "Poids Reçu (Kg)" : "Vol Reçu (CBM)";
    
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
    const diffP = nP - (currentEnvoi.type.startsWith('aerien')?currentEnvoi.poidsEnvoye:currentEnvoi.volumeEnvoye);
    
    if(diffQ < 0) st = 'Reçu - Ecart';
    else if(diffQ > 0) st = 'Reçu - Supérieur';
    else { if(Math.abs(diffP) > 0.1) st = (diffP>0?'Reçu - Supérieur':'Reçu - Ecart'); else st = 'Reçu - Conforme'; }
    
    let up = { quantiteRecue:nQ, poidsRecu:nP, montantPaye:nM, status:st, moyenPaiement:via, datePaiement: firebase.firestore.FieldValue.serverTimestamp() };
    if(m>0) up.historiquePaiements = firebase.firestore.FieldValue.arrayUnion({ date: firebase.firestore.Timestamp.now(), montant:m, moyen:via });
    
    await db.collection('expeditions').doc(currentEnvoi.id).update(up);
    alert('Validé'); modalBackdrop.style.display='none'; chargerClients();
}

// =======================================================
// 7. COMPTABILITÉ
// =======================================================
function ouvrirSousOngletCompta(type) {
    currentComptaType = type;
    document.querySelectorAll('.sub-nav-link').forEach(btn => {
        btn.classList.remove('active');
        if(btn.textContent.toLowerCase().includes(type)) btn.classList.add('active');
    });
    chargerCompta(type);
}

async function chargerCompta(type) {
    const tbody = document.getElementById('tbody-compta');
    if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="10">Chargement...</td></tr>';
    
    try {
        const snapE = await db.collection('expeditions').get();
        const snapS = await db.collection('depenses').orderBy('date','desc').get();
        let items = [];
        
        snapE.forEach(d => {
            const data = d.data();
            let match=false;
            if(type==='maritime' && data.type==='maritime') match=true;
            if(type==='aerien' && data.type.startsWith('aerien')) match=true;
            
            if(match) {
                let dateRef = data.datePaiement ? data.datePaiement.toDate() : new Date(data.date);
                let grp = data.refGroupe || "ZZZ";
                if(grp==="ZZZ" && data.reference) {
                    let pts = data.reference.split('-');
                    if(pts.length>0 && pts[pts.length-1].startsWith('EV')) grp = pts[pts.length-1];
                }
                items.push({ ...data, id:d.id, isDep:false, sortDate:dateRef, grp:grp, sortRef:data.reference||"ZZZ", hist:data.historiquePaiements||[] });
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
            const gA = a.grp, gB = b.grp;
            if(gA.startsWith('EV') && gB.startsWith('EV')) {
                const nA=parseInt(gA.replace('EV',''))||9999, nB=parseInt(gB.replace('EV',''))||9999;
                if(nA!==nB) return nA-nB;
            } else if(gA!==gB) return gA.localeCompare(gB);
            return a.sortRef.localeCompare(b.sortRef);
        });
        
        let cred=0, caisse=0, bonus=0;
        let modes = { Esp:0, Chq:0, OM:0, Wav:0, CB:0 };
        let outModes = { Esp:0, Chq:0, OM:0, Wav:0, CB:0 };
        
        // TOTAUX GROUPE
        let curGrp = null; 
        let grpDu=0, grpReste=0, grpEntree=0, grpSortie=0;
        let grpQ=0, grpVol=0;

        tbody.innerHTML='';
        
        items.forEach((it, idx) => {
            // RUPTURE GROUPE
            if(curGrp!==null && it.grp!==curGrp && !curGrp.startsWith('ZZZ')) {
                let lbl = type.startsWith('aerien')?'Kg':'CBM';
                tbody.innerHTML += `
                <tr class="group-summary-row">
                    <td colspan="3">TOTAL ${curGrp}</td>
                    <td></td>
                    <td>${formatArgent(grpDu)}</td>
                    <td>${formatArgent(grpReste)}</td>
                    <td>${formatArgent(grpEntree)}</td>
                    <td>${formatArgent(grpSortie)}</td>
                    <td></td>
                </tr>`;
                grpDu=0; grpReste=0; grpEntree=0; grpSortie=0;
            }
            curGrp = it.grp;
            
            let dateS = it.sortDate.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
            let rowClass = `row-month-${it.sortDate.getMonth()}`;
            let rowHTML = '';
            
            if(it.isDep) {
                let m = parseFloat(it.montant)||0;
                totalCaisse -= m;
                grpSortie += m;

                let via = it.moyenPaiement || 'Espèce';
                if(via.includes('Chèque')) outModes.Chq+=m; else if(via.includes('OM')) outModes.OM+=m; else if(via.includes('Wave')) outModes.Wav+=m; else if(via.includes('CB')) outModes.CB+=m; else outModes.Esp+=m;
                
                rowHTML = `<tr class="${rowClass}"><td>${dateS}</td><td>-</td><td>${it.motif}</td><td>Dépense</td><td>-</td><td>-</td><td>-</td><td class="text-red">${formatArgent(m)}</td><td><button class="btn-suppr-small" onclick="supprimerDepense('${it.id}')">X</button></td></tr>`;
            } else {
                let pB = parseInt((it.prixEstime||"0").replace(/\D/g,''))||0;
                let du = pB - (it.remise||0);
                let paye = 0;
                if(it.hist.length>0) {
                    it.hist.forEach(h=>{
                        let v=parseFloat(h.montant)||0; paye+=v;
                        let t=h.moyen||'Espèce';
                        if(t.includes('Chèque')) modes.Chq+=v; else if(t.includes('OM')) modes.OM+=v; else if(t.includes('Wave')) modes.Wav+=v; else if(t.includes('CB')) modes.CB+=v; else modes.Esp+=v;
                    });
                } else {
                    paye = it.montantPaye||0; modes.Esp+=paye;
                }
                let r = du - paye;
                caisse += paye;
                if(r>0) cred+=r;
                let diff = paye - du;
                if(diff>0) bonus+=diff; else if(diff<0 && Math.abs(diff)<500) bonus+=diff;
                
                // Ajout au groupe
                grpDu += du;
                grpReste += (r>0?r:0);
                grpEntree += paye;

                let json = JSON.stringify({id:it.id, nom:it.nom, reference:it.reference, history:it.hist}).replace(/'/g, "&#39;");
                rowHTML = `<tr class="${rowClass} interactive-table-row" onclick='voirHistoriquePaiement(${json})'><td>${dateS}</td><td>${it.reference}</td><td>${it.description||'-'}</td><td>${it.prenom} ${it.nom}</td><td>${formatArgent(du)}</td><td style="${r>0?'color:red':'color:green'}">${formatArgent(r)}</td><td class="text-green">${formatArgent(paye)}</td><td>-</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
            tbody.innerHTML += rowHTML;
            
            if(idx===items.length-1 && curGrp && !curGrp.startsWith('ZZZ')) {
                 tbody.innerHTML += `<tr class="group-summary-row"><td colspan="3">TOTAL ${curGrp}</td><td></td><td>${formatArgent(grpDu)}</td><td>${formatArgent(grpReste)}</td><td>${formatArgent(grpEntree)}</td><td>${formatArgent(grpSortie)}</td><td></td></tr>`;
            }
        });
        
        // MAJ Dashboard
        document.getElementById('total-credit').innerText = formatArgent(cred)+' CFA';
        const elC = document.getElementById('total-caisse');
        elC.innerText = formatArgent(caisse)+' CFA';
        elC.className = caisse>=0 ? 'text-green' : 'text-red';
        document.getElementById('total-bonus').innerText = formatArgent(bonus)+' CFA';
        
        // MAJ Modes
        document.getElementById('pay-espece-in').innerText = formatArgent(modes.Esp); document.getElementById('pay-espece-out').innerText = formatArgent(outModes.Esp);
        document.getElementById('pay-cheque-in').innerText = formatArgent(modes.Chq); document.getElementById('pay-cheque-out').innerText = formatArgent(outModes.Chq);
        document.getElementById('pay-om-in').innerText = formatArgent(modes.OM); document.getElementById('pay-om-out').innerText = formatArgent(outModes.OM);
        document.getElementById('pay-wave-in').innerText = formatArgent(modes.Wav); document.getElementById('pay-wave-out').innerText = formatArgent(outModes.Wav);
        document.getElementById('pay-cb-in').innerText = formatArgent(modes.CB); document.getElementById('pay-cb-out').innerText = formatArgent(outModes.CB);
        
        let tIn = Object.values(modes).reduce((a,b)=>a+b,0); let tOut = Object.values(outModes).reduce((a,b)=>a+b,0);
        document.getElementById('pay-total-in').innerText = formatArgent(tIn); document.getElementById('pay-total-out').innerText = formatArgent(tOut);

    } catch(e) { console.error(e); }
}

// MODALS SECONDAIRES
const modalHist = document.getElementById('modal-historique');
function voirHistoriquePaiement(item) {
    if(item.isDepense) return;
    modalHist.style.display='flex';
    document.getElementById('hist-client-nom').innerText = item.nom;
    document.getElementById('hist-ref').innerText = item.reference;
    const t = document.getElementById('tbody-historique'); t.innerHTML='';
    if(item.history && item.history.length>0) {
        item.history.forEach(h=>{
            let d=new Date(h.date.seconds*1000).toLocaleDateString('fr-FR');
            t.innerHTML+=`<tr><td>${d}</td><td class="text-green">${formatArgent(h.montant)} CFA</td><td>${h.moyen}</td></tr>`;
        });
    } else t.innerHTML='<tr><td colspan="3">Aucun</td></tr>';
}
function fermerModalHistorique(e){ if(e.target===modalHist||e.target.classList.contains('modal-close')||e.target.classList.contains('btn-secondaire')) modalHist.style.display='none'; }

const modalDep = document.getElementById('modal-depense');
function ouvrirModalDepense(){ modalDep.style.display='flex'; }
function fermerModalDepense(e){ if(e.target===modalDep||e.target.classList.contains('modal-close')) modalDep.style.display='none'; }
async function enregistrerDepense(){
    const d=document.getElementById('depense-date').value; const mt=document.getElementById('depense-motif').value;
    const m=parseFloat(document.getElementById('depense-montant').value)||0;
    if(!d||!mt||m<=0){alert('Champs invalides');return;}
    await db.collection('depenses').add({
        date:d, type:document.getElementById('depense-type').value, refGroupe:document.getElementById('depense-groupe').value.toUpperCase().trim(),
        motif:mt, montant:m, moyenPaiement:document.getElementById('depense-moyen').value, creeLe: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('OK'); modalDep.style.display='none'; document.getElementById('form-depense').reset(); chargerCompta(currentComptaType);
}
async function supprimerDepense(id){ if(confirm('Supprimer ?')) { await db.collection('depenses').doc(id).delete(); chargerCompta(currentComptaType); } }

// EXPORTS
function exporterExcel() { /* Code inchangé */ }
function exporterPDF() { /* Code inchangé */ }