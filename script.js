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
let sousColisList = []; // NOUVEAU : Liste temporaire des colis d'un client
let clientsCharges = [];
let allPastClients = [];
let historiqueCharges = [];
let currentUser = null;
let currentRole = null;
let currentIdPaiementOpen = null;

// Données chargées pour filtres
let allHistoriqueData = [];
let allReceptionData = [];
let selectedGroupsHistorique = [];
let selectedGroupsReception = [];

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
// 3. AUTHENTIFICATION & NAVIGATION
// =======================================================
const loginForm = document.getElementById('login-form');
if(loginForm) {
    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
            .catch(err => document.getElementById('login-error').innerText = err.message);
    });
}

auth.onAuthStateChanged(user => {
    const overlay = document.getElementById('login-overlay');
    const app = document.getElementById('app-container');
    const disp = document.getElementById('user-display');
    
    if(user) {
        currentUser = user;
        if(overlay) overlay.style.display='none';
        if(app) app.style.display='block';

        // 1. CAS AGENCE CHINE
        if(user.email.includes('chine')) {
            currentRole='chine'; 
            if(disp) disp.innerText="Agence Chine";
            // On cache les onglets d'Abidjan
            document.getElementById('nav-reception').style.display='none';
            document.getElementById('nav-compta').style.display='none';
            ouvrirPage(null, 'Envoi');
        } 
        // 2. CAS COMPTE SPECTATEUR (Nouveau)
        else if (user.email.includes('audit')) { // Si l'email contient "audit"
            currentRole = 'spectateur';
            if(disp) disp.innerText = "Auditeur (Lecture Seule)";
            
            // On cache TOUT sauf la compta
            document.getElementById('nav-envoi').style.display = 'none';
            document.getElementById('nav-historique').style.display = 'none';
            document.getElementById('nav-reception').style.display = 'none';
            
            // On s'assure que le bouton "Ajout Dépense" est caché
            const btnAjout = document.getElementById('btn-ajout-depense');
            if(btnAjout) btnAjout.style.display = 'none';

            ouvrirPage(null, 'Comptabilite');
        }
        // 3. CAS ADMIN ABIDJAN (Par défaut)
        else {
            currentRole='abidjan'; 
            if(disp) disp.innerText="Agence Abidjan";
            // On affiche tout
            document.getElementById('nav-reception').style.display='inline-block';
            document.getElementById('nav-compta').style.display='inline-block';
            
            // On s'assure que le bouton Ajout Dépense est visible
            const btnAjout = document.getElementById('btn-ajout-depense');
            if(btnAjout) btnAjout.style.display = 'inline-block';

            ouvrirPage(null, 'Reception');
        }
    } else { 
        if(overlay) overlay.style.display='flex'; 
        if(app) app.style.display='none'; 
    }
});

function deconnexion() {
    auth.signOut().then(() => window.location.reload());
}

function ouvrirPage(event, nomPage) {
    const contents = document.getElementsByClassName("page-content");
    for (let i = 0; i < contents.length; i++) {
        if (contents[i]) contents[i].style.display = "none";
    }
    const links = document.getElementsByClassName("nav-link");
    for (let i = 0; i < links.length; i++) {
        if (links[i]) links[i].className = links[i].className.replace(" active", "");
    }
    const page = document.getElementById(nomPage);
    if (page) page.style.display = "block";
    if (event && event.currentTarget) event.currentTarget.className += " active";

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
    if (nomPage === 'Envoi') {
        agenceEl.innerText = 'Chine';
        loadAllClientsForAutocomplete();
        chargerListeGroupes(); // <--- AJOUTER CETTE LIGNE
    }
}

// =======================================================
// 4. INIT & ENVOI (Modifié pour Sous-Colis)
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    loadAllClientsForAutocomplete();
    const ts = document.getElementById('type-envoi'); if(ts) ts.addEventListener('change', gererChampsEnvoi);
    const ba = document.getElementById('btn-ajouter-client'); if(ba) ba.addEventListener('click', ajouterClientALaListe);
    const bv = document.getElementById('btn-valider-envoi-groupe'); if(bv) bv.addEventListener('click', validerEnvoiGroupe);
    
    const photosInput = document.getElementById('photos-colis');
    if(photosInput) {
        photosInput.addEventListener('change', function() {
            const d = document.getElementById('apercu-photos'); if(d) d.innerHTML='';
            Array.from(this.files).forEach(f => {
                if(f.type.startsWith('image/')){ const r=new FileReader(); r.onload=e=>{const i=document.createElement('img');i.src=e.target.result;d.appendChild(i);}; r.readAsDataURL(f); }
            });
        });
    }

    // --- NOUVELLE FONCTION : Charger les groupes existants dans le select ---
async function chargerListeGroupes() {
    const select = document.getElementById('choix-groupe-ref');
    if(!select) return;

    // On garde l'option "Nouveau" et on vide le reste
    select.innerHTML = '<option value="NEW">➕ Créer un nouveau groupe (Auto)</option>';

    try {
        // On cherche les 100 dernières expéditions pour trouver les groupes récents
        const snap = await db.collection('expeditions')
            .orderBy('creeLe', 'desc')
            .limit(100)
            .get();

        const groupes = new Set();
        snap.forEach(doc => {
            const data = doc.data();
            if (data.refGroupe && data.refGroupe.startsWith('EV')) {
                groupes.add(data.refGroupe);
            }
        });

        // Convertir en tableau et trier (EV10 avant EV9)
        const groupesTries = Array.from(groupes).sort((a, b) => {
            const numA = parseInt(a.replace('EV', '')) || 0;
            const numB = parseInt(b.replace('EV', '')) || 0;
            return numB - numA; // Décroissant
        });

        groupesTries.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.innerText = `Compléter le groupe ${g}`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Erreur chargement groupes", e);
    }
}

    // Recherche & Export
    const sIn = document.getElementById('search-input');
    if(sIn) sIn.addEventListener('input', ()=>updateReceptionView(sIn.value));
    const sHi = document.getElementById('search-hist-chine');
    if(sHi) sHi.addEventListener('input', ()=>updateHistoriqueView(sHi.value));

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

    const mp = document.getElementById('modif-poids'); if(mp) mp.oninput=calculerPrixModif;
    const mr = document.getElementById('modif-remise'); if(mr) mr.oninput=calculerPrixModif;
    
    const be = document.getElementById('btn-export-excel'); if(be) be.onclick=exporterExcel;
    const bp = document.getElementById('btn-export-pdf'); if(bp) bp.onclick=exporterPDF;
});

// --- GESTION DES SOUS-COLIS (NOUVEAU) ---
function gererChampsEnvoi(){
    const t = document.getElementById('type-envoi').value;
    const lbl = document.getElementById('label-sub-poids-vol');
    const unit = document.getElementById('display-unit');
    
    if(t.startsWith('aerien')) { 
        lbl.innerText = "Poids (Kg)"; 
        unit.innerText = "Kg";
    } else { 
        lbl.innerText = "Volume (CBM)"; 
        unit.innerText = "CBM";
    }
    recalculerTotalClient(); // Recalculer prix si on change de type
}

function ajouterSousColis() {
    const desc = document.getElementById('sub-desc').value || "Colis";
    const qte = parseInt(document.getElementById('sub-qte').value) || 0;
    const val = parseFloat(document.getElementById('sub-poids-vol').value) || 0;
    
    if(qte <= 0 || val <= 0) { alert("Quantité et Valeur doivent être > 0"); return; }
    
    sousColisList.push({ desc: desc, qte: qte, val: val });
    
    // Reset champs saisie
    document.getElementById('sub-desc').value = "";
    document.getElementById('sub-qte').value = "1";
    document.getElementById('sub-poids-vol').value = "";
    
    updateSousColisTable();
}

function updateSousColisTable() {
    const tbody = document.getElementById('tbody-sub-colis');
    tbody.innerHTML = '';
    
    sousColisList.forEach((item, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${item.desc}</td>
                <td>${item.qte}</td>
                <td>${item.val}</td>
                <td><button class="btn-suppr-small" onclick="supprimerSousColis(${index})">X</button></td>
            </tr>
        `;
    });
    recalculerTotalClient();
}

function supprimerSousColis(index) {
    sousColisList.splice(index, 1);
    updateSousColisTable();
}

function recalculerTotalClient() {
    let totalQ = 0;
    let totalV = 0;
    
    sousColisList.forEach(item => {
        totalQ += item.qte;
        totalV += item.val; // On somme les valeurs unitaires ou globales ? 
        // Logique: Si j'ai "1 carton de 0.23", c'est 0.23 total pour cette ligne.
        // Si l'utilisateur met qté 2 et poids 10, est-ce 10kg total ou 10kg chaque ?
        // Simplification : On considère que le champ "Kg / CBM" est le total pour cette ligne.
    });
    
    document.getElementById('display-total-qte').innerText = totalQ;
    document.getElementById('display-total-vol').innerText = totalV.toFixed(3);
    
    // Calcul Prix
    const type = document.getElementById('type-envoi').value;
    let prix = 0;
    if (type === 'aerien_normal') prix = totalV * PRIX_AERIEN_NORMAL;
    else if (type === 'aerien_express') prix = totalV * PRIX_AERIEN_EXPRESS;
    else if (type === 'maritime') prix = totalV * PRIX_MARITIME_CBM;
    
    document.getElementById('prix-calcule').innerText = formatArgent(prix) + ' CFA';
}
function calculerPrixClient(){
    const t = document.getElementById('type-envoi').value;
    const p = parseFloat(document.getElementById('poids-envoye').value)||0;
    const v = parseFloat(document.getElementById('volume-envoye').value)||0;
    let px = 0;
    if(t==='aerien_normal') px = p*PRIX_AERIEN_NORMAL; else if(t==='aerien_express') px = p*PRIX_AERIEN_EXPRESS; else if(t==='maritime') px = v*PRIX_MARITIME_CBM;
    document.getElementById('prix-calcule').innerText = formatArgent(px)+' CFA';
}
function ajouterClientALaListe() {
    const n = document.getElementById('client-nom').value;
    // Vérification si le nom est vide ou si aucun colis n'a été ajouté
    if (!n) { alert('Nom du client requis'); return; }
    if (sousColisList.length === 0) { alert('Veuillez ajouter au moins un sous-colis dans le tableau.'); return; }

    // Récupération des totaux affichés
    const totalQte = document.getElementById('display-total-qte').innerText;
    const totalVal = parseFloat(document.getElementById('display-total-vol').innerText) || 0;
    const typeEnvoi = document.getElementById('type-envoi').value;

    // Création d'une description résumée (ex: "Carton chaussures, Sac habits")
    const descriptionResume = sousColisList.map(item => item.desc).join(', ');

    // Déterminer si la valeur est un Poids ou un Volume selon le type
    let poids = 0;
    let volume = 0;
    if (typeEnvoi.startsWith('aerien')) {
        poids = totalVal;
    } else {
        volume = totalVal;
    }

    envoiEnCours.push({
        expediteur: document.getElementById('expediteur-nom').value,
        telExpediteur: document.getElementById('expediteur-tel').value,
        nom: n,
        prenom: document.getElementById('client-prenom').value,
        tel: document.getElementById('client-tel').value,
        
        // --- NOUVELLE LOGIQUE ICI ---
        description: descriptionResume, 
        detailsColis: [...sousColisList], // On sauvegarde le détail des sous-colis
        quantiteEnvoyee: totalQte,
        poidsEnvoye: poids,
        volumeEnvoye: volume,
        // ----------------------------

        prixEstime: document.getElementById('prix-calcule').innerText,
        photosFiles: Array.from(document.getElementById('photos-colis').files)
    });

    mettreAJourTableauEnvoiEnCours();

    // Réinitialisation du formulaire
    document.getElementById('form-ajout-client').reset();
    document.getElementById('expediteur-nom').value = "AMT TRANSIT CARGO";
    document.getElementById('expediteur-tel').value = "+225 0703165050";
    document.getElementById('apercu-photos').innerHTML = '';
    
    // Réinitialiser la liste des sous-colis et le tableau visuel
    sousColisList = [];
    updateSousColisTable();
    document.getElementById('autocomplete-suggestions').style.display='none';
}
function mettreAJourTableauEnvoiEnCours(){
    const tb = document.getElementById('tbody-envoi-en-cours'); tb.innerHTML='';
    if(envoiEnCours.length===0) { tb.innerHTML='<tr><td colspan="7" style="text-align:center">Aucun client.</td></tr>'; return; }
    
    envoiEnCours.forEach((c,i)=>{
        const t = document.getElementById('type-envoi').value;
        let unit = t.startsWith('aerien') ? ' Kg' : ' CBM';
        let pv = t.startsWith('aerien') ? c.poidsEnvoye : c.volumeEnvoye;
        
        tb.innerHTML+=`<tr>
            <td>${c.expediteur}</td><td>${c.nom} ${c.prenom}</td><td>${c.tel}</td>
            <td>${c.quantiteEnvoyee}</td><td>${pv} ${unit}</td><td>${c.prixEstime}</td>
            <td>
                <button class="btn-action" style="background:#f39c12;color:white;" onclick="editerEnvoi(${i})"><i class="fas fa-edit"></i></button>
                <button class="btn-action btn-supprimer" onclick="envoiEnCours.splice(${i},1);mettreAJourTableauEnvoiEnCours()">X</button>
            </td>
        </tr>`;
    });
}
function editerEnvoi(i) {
    const c = envoiEnCours[i];
    
    // Remettre les infos client
    document.getElementById('client-nom').value = c.nom;
    document.getElementById('client-prenom').value = c.prenom;
    document.getElementById('client-tel').value = c.tel;
    document.getElementById('expediteur-nom').value = c.expediteur;
    document.getElementById('expediteur-tel').value = c.telExpediteur;

    // Remettre les sous-colis dans le tableau de saisie
    if (c.detailsColis && c.detailsColis.length > 0) {
        sousColisList = [...c.detailsColis];
    } else {
        // Fallback si c'est un ancien enregistrement sans détails
        sousColisList = [{ 
            desc: c.description, 
            qte: parseInt(c.quantiteEnvoyee), 
            val: c.poidsEnvoye > 0 ? c.poidsEnvoye : c.volumeEnvoye 
        }];
    }
    
    updateSousColisTable(); // Cela va aussi recalculer le prix automatiquement

    // Retirer l'élément de la liste pour qu'on puisse le modifier et le rajouter
    envoiEnCours.splice(i, 1);
    mettreAJourTableauEnvoiEnCours();
}
async function validerEnvoiGroupe() {
    if (envoiEnCours.length === 0) return;
    
    const btn = document.getElementById('btn-valider-envoi-groupe');
    btn.disabled = true;
    btn.innerText = 'En cours...';

    try {
        const d = document.getElementById('date-envoi').value;
        const t = document.getElementById('type-envoi').value;
        const choixGroupe = document.getElementById('choix-groupe-ref').value; // Récupère le choix (NEW ou EV3)
        
        let refG = "";
        let startIdx = 1; // Numéro de départ pour les colis (001 par défaut)

        if (choixGroupe === "NEW") {
            // Cas 1 : Nouveau groupe (Logique habituelle)
            refG = await genererRefGroupe(t);
        } else {
            // Cas 2 : Groupe existant
            refG = choixGroupe;
            
            // IMPORTANT : On doit trouver le dernier numéro utilisé dans ce groupe pour ne pas créer de doublons
            // On compte combien d'éléments existent déjà dans ce groupe
            const existingSnap = await db.collection('expeditions')
                                       .where('refGroupe', '==', refG)
                                       .get();
            startIdx = existingSnap.size + 1; // Si y'a 5 colis, on commence au 6
        }

        const pref = t.startsWith('aerien') ? 'AIR' : 'MRT';

        // Création du batch (optionnel mais plus sûr) ou boucle classique
        const batch = db.batch(); // Utilisons un batch pour la robustesse (limite 500 ops)

        for (let i = 0; i < envoiEnCours.length; i++) {
            const c = envoiEnCours[i];
            
            // Calcul du numéro : startIdx + i
            // Ex: si startIdx est 6, le premier sera 006, le suivant 007...
            const currentNum = startIdx + i;
            const idx = String(currentNum).padStart(3, '0');
            
            const newRef = doc = db.collection('expeditions').doc(); // ID auto généré par firestore

            batch.set(newRef, {
                reference: `${pref}-${idx}-${refG}`, // Ex: MRT-006-EV3
                refGroupe: refG,
                date: d,
                type: t,
                nom: c.nom,
                prenom: c.prenom,
                tel: c.tel,
                description: c.description,
                detailsColis: c.detailsColis || [], // Support sous-colis
                expediteur: c.expediteur,
                telExpediteur: c.telExpediteur,
                quantiteEnvoyee: parseInt(c.quantiteEnvoyee) || 0,
                poidsEnvoye: c.poidsEnvoye,
                volumeEnvoye: c.volumeEnvoye,
                prixEstime: c.prixEstime,
                remise: 0,
                creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'En attente',
                quantiteRecue: 0,
                poidsRecu: 0,
                montantPaye: 0,
                historiquePaiements: [],
                photosURLs: []
            });
        }

        await batch.commit(); // Validation en un coup

        alert(`Groupe ${refG} mis à jour avec succès !`);
        envoiEnCours = [];
        mettreAJourTableauEnvoiEnCours();
        document.getElementById('form-envoi-commun').reset();
        
        // Recharger la liste des groupes pour mettre à jour l'ordre
        chargerListeGroupes();

    } catch (e) {
        alert("Erreur : " + e.message);
        console.error(e);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Valider l\'envoi Global';
    }
}
async function genererRefGroupe(t){
    const s=await db.collection('expeditions').orderBy('creeLe','desc').limit(50).get(); let max=0;
    s.forEach(d=>{ let g=d.data().refGroupe||""; if(g.startsWith('EV')){let n=parseInt(g.replace('EV','')); if(n>max)max=n;} });
    return 'EV'+(max+1);
}
async function loadAllClientsForAutocomplete(){
    try{ const s=await db.collection('expeditions').get(); const m=new Map(); s.forEach(d=>{const da=d.data(); if(da.tel) m.set(da.tel,da);}); allPastClients=Array.from(m.values()); }catch(e){}
}
function showSuggestions(m){
    const b=document.getElementById('autocomplete-suggestions'); b.innerHTML=''; if(m.length===0){b.style.display='none';return;}
    m.slice(0,5).forEach(c=>{
        const d=document.createElement('div'); d.innerHTML=`<strong>${c.nom}</strong> ${c.prenom}`;
        d.onclick=()=>{document.getElementById('client-nom').value=c.nom;document.getElementById('client-prenom').value=c.prenom;document.getElementById('client-tel').value=c.tel;b.style.display='none';};
        b.appendChild(d);
    }); b.style.display='block';
}

// =======================================================
// 5. HISTORIQUE & MODIFS (AVEC FILTRES & TOTAUX)
// =======================================================
function ouvrirSousOngletHistorique(type) {
    currentHistoriqueType = type;
    const b1=document.getElementById('btn-hist-maritime'); const b2=document.getElementById('btn-hist-aerien');
    if(b1&&b2) { if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} else {b1.classList.remove('active');b2.classList.add('active');} }
    chargerHistoriqueChine();
}

async function chargerHistoriqueChine() {
    const tb = document.getElementById('tbody-historique-chine'); if(!tb) return;
    tb.innerHTML='<tr><td colspan="8">Chargement...</td></tr>';
    const sIn = document.getElementById('search-hist-chine');
    if(sIn) sIn.oninput=()=>{ updateHistoriqueView(sIn.value); };

    try {
        const snap = await db.collection('expeditions').limit(500).get();
        allHistoriqueData = [];
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentHistoriqueType==='maritime' && data.type==='maritime') match=true;
            if(currentHistoriqueType==='aerien' && (data.type||"").startsWith('aerien')) match=true;
            if(match) allHistoriqueData.push({id:d.id, ...data});
        });
        renderGroupFilter(allHistoriqueData, 'filter-container-hist', ()=>updateHistoriqueView(sIn?sIn.value:''));
        updateHistoriqueView('');
    } catch(e) { console.error(e); }
}

function updateHistoriqueView(searchQuery) {
    const tb = document.getElementById('tbody-historique-chine'); tb.innerHTML='';
    let filtered = allHistoriqueData.filter(d => {
        if(selectedGroupsHistorique.length > 0 && !selectedGroupsHistorique.includes(d.refGroupe)) return false;
        if(searchQuery && !JSON.stringify(d).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });
    
    // DANS updateHistoriqueView (script.js)

    // Tri par Groupe DÉCROISSANT (EV10 avant EV9), puis par Référence
    filtered.sort((a, b) => {
        const gA = a.refGroupe || "";
        const gB = b.refGroupe || "";
        
        // On extrait les numéros (ex: "EV10" devient 10)
        const numA = parseInt(gA.replace('EV', '')) || 0;
        const numB = parseInt(gB.replace('EV', '')) || 0;

        // Si les numéros sont différents, on trie du plus grand au plus petit (B - A)
        if (numA !== numB) {
            return numB - numA; 
        }
        
        // Si c'est le même groupe, on trie par référence alphabétique
        return (a.reference || "").localeCompare(b.reference || "");
    });

    historiqueCharges = []; // Reset pour export
    let curGrp=null, gQ=0, gV=0, gP=0;
    let tQ=0, tV=0, tP=0;

    filtered.forEach((d, idx) => {
        historiqueCharges.push(d);

        if(curGrp!==null && d.refGroupe!==curGrp) {
            let u = currentHistoriqueType==='aerien'?'Kg':'CBM';
            tb.innerHTML += `<tr class="subtotal-row"><td colspan="3">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td>${formatArgent(gP)} CFA</td><td colspan="2"></td></tr>`;
            gQ=0; gV=0; gP=0;
        }
        curGrp = d.refGroupe;

        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? (d.poidsEnvoye||0) : (d.volumeEnvoye||0);
        
        gQ+=parseInt(d.quantiteEnvoyee)||0; gV+=parseFloat(pv); 
        tQ+=parseInt(d.quantiteEnvoyee)||0; tV+=parseFloat(pv);

        let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
        let final = pB - (d.remise||0);
        gP+=final; tP+=final;
        
        let dateS = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-';
        let pvStr = pv + (isAir?' Kg':' CBM');
        let mod = d.dernierModificateur ? `<span class="modif-info">Par ${d.dernierModificateur}</span>` : '-';
        const j = JSON.stringify({id:d.id, ...d}).replace(/'/g, "&#39;");

        tb.innerHTML += `<tr class="interactive-table-row" onclick='ouvrirModalModifViaData("${encodeURIComponent(j)}")'><td>${d.reference}</td><td>${dateS}</td><td>${d.nom} ${d.prenom}</td><td>${d.quantiteEnvoyee}</td><td>${pvStr}</td><td>${formatArgent(final)} CFA</td><td>${mod}</td><td><i class="fas fa-edit"></i></td></tr>`;

        if(idx === filtered.length-1) {
            let u = isAir?'Kg':'CBM';
            tb.innerHTML += `<tr class="subtotal-row"><td colspan="3">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td>${formatArgent(gP)} CFA</td><td colspan="2"></td></tr>`;
        }
    });

    document.getElementById('total-hist-qty').innerText = tQ;
    let uTot = currentHistoriqueType==='aerien'?' Kg':' CBM';
    document.getElementById('total-hist-vol').innerText = tV.toFixed(2) + uTot;
    if(document.getElementById('total-hist-prix')) document.getElementById('total-hist-prix').innerText = formatArgent(tP) + ' CFA';
}

function renderGroupFilter(data, containerId, callback) {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = '<span class="filter-title">Filtrer par Groupe :</span>';
    const groups = [...new Set(data.map(d => d.refGroupe).filter(g => g))];
    groups.sort((a,b) => parseInt(a.replace('EV','')) - parseInt(b.replace('EV','')));
    groups.forEach(g => {
        const label = document.createElement('label');
        label.className = 'filter-option';
        label.innerHTML = `<input type="checkbox" value="${g}"> ${g}`;
        label.querySelector('input').onchange = (e) => {
            const targetArr = containerId.includes('hist') ? selectedGroupsHistorique : selectedGroupsReception;
            if(e.target.checked) targetArr.push(g); else { const i = targetArr.indexOf(g); if(i>-1) targetArr.splice(i,1); }
            callback();
        };
        container.appendChild(label);
    });
}

// --- MODAL MODIF ---
const modalModif = document.getElementById('modal-modif-chine');
function ouvrirModalModifViaData(enc) { ouvrirModalModif(JSON.parse(decodeURIComponent(enc))); }
function ouvrirModalModif(envoi) {
    currentModifEnvoi = envoi;
    currentEnvoi = envoi; // On lie la variable pour que les fonctions PDF marchent !
    if(modalModif) {
        modalModif.style.display = 'flex';
        
        // On remplit les champs INPUT au lieu de chercher des SPAN qui n'existent pas
        document.getElementById('modif-nom').value = envoi.nom || '';
        document.getElementById('modif-prenom').value = envoi.prenom || '';
        document.getElementById('modif-tel').value = envoi.tel || '';
        chargerGroupesDansModif(envoi.refGroupe);
        
        document.getElementById('modif-qte').value = envoi.quantiteEnvoyee;
        document.getElementById('modif-remise').value = envoi.remise || 0;
        
        const elP = document.getElementById('modif-poids');
        if((envoi.type||"").startsWith('aerien')) elP.value = envoi.poidsEnvoye;
        else elP.value = envoi.volumeEnvoye;
        
        calculerPrixModif();
    }
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
    
    const nom = document.getElementById('modif-nom').value;
    const prenom = document.getElementById('modif-prenom').value;
    const tel = document.getElementById('modif-tel').value;
    const q = parseInt(document.getElementById('modif-qte').value) || 0;
    const v = parseFloat(document.getElementById('modif-poids').value) || 0;
    const r = parseInt(document.getElementById('modif-remise').value) || 0;
    
    // NOUVEAU : Récupération du nouveau groupe
    const nouveauGroupe = document.getElementById('modif-groupe-select').value;

    let up = { 
        nom: nom, prenom: prenom, tel: tel, 
        quantiteEnvoyee: q, remise: r,
        dernierModificateur: currentRole === 'chine' ? 'Agence Chine' : 'Agence Abidjan', 
        dateModification: firebase.firestore.FieldValue.serverTimestamp() 
    };

    // Gestion Poids/Vol et Prix
    if((currentModifEnvoi.type || "").startsWith('aerien')) up.poidsEnvoye = v; 
    else up.volumeEnvoye = v;
    
    let t = 0;
    if(currentModifEnvoi.type === 'aerien_normal') t = PRIX_AERIEN_NORMAL;
    else if(currentModifEnvoi.type === 'aerien_express') t = PRIX_AERIEN_EXPRESS;
    else t = PRIX_MARITIME_CBM;
    up.prixEstime = formatArgent((v * t) - r) + ' CFA';

    // --- LOGIQUE DE CHANGEMENT DE GROUPE ---
    if (nouveauGroupe && nouveauGroupe !== currentModifEnvoi.refGroupe) {
        // 1. On change le groupe
        up.refGroupe = nouveauGroupe;
        
        // 2. On essaie de mettre à jour la Référence visuelle aussi (ex: MRT-012-EV3 -> MRT-012-EV4)
        // On vérifie si la référence finit bien par le vieux groupe
        if (currentModifEnvoi.reference && currentModifEnvoi.reference.endsWith(currentModifEnvoi.refGroupe)) {
            // On remplace la fin de la chaine
            const ancienneFin = currentModifEnvoi.refGroupe;
            const nouvelleRef = currentModifEnvoi.reference.replace(ancienneFin, nouveauGroupe);
            up.reference = nouvelleRef;
        }
    }
    // ---------------------------------------

    try {
        await db.collection('expeditions').doc(currentModifEnvoi.id).update(up);
        alert('Modifié avec succès.');
        modalModif.style.display = 'none';
        
        // On rafraîchit la liste qui est derrière
        if (typeof chargerHistoriqueChine === "function") chargerHistoriqueChine();
        
    } catch(e) { 
        alert(e.message); 
    }
}
function fermerModalModif(e) { if(e.target===modalModif || e.target.classList.contains('modal-close')) modalModif.style.display='none'; }

// =======================================================
// 6. RECEPTION (FILTRES & TOTAUX)
// =======================================================
function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    const b1=document.getElementById('btn-rec-maritime'); const b2=document.getElementById('btn-rec-aerien');
    if(b1&&b2) { if(type==='maritime'){b1.classList.add('active');b2.classList.remove('active');} else {b1.classList.remove('active');b2.classList.add('active');} }
    chargerClients();
}

async function chargerClients() {
    const tb = document.getElementById('liste-clients-tbody'); if(!tb) return;
    tb.innerHTML='<tr><td colspan="9">Chargement...</td></tr>';
    
    const sIn = document.getElementById('search-input');
    if(sIn) sIn.oninput=()=>{ updateReceptionView(sIn.value); };

    try {
        const snap = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        allReceptionData = [];
        snap.forEach(d => {
            const data = d.data();
            let match=false;
            if(currentReceptionType==='maritime' && data.type==='maritime') match=true;
            if(currentReceptionType==='aerien' && (data.type||"").startsWith('aerien')) match=true;
            if(match) allReceptionData.push({id:d.id, ...data});
        });
        
        // Tri Groupe DÉCROISSANT
        allReceptionData.sort((a, b) => {
            const gA = a.refGroupe || "";
            const gB = b.refGroupe || "";

            const numA = parseInt(gA.replace('EV', '')) || 0;
            const numB = parseInt(gB.replace('EV', '')) || 0;

            // Du plus grand au plus petit
            if (numA !== numB) return numB - numA;

            return gA.localeCompare(gB);
        });

        renderGroupFilter(allReceptionData, 'filter-container-rec', () => updateReceptionView(sIn?sIn.value:''));
        updateReceptionView('');
    } catch(e) { console.error(e); }
}

function updateReceptionView(searchQuery) {
    const tb = document.getElementById('liste-clients-tbody'); tb.innerHTML='';
    let filtered = allReceptionData.filter(d => {
        if(selectedGroupsReception.length > 0 && !selectedGroupsReception.includes(d.refGroupe)) return false;
        if(searchQuery && !JSON.stringify(d).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    let curGrp=null, gQ=0, gV=0, gP=0;
    let tQ=0, tV=0, tP=0; // Variables déclarées ici pour éviter l'erreur ReferenceError
    clientsCharges = filtered; 

    filtered.forEach((d, idx) => {
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? (d.poidsEnvoye||0) : (d.volumeEnvoye||0);
        
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g,''))||0;
        let pN = pB - (d.remise||0);
        let res = pN - (parseInt(d.montantPaye)||0);

        // Rupture
        if(curGrp!==null && d.refGroupe!==curGrp) {
            let u = currentReceptionType.startsWith('aerien')?'Kg':'CBM';
            tb.innerHTML += `<tr class="subtotal-row"><td colspan="5">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td>${formatArgent(gP)}</td><td></td></tr>`;
            gQ=0; gV=0; gP=0;
        }
        curGrp = d.refGroupe;

        gQ += parseInt(d.quantiteEnvoyee)||0; gV += parseFloat(pv); gP += res;
        tQ += parseInt(d.quantiteEnvoyee)||0; tV += parseFloat(pv); tP += res;

        let cl = (d.status||"").includes('Conforme')?'status-conforme':(d.status||"").includes('Ecart')?'status-ecart':'status-attente';
        const safe = encodeURIComponent(JSON.stringify({id:d.id, ...d}));
        tb.innerHTML += `<tr class="interactive-table-row" onclick='selectionnerClientViaData("${safe}")'><td>${d.reference}</td><td>${new Date(d.date).toLocaleDateString()}</td><td>${d.nom} ${d.prenom}</td><td>${d.description}</td><td>${d.type}</td><td>${d.quantiteEnvoyee}</td><td>${pv}</td><td>${formatArgent(res)} CFA</td><td><span class="status-badge ${cl}">${d.status||'-'}</span></td></tr>`;
        
        if(idx === filtered.length-1) {
             let u = isAir?'Kg':'CBM';
             tb.innerHTML += `<tr class="subtotal-row"><td colspan="5">TOTAL ${curGrp}</td><td>${gQ}</td><td>${gV.toFixed(2)} ${u}</td><td>${formatArgent(gP)}</td><td></td></tr>`;
        }
    });

    document.getElementById('total-rec-qty').innerText = tQ;
    document.getElementById('total-rec-vol').innerText = tV.toFixed(2);
    document.getElementById('total-rec-prix').innerText = formatArgent(tP) + ' CFA';
}

function selectionnerClientViaData(encodedData) {
    const envoi = JSON.parse(decodeURIComponent(encodedData));
    selectionnerClient(envoi);
}

// Modal Reception
const modalBackdrop = document.getElementById('modal-backdrop');
function selectionnerClient(envoi) {
    currentEnvoi = envoi;
    if (modalBackdrop) modalBackdrop.style.display = 'flex';

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    set('client-selectionne', envoi.nom);
    set('ref-attendue', envoi.reference);
    set('desc-attendue', envoi.description);
    const tEl = document.getElementById('tel-attendu'); if (tEl) tEl.innerText = envoi.tel;
    set('qte-attendue', (envoi.quantiteEnvoyee || 0) + ' colis');
    
    const expEl = document.getElementById('expediteur-affiche');
    if(expEl) expEl.innerText = envoi.expediteur || 'AMT TRANSIT CARGO';

    let isAir = (envoi.type || "").startsWith('aerien');
    set('poids-attendu', (isAir ? envoi.poidsEnvoye : envoi.volumeEnvoye) + (isAir ? ' Kg' : ' CBM'));

    let pB = parseInt((envoi.prixEstime || "0").replace(/\D/g, '')) || 0;
    let tot = pB - (envoi.remise || 0);
    let dej = parseInt(envoi.montantPaye) || 0;
    let res = tot - dej;

    set('prix-attendu', formatArgent(tot) + ' CFA');
    const elR = document.getElementById('prix-restant');
    if (elR) {
        if (res <= 0) { elR.innerText = "SOLDÉ (0 CFA)"; elR.style.color = "green"; document.getElementById('montant-paye').value = 0; }
        else { elR.innerText = formatArgent(res) + ' CFA'; elR.style.color = "#dc3545"; document.getElementById('montant-paye').value = res; }
    }

    const phDiv = document.getElementById('photos-recues-apercu');
    if (phDiv) {
        phDiv.innerHTML = '';
        if (envoi.photosURLs && envoi.photosURLs.length > 0) {
            document.getElementById('photos-recues-container').style.display = 'block';
            envoi.photosURLs.forEach(u => { const i = document.createElement('img'); i.src = u; phDiv.appendChild(i); });
        } else document.getElementById('photos-recues-container').style.display = 'none';
    }

    document.getElementById('quantite-recue').value = '';
    document.getElementById('poids-recu').value = '';
    const lb = document.getElementById('label-poids-recu');
    if (lb) lb.innerText = isAir ? "Poids Reçu (Kg)" : "Vol Reçu (CBM)";

    updateModalStatus(envoi);
}
function updateModalStatus(envoi) {
    const st = envoi.status || 'En attente';
    const el = document.getElementById('reception-status');
    const sum = document.getElementById('reception-summary');
    if (el) { el.innerText = st; el.className = 'status-badge ' + (st.includes('Conforme') ? 'status-conforme' : st.includes('Ecart') ? 'status-ecart' : 'status-attente'); }
    if (sum) sum.innerHTML = `Reçu: <strong>${envoi.quantiteRecue || 0}</strong> | <strong>${envoi.poidsRecu || 0}</strong>`;
}
function fermerModal(e) { if (e.target === modalBackdrop || e.target.classList.contains('modal-close') || e.target.classList.contains('btn-secondaire')) modalBackdrop.style.display = 'none'; }

async function enregistrerReception() {
    if (!currentEnvoi) return;
    const q = parseInt(document.getElementById('quantite-recue').value) || 0;
    const p = parseFloat(document.getElementById('poids-recu').value) || 0;
    const m = parseInt(document.getElementById('montant-paye').value) || 0;
    const via = document.getElementById('moyen-paiement').value;

    const nQ = (currentEnvoi.quantiteRecue || 0) + q;
    const nP = (currentEnvoi.poidsRecu || 0) + p;
    const nM = (currentEnvoi.montantPaye || 0) + m;

    let st = 'Reçu - Conforme';
    const diffQ = nQ - currentEnvoi.quantiteEnvoyee;
    const diffP = nP - ((currentEnvoi.type || "").startsWith('aerien') ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye);

    if (diffQ < 0) st = 'Reçu - Ecart';
    else if (diffQ > 0) st = 'Reçu - Supérieur';
    else { if (Math.abs(diffP) > 0.1) st = (diffP > 0 ? 'Reçu - Supérieur' : 'Reçu - Ecart'); else st = 'Reçu - Conforme'; }

    let agent = currentUser ? (currentRole === 'abidjan' ? "AGENCE ABIDJAN" : currentUser.email) : "Inconnu";
    let up = { quantiteRecue: nQ, poidsRecu: nP, montantPaye: nM, status: st, moyenPaiement: via, datePaiement: firebase.firestore.FieldValue.serverTimestamp() };
    if (m > 0) up.historiquePaiements = firebase.firestore.FieldValue.arrayUnion({ date: firebase.firestore.Timestamp.now(), montant: m, moyen: via, agent: agent });

    try {
        await db.collection('expeditions').doc(currentEnvoi.id).update(up);
        alert("Validé !");
        modalBackdrop.style.display = 'none';
        chargerClients();
    } catch (e) { alert(e.message); }
}

// =======================================================
// 7. COMPTA
// =======================================================
function ouvrirSousOngletCompta(type) {
    currentComptaType = type;
    document.querySelectorAll('.sub-nav-link').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(type)) btn.classList.add('active');
    });
    chargerCompta(type);
}

async function chargerCompta(type) {
    const tbody = document.getElementById('tbody-compta');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10">Chargement...</td></tr>';
    try {
        const snapE = await db.collection('expeditions').get();
        const snapS = await db.collection('depenses').orderBy('date', 'desc').get();
        let items = [];
        snapE.forEach(d => {
            const data = d.data();
            let match = false;
            if (type === 'maritime' && data.type === 'maritime') match = true;
            if (type === 'aerien' && (data.type || "").startsWith('aerien')) match = true;
            if (match) {
                let dRef = data.datePaiement ? data.datePaiement.toDate() : new Date(data.date);
                let grp = data.refGroupe || "ZZZ";
                if (grp === "ZZZ" && data.reference) { let pts = data.reference.split('-'); if (pts.length > 0 && pts[pts.length - 1].startsWith('EV')) grp = pts[pts.length - 1]; }
                items.push({ ...data, id: d.id, isDep: false, sortDate: dRef, grp: grp, sortRef: data.reference || "ZZZ", hist: data.historiquePaiements || [] });
            }
        });
        snapS.forEach(d => {
            const data = d.data();
            if (data.type === type) {
                let g = (data.refGroupe && data.refGroupe.trim()) ? data.refGroupe.toUpperCase() : "ZZZ_GEN";
                items.push({ ...data, id: d.id, isDep: true, sortDate: new Date(data.date), grp: g, sortRef: "DEPENSE" });
            }
        });
        items.sort((a, b) => {
            // Si les deux éléments appartiennent à des groupes "EV"
            if (a.grp.startsWith('EV') && b.grp.startsWith('EV')) {
                // On extrait les numéros
                const numA = parseInt(a.grp.replace('EV', '')) || 0;
                const numB = parseInt(b.grp.replace('EV', '')) || 0;
                
                // Tri DÉCROISSANT (Le plus grand numéro en premier : EV4 avant EV3)
                return numB - numA;
            }
            // Sinon tri alphabétique standard
            return a.grp.localeCompare(b.grp);
        });

        let cred = 0, caisse = 0, bonus = 0;
        let modes = { Esp: 0, Chq: 0, OM: 0, Wav: 0, CB: 0 }, outM = { Esp: 0, Chq: 0, OM: 0, Wav: 0, CB: 0 };
        let curGrp = null, grpDu = 0, grpReste = 0, grpEntree = 0, grpSortie = 0;
        
        // GRAND TOTAL (NOUVEAU)
        let GT_Q = 0, GT_V = 0;
        
        tbody.innerHTML = '';

        items.forEach((it, idx) => {
            if (curGrp !== null && it.grp !== curGrp && !curGrp.startsWith('ZZZ')) {
                tbody.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${curGrp}</td><td>${formatArgent(grpDu)}</td><td>${formatArgent(grpReste)}</td><td>${formatArgent(grpEntree)}</td><td>${formatArgent(grpSortie)}</td><td></td></tr>`;
                grpDu = 0; grpReste = 0; grpEntree = 0; grpSortie = 0;
            }
            curGrp = it.grp;

            let dS = it.sortDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
            let rowClass = `row-month-${it.sortDate.getMonth()}`;

            if (it.isDep) {
                // C'est une dépense
                let m = parseFloat(it.montant) || 0; caisse -= m; grpSortie += m;
                let v = it.moyenPaiement || 'Espèce';
                if (v.includes('Chèque')) outM.Chq += m; else if (v.includes('OM')) outM.OM += m; else if (v.includes('Wave')) outM.Wav += m; else if (v.includes('CB')) outM.CB += m; else outM.Esp += m;
                
                // --- MODIFICATION ICI : On vérifie le rôle pour le bouton supprimer ---
                const btnSuppr = (currentRole === 'spectateur') ? '' : `<button class="btn-suppr-small" onclick="supprimerDepense('${it.id}')">X</button>`;
                
                tbody.innerHTML += `<tr class="${rowClass}"><td>${dS}</td><td>-</td><td>${it.motif}</td><td>Dépense</td><td>-</td><td>-</td><td>-</td><td class="text-red">${formatArgent(m)}</td><td>${btnSuppr}</td></tr>`;
            } else {
                // CUMUL GRAND TOTAL
                GT_Q += parseInt(it.quantiteEnvoyee)||0;
                GT_V += parseFloat(type.startsWith('aerien')?it.poidsEnvoye:it.volumeEnvoye)||0;

                let pB = parseInt((it.prixEstime || "0").replace(/\D/g, '')) || 0;
                let du = pB - (it.remise || 0);
                let paye = 0;
                if (it.hist.length > 0) {
                    it.hist.forEach(h => {
                        let m = parseFloat(h.montant) || 0; paye += m;
                        let t = h.moyen || 'Espèce';
                        if (t.includes('Chèque')) modes.Chq += m; else if (t.includes('OM')) modes.OM += m; else if (t.includes('Wave')) modes.Wav += m; else if (t.includes('CB')) modes.CB += m; else modes.Esp += m;
                    });
                } else { paye = it.montantPaye || 0; modes.Esp += paye; }
                let r = du - paye;
                caisse += paye; if (r > 0) cred += r;
                let diff = paye - du; if (diff > 0) bonus += diff; else if (diff < 0 && Math.abs(diff) < 500) bonus += diff;
                grpDu += du; grpReste += (r > 0 ? r : 0); grpEntree += paye;
                let j = JSON.stringify({ id: it.id, nom: it.nom, reference: it.reference, history: it.hist }).replace(/'/g, "&#39;");
                tbody.innerHTML += `<tr class="${rowClass} interactive-table-row" onclick='voirHistoriquePaiementViaData("${encodeURIComponent(JSON.stringify({ id: it.id, nom: it.nom, reference: it.reference, history: it.hist }))}")'><td>${dS}</td><td>${it.reference}</td><td>${it.description}</td><td>${it.nom} ${it.prenom}</td><td>${formatArgent(du)}</td><td style="color:${r > 0 ? 'red' : 'green'}">${formatArgent(r)}</td><td class="text-green">${formatArgent(paye)}</td><td>-</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
        });
        if (curGrp && !curGrp.startsWith('ZZZ')) tbody.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${curGrp}</td><td>${formatArgent(grpDu)}</td><td>${formatArgent(grpReste)}</td><td>${formatArgent(grpEntree)}</td><td>${formatArgent(grpSortie)}</td><td></td></tr>`;

        // GRAND TOTAL FOOTER
        let u = type==='aerien'?'Kg':'CBM';
        const footerRow = document.createElement('tr');
        footerRow.style.cssText = "background-color:#000; color:cyan; font-weight:bold; font-size:1.1em; text-align:center;";
        footerRow.innerHTML = `<td colspan="9">GRAND TOTAL (Tous Groupes) : ${GT_Q} Colis  |  ${GT_V.toFixed(2)} ${u}</td>`;
        tbody.appendChild(footerRow);

        document.getElementById('total-credit').innerText = formatArgent(cred) + ' CFA';
        const elC = document.getElementById('total-caisse');
        elC.innerText = formatArgent(caisse) + ' CFA';
        elC.className = caisse >= 0 ? 'text-green' : 'text-red';
        document.getElementById('total-bonus').innerText = formatArgent(bonus) + ' CFA';

        document.getElementById('pay-espece-in').innerText = formatArgent(modes.Esp); document.getElementById('pay-espece-out').innerText = formatArgent(outM.Esp);
        document.getElementById('pay-cheque-in').innerText = formatArgent(modes.Chq); document.getElementById('pay-cheque-out').innerText = formatArgent(outM.Chq);
        document.getElementById('pay-om-in').innerText = formatArgent(modes.OM); document.getElementById('pay-om-out').innerText = formatArgent(outM.OM);
        document.getElementById('pay-wave-in').innerText = formatArgent(modes.Wav); document.getElementById('pay-wave-out').innerText = formatArgent(outM.Wav);
        document.getElementById('pay-cb-in').innerText = formatArgent(modes.CB); document.getElementById('pay-cb-out').innerText = formatArgent(outM.CB);

        let tIn = Object.values(modes).reduce((a, b) => a + b, 0); let tOut = Object.values(outM).reduce((a, b) => a + b, 0);
        document.getElementById('pay-total-in').innerText = formatArgent(tIn);
        document.getElementById('pay-total-out').innerText = formatArgent(tOut);
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="10">Erreur chargement.</td></tr>'; }
}

function voirHistoriquePaiementViaData(enc) {
    const item = JSON.parse(decodeURIComponent(enc));
    voirHistoriquePaiement(item);
}

const modalHist = document.getElementById('modal-historique');
// --- REMPLACEZ LA FONCTION voirHistoriquePaiement PAR CELLE-CI ---
function voirHistoriquePaiement(item) {
    if (item.isDepense) return;
    
    // 1. On stocke l'ID du document en cours pour pouvoir le modifier plus tard
    currentIdPaiementOpen = item.id;
    
    modalHist.style.display = 'flex';
    document.getElementById('hist-client-nom').innerText = item.nom;
    
    // Si vous avez ajouté l'option de ref dans l'étape précédente :
    const refEl = document.getElementById('hist-ref');
    if(refEl) refEl.innerText = item.reference;

    const tb = document.getElementById('tbody-historique'); 
    tb.innerHTML = '';

    if (item.history && item.history.length > 0) {
        // On boucle avec (h, index) pour savoir quel numéro de ligne supprimer
        item.history.forEach((h, index) => {
            let d = new Date(h.date.seconds * 1000).toLocaleDateString('fr-FR');
            
            // Sécurité : Pas de bouton supprimer pour les spectateurs/auditeurs
            let btnSuppr = '';
            if (currentRole !== 'spectateur') {
                btnSuppr = `<button class="btn-suppr-small" onclick="supprimerPaiement(${index})" style="background-color: #c0392b; color: white; border: none; border-radius: 3px; cursor: pointer;">X</button>`;
            }

            tb.innerHTML += `
                <tr>
                    <td>${d}</td>
                    <td class="text-green">${formatArgent(parseInt(h.montant))} CFA</td>
                    <td>${h.moyen}</td>
                    <td>${h.agent || '-'}</td>
                    <td>${btnSuppr}</td>
                </tr>`;
        });
    } else {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center">Aucun historique de paiement.</td></tr>';
    }
}

// --- AJOUTEZ CETTE NOUVELLE FONCTION ---
async function supprimerPaiement(index) {
    if (!currentIdPaiementOpen) return;
    if (!confirm("⚠️ Êtes-vous sûr de vouloir ANNULER ce paiement ?\nLe montant sera déduit du total payé.")) return;

    try {
        // 1. Récupérer le document actuel dans la base de données
        const docRef = db.collection('expeditions').doc(currentIdPaiementOpen);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) { alert("Erreur: Document introuvable"); return; }
        
        const data = docSnap.data();
        let historique = data.historiquePaiements || [];

        // 2. Vérifier que l'index existe
        if (index < 0 || index >= historique.length) return;

        // 3. Récupérer le montant à annuler
        const montantAAnnuler = parseInt(historique[index].montant) || 0;

        // 4. Retirer la ligne du tableau
        historique.splice(index, 1);

        // 5. Recalculer le nouveau montant total payé
        const nouveauMontantPaye = (parseInt(data.montantPaye) || 0) - montantAAnnuler;

        // 6. Mise à jour dans Firebase
        await docRef.update({
            historiquePaiements: historique,
            montantPaye: nouveauMontantPaye
            // On ne change pas le statut automatiquement ici par précaution, 
            // mais vous pourriez recalculer si c'est "Soldé" ou "Reste à payer" si vous vouliez.
        });

        alert("Paiement annulé avec succès.");
        
        // 7. Fermer le modal et rafraîchir le tableau principal
        modalHist.style.display = 'none';
        chargerCompta(currentComptaType); // Rafraîchit la page derrière

    } catch (e) {
        console.error(e);
        alert("Erreur lors de l'annulation : " + e.message);
    }
}
function fermerModalHistorique(e) { if (e.target === modalHist || e.target.classList.contains('modal-close') || e.target.classList.contains('btn-secondaire')) modalHist.style.display = 'none'; }

const modalDepense = document.getElementById('modal-depense');
function ouvrirModalDepense() { modalDepense.style.display = 'flex'; }
function fermerModalDepense(e) { if (e.target === modalDepense || e.target.classList.contains('modal-close')) modalDepense.style.display = 'none'; }
async function enregistrerDepense() {
    const d = document.getElementById('depense-date').value; const mt = document.getElementById('depense-motif').value;
    const m = parseFloat(document.getElementById('depense-montant').value) || 0;
    const grp = document.getElementById('depense-groupe').value.toUpperCase().trim();
    if (!d || !mt || m <= 0) { alert('Erreur saisie.'); return; }
    try {
        await db.collection('depenses').add({ date: d, type: document.getElementById('depense-type').value, refGroupe: grp, motif: mt, montant: m, moyenPaiement: document.getElementById('depense-moyen').value, creeLe: firebase.firestore.FieldValue.serverTimestamp() });
        alert('OK'); modalDepense.style.display = 'none'; document.getElementById('form-depense').reset(); chargerCompta(currentComptaType);
    } catch (e) { alert(e.message); }
}
async function supprimerDepense(id) { if (confirm('Supprimer ?')) { await db.collection('depenses').doc(id).delete(); chargerCompta(currentComptaType); } }

function chargerLogo() { return new Promise(r => { const i = new Image(); i.src = '/logo_amt.png'; i.onload = () => r(i); i.onerror = () => r(null); }); }

async function genererEtiquette() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', [100, 60]); 
    const logo = await chargerLogo();
    doc.setDrawColor(255, 165, 0); doc.setLineWidth(1.5); doc.rect(2, 2, 96, 56); doc.setLineWidth(0.5); doc.rect(4, 4, 92, 52);
    if (logo) doc.addImage(logo, 'PNG', 6, 6, 12, 12);
    doc.setTextColor(255, 140, 0); doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("amt TRANSIT CARGO", 22, 10);
    doc.setTextColor(0); doc.setFontSize(8); doc.text("+225 89 84 46 57", 22, 15); doc.setFontSize(24); doc.text("N", 88, 12);
    doc.setDrawColor(0); doc.setLineWidth(0.1);
    let y = 22; const x = 6; const lineW = 88;
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text("EXPEDITEUR", x, y); y += 3;
    doc.setFont("helvetica", "normal"); doc.text(`NOM ET PRENOM: ${currentEnvoi.expediteur || 'AMT TRANSIT CARGO'}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    doc.text(`NUMERO: ${currentEnvoi.telExpediteur || '+225 0703165050'}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 6;
    doc.setFont("helvetica", "bold"); doc.text("DESTINATAIRE", x, y); y += 3;
    doc.setFont("helvetica", "normal"); doc.text(`NOM ET PRENOM: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    doc.text(`NUMERO: ${currentEnvoi.tel}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    let pv = (currentEnvoi.type || "").startsWith('aerien') ? `${currentEnvoi.poidsEnvoye} Kg` : `${currentEnvoi.volumeEnvoye} CBM`;
    doc.text(`KILOS: ${pv}  |  COLIS: ${currentEnvoi.quantiteEnvoyee}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("+8619515284352      +2250703165050", 50, 56, { align: 'center' });
    doc.save(`Etiquette_${currentEnvoi.nom}.pdf`);
}

async function genererFacture() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'PNG', 10, 10, 30, 30);
    doc.setFontSize(18); doc.setTextColor(21, 96, 158); doc.setFont("helvetica", "bold"); doc.text("AMT TRANSIT CARGO", 50, 20);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Agence: Abidjan - Chine", 50, 26); doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 50, 32);
    doc.line(10, 42, 200, 42);
    let y = 50; const gap = 7;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("INFORMATIONS CLIENT", 10, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.text(`Nom: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y); y += 5; doc.text(`Tél: ${currentEnvoi.tel}`, 10, y); y += 5; doc.text(`Réf: ${currentEnvoi.reference}`, 10, y); y += 10;
    const headers1 = [["SERVICES", "DESCRIPTION", "QUANTITE", "PRIX UNITAIRE", "PRIX TOTAL"]];
    let pBrut = parseInt((currentEnvoi.prixEstime || "0").replace(/\D/g, '')) || 0;
    let pNet = pBrut - (currentEnvoi.remise || 0);
    let vol = (currentEnvoi.type || "").startsWith('aerien') ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye;
    let pu = vol > 0 ? (pNet / vol).toFixed(0) : 0;
    const data1 = [[(currentEnvoi.type || "").toUpperCase(), currentEnvoi.description || '-', `${currentEnvoi.quantiteEnvoyee} Colis / ${vol}`, formatArgent(pu), formatArgent(pNet)]];
    doc.autoTable({ startY: y, head: headers1, body: data1, theme: 'grid', headStyles: { fillColor: [21, 96, 158] }, styles: { valign: 'middle' } });
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("HISTORIQUE DES PAIEMENTS", 10, y); y += 5;
    const headers2 = [["DATE", "PRIX TOTAL", "MNT. PAYE", "RESTANT", "AGENT"]];
    let histRows = []; let cumul = 0;
    if (currentEnvoi.historiquePaiements && currentEnvoi.historiquePaiements.length > 0) {
        let sorted = currentEnvoi.historiquePaiements.sort((a, b) => a.date.seconds - b.date.seconds);
        sorted.forEach(h => {
            let m = parseInt(h.montant) || 0; cumul += m; let resteALinstantT = pNet - cumul; let dateStr = new Date(h.date.seconds * 1000).toLocaleString('fr-FR'); let agent = h.agent || "-";
            histRows.push([dateStr, formatArgent(pNet), `${formatArgent(m)} (${h.moyen})`, formatArgent(resteALinstantT), agent]);
        });
    } else {
        let deja = parseInt(currentEnvoi.montantPaye) || 0;
        if (deja > 0) histRows.push(["-", formatArgent(pNet), formatArgent(deja), formatArgent(pNet - deja), "Ancien Système"]); else histRows.push(["-", formatArgent(pNet), "0", formatArgent(pNet), "-"]);
    }
    doc.autoTable({ startY: y, head: headers2, body: histRows, theme: 'striped', headStyles: { fillColor: [50, 50, 50] }, styles: { fontSize: 9 } });
    y = doc.lastAutoTable.finalY + 10;
    let dejaPayeTotal = parseInt(currentEnvoi.montantPaye) || 0;
    let resteFinal = pNet - dejaPayeTotal;
    doc.autoTable({ startY: y, body: [["NET À PAYER", formatArgent(pNet) + " CFA"], ["TOTAL PAYÉ", formatArgent(dejaPayeTotal) + " CFA"], ["RESTE DÛ", formatArgent(resteFinal) + " CFA"]], theme: 'plain', styles: { fontSize: 10, fontStyle: 'bold', halign: 'right', cellPadding: 2 }, columnStyles: { 0: { halign: 'left', cellWidth: 40, fillColor: [240, 240, 240] } }, margin: { left: 130 } });
    y = doc.lastAutoTable.finalY + 20;
    doc.setTextColor(150); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Merci de votre confiance - AMT Transit Cargo", 105, y, { align: 'center' }); doc.text("RC: 929 865 103 | Siège: Abidjan", 105, y + 4, { align: 'center' });
    doc.save(`Facture_${currentEnvoi.nom}.pdf`);
}
function exporterExcel() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Client,Téléphone,Desc,Type,Qté,Poids,Prix Restant,Statut\r\n";
    
    let tQ = 0, tV = 0, tP = 0;

    clientsCharges.forEach(c => {
        let isAir = (c.type||"").startsWith('aerien');
        let pv = isAir ? c.poidsEnvoye : c.volumeEnvoye;

        let pB = parseInt((c.prixEstime||"0").replace(/\D/g, '')) || 0;
        let pN = pB - (c.remise || 0);
        let dej = parseInt(c.montantPaye)||0;
        let rest = pN - dej;

        tQ += parseInt(c.quantiteEnvoyee)||0;
        tV += parseFloat(pv)||0;
        tP += rest;

        csvContent += `"${c.reference}","${c.date}","${c.nom}","${c.tel || ''}","${c.description}","${c.type}",${c.quantiteEnvoyee},"${pv}","${rest}","${c.status}"\r\n`;
    });

    csvContent += `,,,,,,,"TOTAL:",${tQ},"${tV}","${tP}",""\r\n`;

    var link = document.createElement("a"); 
    link.setAttribute("href", encodeURI(csvContent)); 
    link.setAttribute("download", "expeditions.csv"); 
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exporterPDF() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    const { jsPDF } = window.jspdf; 
    const doc = new jsPDF('l', 'mm', 'a4');
    
    const headers = [["Ref", "Date", "Client", "Tél", "Desc", "Type", "Qté", "Poids", "Prix Restant", "Statut"]];
    
    let tQ = 0, tV = 0, tP = 0;

    const body = clientsCharges.map(c => {
        let isAir = (c.type||"").startsWith('aerien');
        let pv = isAir ? c.poidsEnvoye : c.volumeEnvoye;

        let pB = parseInt((c.prixEstime||"0").replace(/\D/g, '')) || 0;
        let pN = pB - (c.remise || 0);
        let dej = parseInt(c.montantPaye)||0;
        let rest = pN - dej;

        tQ += parseInt(c.quantiteEnvoyee)||0;
        tV += parseFloat(pv)||0;
        tP += rest;

        return [
            c.reference, c.date, c.nom, c.tel || '', c.description, c.type, 
            c.quantiteEnvoyee, pv, formatArgent(rest), c.status
        ];
    });
    
    doc.autoTable({ 
        head: headers, 
        body: body, 
        styles: { fontSize: 7 },
        foot: [[
            "TOTAL GÉNÉRAL", "", "", "", "", "", 
            tQ, 
            tV.toFixed(2), 
            formatArgent(tP) + " CFA", 
            ""
        ]],
        footStyles: { fillColor: [50, 50, 50], textColor: [0, 255, 255], fontStyle: 'bold' }
    }); 
    doc.save('expeditions.pdf');
}
function exporterHistoriqueExcel() {
    if (historiqueCharges.length === 0) { alert("Rien à exporter."); return; }
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Destinataire,Telephone,Description,Type,Qte,Poids/Vol,Prix Final,Statut\r\n";
    let tQ = 0, tV = 0, tP = 0;
    historiqueCharges.forEach(d => {
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? d.poidsEnvoye : d.volumeEnvoye;
        let st = d.status || 'En attente';
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g, '')) || 0;
        let final = pB - (d.remise || 0);
        tQ += parseInt(d.quantiteEnvoyee)||0; tV += parseFloat(pv)||0; tP += final;
        csvContent += `"${d.reference}","${d.date}","${d.nom} ${d.prenom}","${d.tel}","${d.description}","${d.type}",${d.quantiteEnvoyee},"${pv}","${final}","${st}"\r\n`;
    });
    csvContent += `,,,,,,,"TOTAL:",${tQ},"${tV}","${tP}",""\r\n`;
    var link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "Historique_Envois.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exporterHistoriquePDF() {
    if (historiqueCharges.length === 0) { alert("Rien à exporter."); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', 'a4');
    const headers = [["Ref", "Date", "Destinataire", "Tél", "Desc", "Type", "Qté", "Poids/Vol", "Prix Final", "Statut"]];
    let tQ = 0, tV = 0, tP = 0;
    const body = historiqueCharges.map(d => {
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? d.poidsEnvoye : d.volumeEnvoye;
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g, '')) || 0;
        let final = pB - (d.remise || 0);
        tQ += parseInt(d.quantiteEnvoyee)||0; tV += parseFloat(pv)||0; tP += final;
        return [d.reference, d.date, `${d.nom} ${d.prenom}`, d.tel, d.description, d.type, d.quantiteEnvoyee, pv, formatArgent(final), d.status || 'En attente'];
    });
    doc.text(`Historique Envois - ${currentHistoriqueType.toUpperCase()}`, 14, 10);
    doc.autoTable({ head: headers, body: body, styles: { fontSize: 7 }, margin: { top: 15 },
        foot: [["TOTAL GÉNÉRAL", "", "", "", "", "", tQ, tV.toFixed(2), formatArgent(tP) + " CFA", ""]],
        footStyles: { fillColor: [50, 50, 50], textColor: [0, 255, 255], fontStyle: 'bold' }
    });
    doc.save('Historique_Envois.pdf');
}
// --- NOUVELLE FONCTION : Charger les groupes existants dans le select ---
async function chargerListeGroupes() {
    const select = document.getElementById('choix-groupe-ref');
    
    // Si l'élément n'existe pas encore (page pas chargée), on arrête pour éviter les erreurs
    if(!select) return;

    // On réinitialise la liste
    select.innerHTML = '<option value="NEW">➕ Créer un nouveau groupe (Auto)</option>';
    
    // Optionnel : Ajouter un texte de chargement temporaire
    const loadingOpt = document.createElement('option');
    loadingOpt.innerText = "Chargement des groupes...";
    select.appendChild(loadingOpt);

    try {
        // On cherche les 100 dernières expéditions pour trouver les groupes récents
        const snap = await db.collection('expeditions')
            .orderBy('creeLe', 'desc')
            .limit(100)
            .get();

        const groupes = new Set();
        snap.forEach(doc => {
            const data = doc.data();
            // On ne garde que les groupes qui commencent par EV
            if (data.refGroupe && data.refGroupe.startsWith('EV')) {
                groupes.add(data.refGroupe);
            }
        });

        // Convertir en tableau et trier (pour avoir EV10, EV9, EV8...)
        const groupesTries = Array.from(groupes).sort((a, b) => {
            const numA = parseInt(a.replace('EV', '')) || 0;
            const numB = parseInt(b.replace('EV', '')) || 0;
            return numB - numA; // Décroissant
        });

        // On retire le message de chargement
        if(loadingOpt) select.removeChild(loadingOpt);

        // On ajoute les options au menu déroulant
        groupesTries.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.innerText = `Compléter le groupe ${g}`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Erreur chargement groupes", e);
        if(loadingOpt) loadingOpt.innerText = "Erreur chargement";
    }
}
// --- FONCTION D'IMPORTATION CSV ---
function importerCSV() {
    const input = document.getElementById('csv-input');
    const file = input.files[0];
    const typeEnvoi = document.getElementById('type-envoi').value;

    // 1. Vérifications de base
    if (!typeEnvoi) {
        alert("Veuillez d'abord choisir un 'Type d'envoi' (Aérien/Maritime) pour savoir si la valeur est en Kg ou CBM.");
        return;
    }
    if (!file) {
        alert("Veuillez sélectionner un fichier CSV.");
        return;
    }

    const reader = new FileReader();
    
    reader.onload = function(e) {
        const text = e.target.result;
        // On découpe par ligne
        const rows = text.split("\n");
        
        let count = 0;

        // On parcourt chaque ligne
        rows.forEach((row, index) => {
            // Nettoyage de la ligne (enlever les espaces inutiles et les retours chariot)
            const cleanRow = row.trim();
            if (!cleanRow) return; // Ignorer lignes vides

            // Découpage par POINT-VIRGULE (Standard Excel FR)
            // Si vos CSV utilisent des virgules, remplacez ';' par ','
            const cols = cleanRow.split(";");

            // Ignorer l'en-tête (si la première case contient "Expediteur")
            if (index === 0 && (cols[0].toLowerCase().includes("exp") || cols[0].toLowerCase().includes("nom"))) {
                return; 
            }

            // Vérifier qu'on a assez de colonnes (min 8 colonnes)
            // Format attendu: Expéditeur; Tel Exp; Nom; Prénom; Tel; Desc; Qté; Poids/Vol
            if (cols.length < 5) return; 

            // Nettoyage des guillemets éventuels ajoutés par Excel
            const clean = (val) => (val || "").replace(/"/g, "").trim();

            const poidVol = parseFloat(clean(cols[7]).replace(',', '.')) || 0;
            
            // Création de l'objet client
            const nouveauClient = {
                expediteur: clean(cols[0]) || "AMT TRANSIT",
                telExpediteur: clean(cols[1]) || "",
                nom: clean(cols[2]),
                prenom: clean(cols[3]),
                tel: clean(cols[4]),
                description: clean(cols[5]),
                quantiteEnvoyee: parseInt(clean(cols[6])) || 1,
                
                // Gestion Poids vs Volume selon le type sélectionné
                poidsEnvoye: typeEnvoi.startsWith('aerien') ? poidVol : 0,
                volumeEnvoye: typeEnvoi.startsWith('aerien') ? 0 : poidVol,
                
                // On crée un sous-colis par défaut pour compatibilité
                detailsColis: [{
                    desc: clean(cols[5]),
                    qte: parseInt(clean(cols[6])) || 1,
                    val: poidVol
                }],
                
                photosFiles: [] // Pas de photos via CSV
            };

            // Calcul du prix estimé
            let prixUnitaire = 0;
            if (typeEnvoi === 'aerien_normal') prixUnitaire = PRIX_AERIEN_NORMAL;
            else if (typeEnvoi === 'aerien_express') prixUnitaire = PRIX_AERIEN_EXPRESS;
            else if (typeEnvoi === 'maritime') prixUnitaire = PRIX_MARITIME_CBM;

            nouveauClient.prixEstime = formatArgent(poidVol * prixUnitaire) + ' CFA';

            // Ajout à la liste globale
            envoiEnCours.push(nouveauClient);
            count++;
        });

        // Mise à jour du tableau visuel
        mettreAJourTableauEnvoiEnCours();
        alert(`${count} clients importés avec succès !`);
        input.value = ""; // Vider l'input
    };

    // Lecture du fichier en tant que texte (Encodage Windows-1252 souvent utilisé par Excel FR, sinon essayer 'UTF-8')
    reader.readAsText(file, 'ISO-8859-1'); 
}
// --- GÉNÉRATION BON DE LIVRAISON (BL) AVEC PROMPT ---
async function genererBonLivraison() {
    // Vérification de sécurité
    if (!currentEnvoi) return;

    // 1. LE PROMPT : C'est ici qu'on demande le lieu à l'utilisateur
    // La valeur par défaut est "Agence Abidjan - Treichville"
    let lieu = prompt("Veuillez saisir le LIEU DE LIVRAISON :", "Agence Abidjan - Treichville");
    
    // Si l'utilisateur clique sur "Annuler", on arrête tout
    if (lieu === null) return; 

    // 2. Initialisation du PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // On essaie de charger le logo (fonction existante dans votre code)
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'PNG', 10, 10, 25, 25);
    
    // 3. En-tête du document
    doc.setFontSize(22);
    doc.setTextColor(142, 68, 173); // Couleur violette
    doc.setFont("helvetica", "bold");
    doc.text("BON DE LIVRAISON", 130, 20);

    doc.setFontSize(10);
    doc.setTextColor(0); // Noir
    doc.setFont("helvetica", "normal");
    doc.text(`N° BL: BL-${currentEnvoi.reference}`, 130, 28);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 130, 33);
    
    // ICI : On affiche le lieu saisi dans le prompt en majuscules
    doc.setFont("helvetica", "bold");
    doc.text(`Lieu de livraison : ${lieu.toUpperCase()}`, 130, 40);

    doc.line(10, 45, 200, 45); // Ligne de séparation

    // 4. Informations du Destinataire
    let y = 55;
    doc.setFontSize(11);
    doc.text("DESTINATAIRE:", 10, y);
    doc.setFont("helvetica", "normal");
    y += 5; doc.text(`Nom: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y);
    y += 5; doc.text(`Téléphone: ${currentEnvoi.tel}`, 10, y);
    y += 5; doc.text(`Réf Colis: ${currentEnvoi.reference}`, 10, y);

    // 5. Tableau des articles (On masque les prix pour un BL)
    y += 10;
    const headers = [["DESCRIPTION", "TYPE", "QUANTITÉ", "POIDS / VOL", "ETAT"]];
    
    // Détection si c'est Aérien ou Maritime pour l'unité
    let isAir = (currentEnvoi.type || "").startsWith('aerien');
    let poidVol = isAir ? `${currentEnvoi.poidsEnvoye} Kg` : `${currentEnvoi.volumeEnvoye} CBM`;
    
    const body = [[
        currentEnvoi.description,
        (currentEnvoi.type || "").toUpperCase(),
        currentEnvoi.quantiteEnvoyee,
        poidVol,
        currentEnvoi.status || "Non vérifié"
    ]];

    doc.autoTable({
        startY: y,
        head: headers,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [142, 68, 173] }, // En-tête violet
        styles: { valign: 'middle', fontSize: 10 }
    });

    // 6. Zone de Signature (Cadres en bas de page)
    y = doc.lastAutoTable.finalY + 20;
    
    doc.setLineWidth(0.5);
    // Cadre Livreur
    doc.rect(10, y, 90, 40); 
    // Cadre Client
    doc.rect(110, y, 90, 40); 

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("VISA / SIGNATURE LIVREUR", 15, y + 5);
    doc.text("VISA / SIGNATURE CLIENT", 115, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Je confirme avoir reçu la marchandise en bon état.", 115, y + 35);

    // 7. Sauvegarde du fichier
    doc.save(`BL_${currentEnvoi.nom}.pdf`);
}
// --- FONCTION POUR REMPLIR LE SELECT DANS LE MODAL MODIF ---
async function chargerGroupesDansModif(groupeActuel) {
    const select = document.getElementById('modif-groupe-select');
    if (!select) return;

    select.innerHTML = '<option value="">Chargement...</option>';

    try {
        const snap = await db.collection('expeditions')
            .orderBy('creeLe', 'desc')
            .limit(200)
            .get();

        const groupes = new Set();
        snap.forEach(doc => {
            const d = doc.data();
            if (d.refGroupe && d.refGroupe.startsWith('EV')) {
                groupes.add(d.refGroupe);
            }
        });
        if (groupeActuel) groupes.add(groupeActuel);

        const sorted = Array.from(groupes).sort((a, b) => {
            return parseInt(b.replace('EV', '')||0) - parseInt(a.replace('EV', '')||0);
        });

        select.innerHTML = ''; 

        // --- AJOUT DE L'OPTION DE CRÉATION EN PREMIER ---
        const optNew = document.createElement('option');
        optNew.value = "NEW_CUSTOM";
        optNew.innerText = "➕ Créer un nouveau groupe...";
        optNew.style.fontWeight = "bold";
        optNew.style.color = "#27ae60";
        select.appendChild(optNew);
        // -----------------------------------------------
        
        sorted.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.innerText = g;
            if (g === groupeActuel) opt.selected = true;
            select.appendChild(opt);
        });

    } catch (e) {
        console.error(e);
    }
}
// --- FONCTION SUPPRIMER UN COLIS (HISTORIQUE) ---
async function supprimerCeColis() {
    if (!currentModifEnvoi) return;

    // 1. Confirmation de sécurité
    const confirmation = confirm(`ATTENTION !\n\nVous êtes sur le point de supprimer définitivement le colis :\n${currentModifEnvoi.reference}\n\nCette action est IRRÉVERSIBLE. Voulez-vous continuer ?`);
    
    if (!confirmation) return;

    try {
        // 2. Suppression dans Firestore
        await db.collection('expeditions').doc(currentModifEnvoi.id).delete();

        alert("Colis supprimé avec succès.");
        
        // 3. Fermer le modal et rafraîchir
        if (modalModif) modalModif.style.display = 'none';
        if (typeof chargerHistoriqueChine === "function") chargerHistoriqueChine();

    } catch (e) {
        alert("Erreur lors de la suppression : " + e.message);
    }
}
// --- FONCTION DÉCLENCHÉE QUAND ON CHOISIT "CRÉER NOUVEAU GROUPE" ---
function verifierCreationGroupe(selectElement) {
    // Si l'utilisateur choisit l'option "Créer..."
    if (selectElement.value === "NEW_CUSTOM") {
        
        // On demande le nom
        const nomNouveau = prompt("Entrez le nom du nouveau groupe (ex: EV12) :", "EV");

        if (nomNouveau && nomNouveau.trim() !== "") {
            const nomFinal = nomNouveau.toUpperCase().trim();

            // On crée cette option dynamiquement et on la sélectionne
            const opt = document.createElement('option');
            opt.value = nomFinal;
            opt.innerText = nomFinal;
            opt.selected = true;
            
            // On l'ajoute juste après l'option "Créer"
            selectElement.add(opt, selectElement.options[1]);
        } else {
            // Si l'utilisateur annule, on remet le groupe d'origine (le dernier de la liste ou vide)
            // Pour simplifier, on remet la sélection sur rien ou le groupe précédent si possible
            selectElement.value = currentModifEnvoi.refGroupe; 
        }
    }
}
// --- OUTIL POUR CORRIGER/RENOMMER UN GROUPE ---
async function outilCorrectionGroupe() {
    // 1. Demander le groupe à corriger (celui qu'on veut faire disparaître)
    const groupeCible = prompt("Quel est le groupe à corriger/supprimer ? (ex: EV10)");
    if (!groupeCible) return;
    const cible = groupeCible.toUpperCase().trim();

    // 2. Demander le nouveau nom (celui qu'on veut garder)
    const groupeDestination = prompt(`Vers quel groupe voulez-vous déplacer les colis de ${cible} ?\n(Entrez 'EV4' pour fusionner, ou un nouveau nom).\n\nATTENTION : Si c'était des tests et que vous voulez TOUT supprimer, tapez 'DELETE'.`);
    if (!groupeDestination) return;
    const dest = groupeDestination.toUpperCase().trim();

    // Cas spécial : Suppression totale
    if (dest === 'DELETE') {
        if(!confirm(`Êtes-vous SÛR de vouloir supprimer DÉFINITIVEMENT tous les colis du groupe ${cible} ?`)) return;
        // ... Logique de suppression (voir plus bas)
        await supprimerTousLesColisDuGroupe(cible);
        return;
    }

    // Cas normal : Renommage / Fusion
    try {
        const snap = await db.collection('expeditions').where('refGroupe', '==', cible).get();
        
        if (snap.empty) {
            alert(`Aucun colis trouvé dans le groupe ${cible}.`);
            return;
        }

        const batch = db.batch();
        let count = 0;

        snap.forEach(doc => {
            const data = doc.data();
            const refDoc = db.collection('expeditions').doc(doc.id);
            
            let updateData = { refGroupe: dest };

            // On essaie aussi de corriger la référence visuelle (ex: MRT-01-EV10 -> MRT-01-EV4)
            if (data.reference && data.reference.endsWith(cible)) {
                updateData.reference = data.reference.replace(cible, dest);
            }

            batch.update(refDoc, updateData);
            count++;
        });

        await batch.commit();
        alert(`${count} colis ont été déplacés de ${cible} vers ${dest}.\nLe groupe ${cible} n'existe plus.`);
        
        // On recharge la liste pour voir le résultat
        chargerListeGroupes();

    } catch (e) {
        alert("Erreur : " + e.message);
    }
}

// Sous-fonction pour la suppression totale (Cas 'DELETE')
async function supprimerTousLesColisDuGroupe(groupe) {
    try {
        const snap = await db.collection('expeditions').where('refGroupe', '==', groupe).get();
        if (snap.empty) { alert("Rien à supprimer."); return; }

        const batch = db.batch();
        snap.forEach(doc => {
            batch.delete(db.collection('expeditions').doc(doc.id));
        });
        await batch.commit();
        alert(`Groupe ${groupe} et ses colis supprimés.`);
        chargerListeGroupes();
    } catch(e) {
        alert("Erreur : " + e.message);
    }
}