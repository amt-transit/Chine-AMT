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
const auth = firebase.auth(); // NOUVEAU

// =======================================================
// 2. VARIABLES GLOBALES
// =======================================================
let envoiEnCours = [];
let clientsCharges = [];
let allPastClients = [];
let currentUser = null;
let currentRole = null; // 'chine' ou 'abidjan'

const PRIX_AERIEN_NORMAL = 10000;
const PRIX_AERIEN_EXPRESS = 12000;
const PRIX_MARITIME_CBM = 250000;

// Utilitaires
function formatArgent(montant) {
    if (isNaN(montant)) return "0";
    return parseInt(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// =======================================================
// 3. AUTHENTIFICATION & ROLES
// =======================================================
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    auth.signInWithEmailAndPassword(email, pass)
        .catch(err => {
            document.getElementById('login-error').innerText = "Erreur: " + err.message;
        });
});

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        
        // DÉFINITION DES ROLES (Simplifiée par email pour ce prototype)
        if (user.email.includes('chine')) {
            currentRole = 'chine';
            document.getElementById('user-display').innerText = "Agence Chine";
            // Masquer les onglets non autorisés
            document.getElementById('nav-reception').style.display = 'none';
            document.getElementById('nav-compta').style.display = 'none';
            // Ouvrir Envoi par défaut
            ouvrirPage(null, 'Envoi');
        } else {
            currentRole = 'abidjan'; // Accès total
            document.getElementById('user-display').innerText = "Agence Abidjan";
            // Tout afficher
            document.getElementById('nav-reception').style.display = 'inline-block';
            document.getElementById('nav-compta').style.display = 'inline-block';
            ouvrirPage(null, 'Reception');
        }
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

function deconnexion() {
    auth.signOut();
    window.location.reload();
}

// =======================================================
// 4. NAVIGATION
// =======================================================
function ouvrirPage(event, nomPage) {
    // Sécurité basique navigation
    if (currentRole === 'chine' && (nomPage === 'Reception' || nomPage === 'Comptabilite')) return;

    const contents = document.getElementsByClassName("page-content");
    for (let i = 0; i < contents.length; i++) contents[i].style.display = "none";
    
    const links = document.getElementsByClassName("nav-link");
    for (let i = 0; i < links.length; i++) links[i].className = links[i].className.replace(" active", "");
    
    document.getElementById(nomPage).style.display = "block";
    if(event) event.currentTarget.className += " active";
    else {
        // Activation manuelle classe
        if(nomPage === 'Envoi') document.getElementById('nav-envoi').className += " active";
        if(nomPage === 'Reception') document.getElementById('nav-reception').className += " active";
    }
    
    const agenceEl = document.getElementById('agence-nom');
    if (nomPage === 'Envoi') {
        agenceEl.innerText = 'Chine';
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

// =======================================================
// 5. HISTORIQUE CHINE & MODIFICATION
// =======================================================
let currentModifEnvoi = null;

async function chargerHistoriqueChine() {
    const tbody = document.getElementById('tbody-historique-chine');
    tbody.innerHTML = '<tr><td colspan="8">Chargement...</td></tr>';
    
    // Recherche locale
    const searchInput = document.getElementById('search-hist-chine');
    searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase();
        Array.from(tbody.rows).forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(query) ? "" : "none";
        });
    };

    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(100).get();
        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const dateStr = new Date(data.date).toLocaleDateString('fr-FR');
            let poidsVol = data.type.startsWith('aerien') ? `${data.poidsEnvoye} Kg` : `${data.volumeEnvoye} CBM`;
            
            // Calcul prix final avec remise éventuelle
            let prixBrut = parseInt(data.prixEstime.replace(/[^0-9]/g, '')) || 0;
            let remise = data.remise || 0;
            let prixFinal = prixBrut - remise;
            
            // Info modificateur
            let modifInfo = data.dernierModificateur ? `<span class="modif-info">Par ${data.dernierModificateur}</span>` : '-';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.reference}</td>
                <td>${dateStr}</td>
                <td>${data.nom}</td>
                <td>${data.quantiteEnvoyee}</td>
                <td>${poidsVol}</td>
                <td>${formatArgent(prixFinal)} CFA</td>
                <td>${modifInfo}</td>
                <td><button class="btn-action btn-afficher" onclick='ouvrirModalModificationChine(${JSON.stringify({id: doc.id, ...data})})'><i class="fas fa-edit"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

const modalModif = document.getElementById('modal-modif-chine');

function ouvrirModalModificationChine(envoi) {
    currentModifEnvoi = envoi;
    modalModif.style.display = 'flex';
    
    // Remplir champs
    document.getElementById('modif-qte').value = envoi.quantiteEnvoyee;
    document.getElementById('modif-remise').value = envoi.remise || 0;
    
    const elPoids = document.getElementById('modif-poids');
    if(envoi.type.startsWith('aerien')) elPoids.value = envoi.poidsEnvoye;
    else elPoids.value = envoi.volumeEnvoye;
    
    calculerPrixModif();
    
    // Listeners pour recalcul dynamique
    document.getElementById('modif-poids').oninput = calculerPrixModif;
    document.getElementById('modif-remise').oninput = calculerPrixModif;
}

function calculerPrixModif() {
    if(!currentModifEnvoi) return;
    const val = parseFloat(document.getElementById('modif-poids').value) || 0;
    const remise = parseInt(document.getElementById('modif-remise').value) || 0;
    
    let tarif = 0;
    if(currentModifEnvoi.type === 'aerien_normal') tarif = PRIX_AERIEN_NORMAL;
    else if(currentModifEnvoi.type === 'aerien_express') tarif = PRIX_AERIEN_EXPRESS;
    else tarif = PRIX_MARITIME_CBM;
    
    let total = (val * tarif) - remise;
    document.getElementById('modif-prix-final').value = formatArgent(total) + ' CFA';
}

async function sauvegarderModificationChine() {
    if(!currentModifEnvoi) return;
    
    const newQte = parseInt(document.getElementById('modif-qte').value) || 0;
    const newVal = parseFloat(document.getElementById('modif-poids').value) || 0;
    const newRemise = parseInt(document.getElementById('modif-remise').value) || 0;
    
    // Mise à jour objet
    let updateData = {
        quantiteEnvoyee: newQte,
        remise: newRemise,
        dernierModificateur: currentRole === 'chine' ? 'Agence Chine' : 'Agence Abidjan',
        dateModification: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if(currentModifEnvoi.type.startsWith('aerien')) updateData.poidsEnvoye = newVal;
    else updateData.volumeEnvoye = newVal;
    
    // Recalcul du prix estimé de base (avant remise, pour garder la logique)
    // Le prixEstime stocké est généralement le brut. On va mettre à jour le prixEstime BRUT.
    let tarif = 0;
    if(currentModifEnvoi.type === 'aerien_normal') tarif = PRIX_AERIEN_NORMAL;
    else if(currentModifEnvoi.type === 'aerien_express') tarif = PRIX_AERIEN_EXPRESS;
    else tarif = PRIX_MARITIME_CBM;
    
    updateData.prixEstime = formatArgent(newVal * tarif) + ' CFA';

    try {
        await db.collection('expeditions').doc(currentModifEnvoi.id).update(updateData);
        alert("Modification enregistrée !");
        modalModif.style.display = 'none';
        chargerHistoriqueChine();
    } catch(e) { alert("Erreur : " + e.message); }
}

function fermerModalModif(e) {
    if(e.target === modalModif || e.target.classList.contains('modal-close')) modalModif.style.display = 'none';
}

// =======================================================
// 6. INITIALISATION & ENVOI
// =======================================================
document.addEventListener('DOMContentLoaded', function() {
    // L'init se fait via Auth Listener
    loadAllClientsForAutocomplete();

    const typeEnvoiSelect = document.getElementById('type-envoi');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const prixCalculeSpan = document.getElementById('prix-calcule');
    const photosInput = document.getElementById('photos-colis');
    const apercuPhotosDiv = document.getElementById('apercu-photos');
    const btnAjouterClient = document.getElementById('btn-ajouter-client');
    const btnValiderEnvoiGroupe = document.getElementById('btn-valider-envoi-groupe');

    function gererChampsEnvoi() {
        const type = typeEnvoiSelect.value;
        const champPoids = document.getElementById('champ-poids');
        const champVolume = document.getElementById('champ-volume');
        if (type.startsWith('aerien')) {
            champPoids.style.display = 'block'; champVolume.style.display = 'none'; volumeInput.value = 0;
        } else if (type === 'maritime') {
            champPoids.style.display = 'none'; champVolume.style.display = 'block'; poidsInput.value = 0;
        } else {
            champPoids.style.display = 'none'; champVolume.style.display = 'none';
        }
        calculerPrixClient();
    }

    function calculerPrixClient() {
        const type = typeEnvoiSelect.value;
        const poids = parseFloat(poidsInput.value) || 0;
        const volume = parseFloat(volumeInput.value) || 0;
        let prix = 0;
        if (type === 'aerien_normal') prix = poids * PRIX_AERIEN_NORMAL;
        else if (type === 'aerien_express') prix = poids * PRIX_AERIEN_EXPRESS;
        else if (type === 'maritime') prix = volume * PRIX_MARITIME_CBM;
        prixCalculeSpan.innerText = formatArgent(prix) + ' CFA';
    }

    if(typeEnvoiSelect) {
        typeEnvoiSelect.addEventListener('change', gererChampsEnvoi);
        poidsInput.addEventListener('input', calculerPrixClient);
        volumeInput.addEventListener('input', calculerPrixClient);
    }

    if(photosInput) {
        photosInput.addEventListener('change', function() {
            apercuPhotosDiv.innerHTML = '';
            if (this.files.length > 0) {
                Array.from(this.files).forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = e => {
                            const img = document.createElement('img'); img.src = e.target.result;
                            apercuPhotosDiv.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        });
    }

    if(btnAjouterClient) {
        btnAjouterClient.addEventListener('click', function() {
            const typeEnvoi = document.getElementById('type-envoi').value;
            const dateEnvoi = document.getElementById('date-envoi').value;
            if (!typeEnvoi || !dateEnvoi) { alert("Date et Type requis."); return; }
            const nom = document.getElementById('client-nom').value;
            if (!nom) { alert("Nom requis."); return; }

            const clientData = {
                nom: nom,
                prenom: document.getElementById('client-prenom').value,
                tel: document.getElementById('client-tel').value,
                description: document.getElementById('client-desc').value,
                quantiteEnvoyee: document.getElementById('quantite-envoyee').value,
                poidsEnvoye: parseFloat(poidsInput.value) || 0,
                volumeEnvoye: parseFloat(volumeInput.value) || 0,
                prixEstime: prixCalculeSpan.innerText,
                photosFiles: Array.from(photosInput.files)
            };
            envoiEnCours.push(clientData);
            mettreAJourTableauEnvoiEnCours();
            document.getElementById('form-ajout-client').reset();
            apercuPhotosDiv.innerHTML = '';
            calculerPrixClient();
        });
    }

    if(btnValiderEnvoiGroupe) {
        btnValiderEnvoiGroupe.addEventListener('click', async function() {
            if (envoiEnCours.length === 0) return;
            this.disabled = true; this.innerText = 'Enregistrement...';
            try {
                const dateEnvoi = document.getElementById('date-envoi').value;
                const typeEnvoi = document.getElementById('type-envoi').value;
                const refGroupe = await genererRefGroupe(typeEnvoi);
                const prefixRef = typeEnvoi.startsWith('aerien') ? 'CHA' : 'CH';

                for (let i = 0; i < envoiEnCours.length; i++) {
                    const client = envoiEnCours[i];
                    const indexStr = String(i + 1).padStart(3, '0');
                    const refComplete = `${prefixRef}-${indexStr}-${refGroupe}`;

                    let photosURLs = [];
                    if (client.photosFiles.length > 0) {
                        for (const file of client.photosFiles) {
                            const nomFichier = `colis/${refComplete}/${Date.now()}_${file.name}`;
                            const refFichier = storage.ref(nomFichier);
                            await refFichier.put(file);
                            const url = await refFichier.getDownloadURL();
                            photosURLs.push(url);
                        }
                    }

                    await db.collection('expeditions').add({
                        reference: refComplete, refGroupe: refGroupe, date: dateEnvoi, type: typeEnvoi,
                        nom: client.nom, prenom: client.prenom, tel: client.tel, description: client.description,
                        quantiteEnvoyee: parseInt(client.quantiteEnvoyee) || 0,
                        poidsEnvoye: client.poidsEnvoye, volumeEnvoye: client.volumeEnvoye,
                        prixEstime: client.prixEstime, remise: 0, // Init Remise
                        photosURLs: photosURLs,
                        creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'En attente', quantiteRecue: 0, poidsRecu: 0, montantPaye: 0, historiquePaiements: []
                    });
                }
                alert(`Groupe ${refGroupe} enregistré !`);
                envoiEnCours = []; mettreAJourTableauEnvoiEnCours();
                document.getElementById('form-envoi-commun').reset();
                loadAllClientsForAutocomplete();
            } catch (e) { console.error(e); alert("Erreur: " + e.message); }
            finally { this.disabled = false; this.innerText = "Valider l'envoi"; }
        });
    }

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

    const nomInput = document.getElementById('client-nom');
    const suggestionsBox = document.getElementById('autocomplete-suggestions');
    if(nomInput) {
        nomInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            if (query.length < 1) { suggestionsBox.style.display = 'none'; return; }
            const matches = allPastClients.filter(c => c.nom.toLowerCase().startsWith(query));
            showSuggestions(matches);
        });
        document.addEventListener('click', e => {
            if(!e.target.closest('.autocomplete-container')) suggestionsBox.style.display = 'none';
        });
    }
});

// ... (LES AUTRES FONCTIONS SONT IDENTIQUES, JUSTE AJOUT DES FONCTIONS SUIVANTES) ...

// (Copiez ici genererRefGroupe, mettreAJourTableauEnvoiEnCours, loadAllClientsForAutocomplete, showSuggestions, selectSuggestion)
async function genererRefGroupe(typeEnvoi) {
    const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').limit(50).get();
    let lastNum = 0;
    snapshot.forEach(doc => {
        const data = doc.data();
        let grp = data.refGroupe || "";
        if(grp.startsWith('EV')) {
            let n = parseInt(grp.replace('EV',''));
            if(!isNaN(n) && n > lastNum) lastNum = n;
        }
    });
    return 'EV' + (lastNum + 1);
}

function mettreAJourTableauEnvoiEnCours() {
    const tbody = document.getElementById('tbody-envoi-en-cours');
    tbody.innerHTML = '';
    if (envoiEnCours.length === 0) { tbody.innerHTML = '<tr><td colspan="6">Aucun client.</td></tr>'; return; }
    envoiEnCours.forEach((client, index) => {
        const typeEnvoi = document.getElementById('type-envoi').value;
        let poidsVolume = typeEnvoi.startsWith('aerien') ? `${client.poidsEnvoye} Kg` : `${client.volumeEnvoye} CBM`;
        tbody.innerHTML += `<tr><td>${client.nom}</td><td>${client.description}</td><td>${client.quantiteEnvoyee}</td><td>${poidsVolume}</td><td>${client.prixEstime}</td><td><button class="btn-action btn-supprimer" onclick="envoiEnCours.splice(${index},1);mettreAJourTableauEnvoiEnCours()">X</button></td></tr>`;
    });
}

async function loadAllClientsForAutocomplete() {
    try {
        const snapshot = await db.collection('expeditions').get();
        const map = new Map();
        snapshot.forEach(doc => {
            const d = doc.data();
            if(d.tel) map.set(d.tel, {nom: d.nom, prenom: d.prenom, tel: d.tel});
        });
        allPastClients = Array.from(map.values());
    } catch (e) {}
}

function showSuggestions(matches) {
    const box = document.getElementById('autocomplete-suggestions');
    box.innerHTML = '';
    if (matches.length === 0) { box.style.display = 'none'; return; }
    matches.slice(0, 5).forEach(c => {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${c.nom}</strong> ${c.prenom} <small>(${c.tel})</small>`;
        div.onclick = () => {
            document.getElementById('client-nom').value = c.nom;
            document.getElementById('client-prenom').value = c.prenom || '';
            document.getElementById('client-tel').value = c.tel || '';
            box.style.display = 'none';
        };
        box.appendChild(div);
    });
    box.style.display = 'block';
}

// (Copiez ici ouvrirSousOngletReception, chargerClients, selectionnerClient, updateModalStatus, fermerModal, enregistrerReception)
let currentReceptionType = 'maritime';
function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    const btnMer = document.getElementById('btn-rec-maritime');
    const btnAir = document.getElementById('btn-rec-aerien');
    if (type === 'maritime') { btnMer.classList.add('active'); btnAir.classList.remove('active'); } 
    else { btnMer.classList.remove('active'); btnAir.classList.add('active'); }
    chargerClients();
}

async function chargerClients() {
    const tbody = document.getElementById('liste-clients-tbody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9">Chargement...</td></tr>';
    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        tbody.innerHTML = '';
        clientsCharges = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            let isMatch = false;
            if (currentReceptionType === 'maritime' && data.type === 'maritime') isMatch = true;
            if (currentReceptionType === 'aerien' && data.type.startsWith('aerien')) isMatch = true;

            if (isMatch) {
                clientsCharges.push({id: doc.id, ...data});
                let poidsVol = data.type.startsWith('aerien') ? `${data.poidsEnvoye} Kg` : `${data.volumeEnvoye} CBM`;
                let statusClass = 'status-attente';
                if (data.status) {
                    if(data.status.includes('Conforme')) statusClass = 'status-conforme';
                    else if(data.status.includes('Supérieur')) statusClass = 'status-superieur';
                    else if(data.status.includes('Ecart')) statusClass = 'status-ecart';
                }
                
                // Prix affiché tient compte de la remise
                let prixBrut = parseInt(data.prixEstime.replace(/[^0-9]/g, '')) || 0;
                let prixNet = prixBrut - (data.remise || 0);

                const tr = document.createElement('tr');
                tr.className = 'interactive-table-row';
                tr.innerHTML = `<td>${data.reference}</td><td>${data.date}</td><td>${data.nom}</td><td>${data.description || ''}</td><td>${data.type}</td><td>${data.quantiteEnvoyee}</td><td>${poidsVol}</td><td>${formatArgent(prixNet)} CFA</td><td><span class="status-badge ${statusClass}">${data.status || 'En attente'}</span></td>`;
                tr.onclick = () => selectionnerClient({id: doc.id, ...data});
                tbody.appendChild(tr);
            }
        });
    } catch (e) { console.error(e); }
}

// Variables Modal
const modalBackdrop = document.getElementById('modal-backdrop');
const clientSelectionneSpan = document.getElementById('client-selectionne');
const refAttendueSpan = document.getElementById('ref-attendue');
const descAttendueSpan = document.getElementById('desc-attendue');
const telAttenduSpan = document.getElementById('tel-attendu');
const qteAttendueSpan = document.getElementById('qte-attendue');
const poidsAttenduSpan = document.getElementById('poids-attendu');
const prixAttenduSpan = document.getElementById('prix-attendu');
const prixRestantSpan = document.getElementById('prix-restant');
const photosRecuesContainer = document.getElementById('photos-recues-container');
const photosRecuesApercu = document.getElementById('photos-recues-apercu');
const receptionStatus = document.getElementById('reception-status');
const receptionSummary = document.getElementById('reception-summary');

function selectionnerClient(envoi) {
    currentEnvoi = envoi;
    modalBackdrop.style.display = 'flex';
    clientSelectionneSpan.innerText = envoi.nom || 'Inconnu';
    refAttendueSpan.innerText = envoi.reference || '-';
    descAttendueSpan.innerText = envoi.description || '-';
    telAttenduSpan.innerText = envoi.tel || '-';
    qteAttendueSpan.innerText = (envoi.quantiteEnvoyee || 0) + ' colis';
    let typeStr = (envoi.type || "").toString();
    let isAerien = typeStr.startsWith('aerien');
    let valeurPoidsVol = isAerien ? envoi.poidsEnvoye : envoi.volumeEnvoye;
    poidsAttenduSpan.innerText = (valeurPoidsVol || 0) + (isAerien ? ' Kg' : ' CBM');
    
    // Calcul Prix NET (avec remise)
    let prixBrut = parseInt((envoi.prixEstime || "0").replace(/[^0-9]/g, '')) || 0;
    let remise = envoi.remise || 0;
    let prixTotal = prixBrut - remise;
    let dejaPaye = parseInt(envoi.montantPaye) || 0;
    let restant = prixTotal - dejaPaye;
    
    if(prixAttenduSpan) prixAttenduSpan.innerText = formatArgent(prixTotal) + ' CFA';
    
    if(prixRestantSpan) {
        if(restant <= 0) {
            prixRestantSpan.innerText = "SOLDÉ (0 CFA)";
            prixRestantSpan.style.color = "green";
            document.getElementById('montant-paye').value = 0; 
        } else {
            prixRestantSpan.innerText = formatArgent(restant) + ' CFA';
            prixRestantSpan.style.color = "#dc3545";
            document.getElementById('montant-paye').value = restant;
        }
    }
    
    photosRecuesApercu.innerHTML = '';
    if(envoi.photosURLs && envoi.photosURLs.length > 0) {
        document.getElementById('photos-recues-container').style.display = 'block';
        envoi.photosURLs.forEach(url => {
            const img = document.createElement('img'); img.src = url;
            photosRecuesApercu.appendChild(img);
        });
    } else document.getElementById('photos-recues-container').style.display = 'none';

    document.getElementById('quantite-recue').value = '';
    document.getElementById('poids-recu').value = '';
    document.getElementById('label-poids-recu').innerText = isAerien ? "Ajouter Poids (Kg)" : "Ajouter Volume (CBM)";

    updateModalStatus(envoi);
}

function updateModalStatus(envoi) {
    const status = envoi.status || 'En attente';
    const el = document.getElementById('reception-status');
    el.innerText = status;
    el.className = 'status-badge ' + (status.includes('Conforme') ? 'status-conforme' : status.includes('Supérieur') ? 'status-superieur' : status.includes('Ecart') ? 'status-ecart' : 'status-attente');
    const qte = envoi.quantiteRecue || 0;
    const pds = envoi.poidsRecu || 0;
    receptionSummary.innerHTML = `Reçu: <strong>${qte} colis</strong> | <strong>${pds} Kg/CBM</strong>`;
}

function fermerModal(e) { if (e.target === modalBackdrop || e.target.classList.contains('modal-close') || e.target.classList.contains('btn-secondaire')) modalBackdrop.style.display = 'none'; }

async function enregistrerReception() {
    if(!currentEnvoi) return;
    const qteSaisie = parseInt(document.getElementById('quantite-recue').value) || 0;
    const pdsSaisie = parseFloat(document.getElementById('poids-recu').value) || 0;
    const payeSaisie = parseInt(document.getElementById('montant-paye').value) || 0;
    const moyen = document.getElementById('moyen-paiement').value;

    const newQte = (currentEnvoi.quantiteRecue || 0) + qteSaisie;
    const newPds = (currentEnvoi.poidsRecu || 0) + pdsSaisie;
    const newPaye = (currentEnvoi.montantPaye || 0) + payeSaisie;

    let status = 'Reçu - Conforme';
    const diffQ = newQte - currentEnvoi.quantiteEnvoyee;
    const pAttendu = currentEnvoi.type.startsWith('aerien') ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye;
    const diffP = newPds - pAttendu;

    if (diffQ < 0) status = 'Reçu - Ecart';
    else if (diffQ > 0) status = 'Reçu - Supérieur';
    else {
        if (Math.abs(diffP) > 0.1) status = (diffP > 0 ? 'Reçu - Supérieur' : 'Reçu - Ecart');
        else status = 'Reçu - Conforme';
    }

    let updateData = {
        quantiteRecue: newQte,
        poidsRecu: newPds,
        montantPaye: newPaye,
        status: status,
        moyenPaiement: moyen,
        datePaiement: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (payeSaisie > 0) {
        updateData.historiquePaiements = firebase.firestore.FieldValue.arrayUnion({
            date: firebase.firestore.Timestamp.now(),
            montant: payeSaisie,
            moyen: moyen
        });
    }

    try {
        await db.collection('expeditions').doc(currentEnvoi.id).update(updateData);
        alert("Validé !");
        modalBackdrop.style.display = 'none';
        chargerClients();
    } catch(e) { alert(e.message); }
}

// (Copiez ici ouvrirSousOngletCompta, chargerCompta, voirHistoriquePaiement, fermerModalHistorique, ouvrirModalDepense, enregistrerDepense, supprimerDepense, exporterExcel, exporterPDF)
// Ces fonctions sont identiques à celles fournies précédemment pour la partie Compta et Export.
// Je les réinclus pour que le fichier soit vraiment complet.

let currentComptaType = 'maritime';
function ouvrirSousOngletCompta(type) {
    currentComptaType = type;
    document.querySelectorAll('.sub-nav-link').forEach(btn => {
        btn.classList.remove('active');
        if(btn.textContent.toLowerCase().includes(type)) btn.classList.add('active');
    });
    chargerCompta(type);
}

async function chargerCompta(typeFiltre) {
    const tbody = document.getElementById('tbody-compta');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10">Chargement...</td></tr>';
    try {
        const snapshotEntrees = await db.collection('expeditions').get();
        const snapshotSorties = await db.collection('depenses').orderBy('date', 'desc').get();
        let items = [];
        snapshotEntrees.forEach(doc => {
            const data = doc.data();
            let isMatch = false;
            if (typeFiltre === 'maritime' && data.type === 'maritime') isMatch = true;
            if (typeFiltre === 'aerien' && data.type.startsWith('aerien')) isMatch = true;
            if (isMatch) {
                let dateRef = data.datePaiement ? data.datePaiement.toDate() : new Date(data.date);
                let groupSort = data.refGroupe || "ZZZ";
                if (groupSort === "ZZZ" && data.reference) {
                    let parts = data.reference.split('-');
                    if(parts.length > 0) { let p = parts[parts.length-1]; if(p.startsWith('EV')) groupSort = p; }
                }
                items.push({ ...data, id: doc.id, isDepense: false, sortDate: dateRef, sortGroup: groupSort, sortRef: data.reference || "ZZZ", history: data.historiquePaiements || [] });
            }
        });
        snapshotSorties.forEach(doc => {
            const data = doc.data();
            if (data.type === typeFiltre) {
                let groupSort = (data.refGroupe && data.refGroupe.trim() !== "") ? data.refGroupe.toUpperCase() : "ZZZ_GENERAL";
                items.push({ ...data, id: doc.id, isDepense: true, sortDate: new Date(data.date), sortGroup: groupSort, sortRef: "DEPENSE" });
            }
        });
        items.sort((a, b) => {
            const gA = a.sortGroup || ""; const gB = b.sortGroup || "";
            if (gA.startsWith('EV') && gB.startsWith('EV')) {
                const nA = parseInt(gA.replace('EV',''))||99999; const nB = parseInt(gB.replace('EV',''))||99999;
                if(nA !== nB) return nA - nB;
            } else if(gA !== gB) return gA.localeCompare(gB);
            return (a.sortRef||"").localeCompare(b.sortRef||"");
        });
        let totalCredit = 0, totalCaisse = 0, totalBonus = 0;
        let totauxMode = { Espece: 0, Cheque: 0, OM: 0, Wave: 0, CB: 0 };
        let totauxSortieMode = { Espece: 0, Cheque: 0, OM: 0, Wave: 0, CB: 0 };
        let currentGroup = null; let groupQty = 0; let groupVol = 0;
        tbody.innerHTML = '';
        items.forEach((item, index) => {
            let thisGroup = item.sortGroup;
            if (currentGroup !== null && thisGroup !== currentGroup && !currentGroup.startsWith('ZZZ')) {
                 let wLabel = typeFiltre.startsWith('aerien') ? 'Kg' : 'CBM';
                 tbody.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${currentGroup}</td><td colspan="2">${groupQty} Colis</td><td colspan="4">${groupVol.toFixed(3)} ${wLabel}</td></tr>`;
                 groupQty = 0; groupVol = 0;
            }
            currentGroup = thisGroup;
            if (!item.isDepense) {
                groupQty += parseInt(item.quantiteEnvoyee) || 0;
                groupVol += parseFloat(typeFiltre.startsWith('aerien') ? item.poidsEnvoye : item.volumeEnvoye) || 0;
            }
            const dateStr = item.sortDate.toLocaleDateString('fr-FR', {day:'2-digit', month:'short'});
            const monthIndex = item.sortDate.getMonth(); 
            let htmlRow = '';
            if (item.isDepense) {
                let m = parseFloat(item.montant) || 0;
                totalCaisse -= m;
                let mode = item.moyenPaiement || 'Espèce';
                if(mode.includes('Chèque')) totauxSortieMode.Cheque += m;
                else if(mode.includes('OM')) totauxSortieMode.OM += m;
                else if(mode.includes('Wave')) totauxSortieMode.Wave += m;
                else if(mode.includes('CB')) totauxSortieMode.CB += m;
                else totauxSortieMode.Espece += m;
                htmlRow = `<tr class="row-month-${monthIndex}"><td>${dateStr}</td><td>-</td><td>${item.motif}</td><td>Dépense</td><td>-</td><td>-</td><td>-</td><td class="text-red">${formatArgent(m)}</td><td>${item.moyenPaiement}</td><td><button class="btn-suppr-small" onclick="supprimerDepense('${item.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
            } else {
                let prixBrut = parseInt(item.prixEstime.replace(/[^0-9]/g, '')) || 0;
                let prixDu = prixBrut - (item.remise || 0);
                let payeTotal = 0;
                if (item.history && item.history.length > 0) {
                    item.history.forEach(h => {
                        let m = parseFloat(h.montant)||0;
                        payeTotal += m;
                        let typ = h.moyen || 'Espèce';
                        if(typ.includes('Chèque')) totauxMode.Cheque += m;
                        else if(typ.includes('OM')) totauxMode.OM += m;
                        else if(typ.includes('Wave')) totauxMode.Wave += m;
                        else if(typ.includes('CB')) totauxMode.CB += m;
                        else totauxMode.Espece += m;
                    });
                } else {
                    payeTotal = item.montantPaye || 0;
                    totauxMode.Espece += payeTotal;
                }
                let reste = prixDu - payeTotal;
                totalCaisse += payeTotal;
                if(reste > 0) totalCredit += reste;
                let diff = payeTotal - prixDu;
                if (diff > 0) totalBonus += diff;
                else if (diff < 0 && Math.abs(diff) < 500) totalBonus += diff;
                htmlRow = `<tr class="row-month-${monthIndex} interactive-table-row" onclick='voirHistoriquePaiement(${JSON.stringify(item)})'><td>${dateStr}</td><td>${item.reference}</td><td>${item.description||'-'}</td><td>${item.prenom} ${item.nom}</td><td>${formatArgent(prixDu)}</td><td style="${reste>0?'color:#c0392b':'color:#27ae60'}">${formatArgent(reste)}</td><td class="text-green">${formatArgent(payeTotal)}</td><td>-</td><td>${item.moyenPaiement||'-'}</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
            tbody.innerHTML += htmlRow;
            if (index === items.length - 1 && currentGroup !== "" && !currentGroup.startsWith('ZZZ')) {
                let wLabel = typeFiltre.startsWith('aerien') ? 'Kg' : 'CBM';
                tbody.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${currentGroup}</td><td colspan="2">${groupQty} Colis</td><td colspan="4">${groupVol.toFixed(3)} ${wLabel}</td></tr>`;
            }
        });
        document.getElementById('total-credit').innerText = formatArgent(totalCredit) + ' CFA';
        const elC = document.getElementById('total-caisse'); elC.innerText = formatArgent(totalCaisse) + ' CFA'; elC.className = totalCaisse>=0 ? 'text-green' : 'text-red';
        document.getElementById('total-bonus').innerText = formatArgent(totalBonus) + ' CFA';
        document.getElementById('pay-espece-in').innerText = formatArgent(totauxMode.Espece);
        document.getElementById('pay-espece-out').innerText = formatArgent(totauxSortieMode.Espece);
        document.getElementById('pay-cheque-in').innerText = formatArgent(totauxMode.Cheque);
        document.getElementById('pay-cheque-out').innerText = formatArgent(totauxSortieMode.Cheque);
        document.getElementById('pay-om-in').innerText = formatArgent(totauxMode.OM);
        document.getElementById('pay-om-out').innerText = formatArgent(totauxSortieMode.OM);
        document.getElementById('pay-wave-in').innerText = formatArgent(totauxMode.Wave);
        document.getElementById('pay-wave-out').innerText = formatArgent(totauxSortieMode.Wave);
        document.getElementById('pay-cb-in').innerText = formatArgent(totauxMode.CB);
        document.getElementById('pay-cb-out').innerText = formatArgent(totauxSortieMode.CB);
        let tIn = Object.values(totauxMode).reduce((a,b)=>a+b,0);
        let tOut = Object.values(totauxSortieMode).reduce((a,b)=>a+b,0);
        document.getElementById('pay-total-in').innerText = formatArgent(tIn);
        document.getElementById('pay-total-out').innerText = formatArgent(tOut);
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="10">Erreur.</td></tr>'; }
}

// EXPORT PDF & EXCEL (INCHANGÉ, juste intégré)
function exporterExcel() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Client,Desc,Type,Qté,Poids,Prix,Statut\r\n";
    clientsCharges.forEach(c => {
        csvContent += `"${c.reference}","${c.date}","${c.nom}","${c.description}","${c.type}",${c.quantiteEnvoyee},"${c.poidsEnvoye||c.volumeEnvoye}","${c.prixEstime}","${c.status}"\r\n`;
    });
    var link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "expeditions.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
function exporterPDF() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', 'a4');
    const headers = [["Ref", "Date", "Client", "Desc", "Type", "Qté", "Poids", "Prix", "Statut"]];
    const body = clientsCharges.map(c => [c.reference, c.date, c.nom, c.description, c.type, c.quantiteEnvoyee, c.poidsEnvoye||c.volumeEnvoye, c.prixEstime, c.status]);
    doc.autoTable({ head: headers, body: body, styles: { fontSize: 7 } }); doc.save('expeditions.pdf');
}

// MODALS UTILITAIRES
const modalHist = document.getElementById('modal-historique');
function voirHistoriquePaiement(item) {
    if(item.isDepense) return;
    modalHist.style.display = 'flex';
    document.getElementById('hist-client-nom').innerText = item.nom;
    document.getElementById('hist-ref').innerText = item.reference;
    const tb = document.getElementById('tbody-historique'); tb.innerHTML = '';
    if(item.history && item.history.length>0){
        item.history.forEach(h => {
            let d = new Date(h.date.seconds*1000).toLocaleDateString('fr-FR');
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

// --- CHARGEURS LOGO ---
function chargerLogo() {
    return new Promise((resolve, reject) => {
        const img = new Image(); img.src = 'logo.jpg';
        img.onload = () => resolve(img); img.onerror = () => resolve(null);
    });
}
async function genererEtiquette() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', [100, 150]);
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'JPEG', 10, 5, 25, 25);
    doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.text("AMT TRANSIT", 40, 15);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("Suivi de Fret", 40, 22);
    doc.setLineWidth(0.5); doc.line(5, 32, 145, 32);
    doc.setFontSize(12); let y = 45; const gap = 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(`CLIENT: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y); y += gap + 2;
    doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.text(`Réf: ${currentEnvoi.reference}`, 10, y); y += gap; doc.text(`Tél: ${currentEnvoi.tel}`, 10, y); y += gap;
    let poidsVol = currentEnvoi.type.startsWith('aerien') ? `${currentEnvoi.poidsEnvoye} Kg` : `${currentEnvoi.volumeEnvoye} CBM`;
    doc.setFont("helvetica", "bold"); doc.text(`ATTENDU: ${currentEnvoi.quantiteEnvoyee} Colis | ${poidsVol}`, 10, y);
    doc.save(`Etiquette_${currentEnvoi.nom}.pdf`);
}
async function genererFacture() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf; const doc = new jsPDF('p', 'mm', 'a5');
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'JPEG', 10, 10, 30, 30);
    doc.setFontSize(16); doc.text("AMT TRANSIT", 50, 20);
    doc.setFontSize(10); doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 26);
    let y = 50; doc.text(`Client: ${currentEnvoi.nom}`, 10, y); y+=10;
    let prixTotal = parseInt((currentEnvoi.prixEstime||"0").replace(/\D/g,'')) || 0;
    let deja = parseInt(currentEnvoi.montantPaye)||0; let reste = prixTotal - deja;
    doc.text(`Total: ${formatArgent(prixTotal)} CFA`, 10, y); y+=10;
    doc.text(`Payé: ${formatArgent(deja)} CFA`, 10, y); y+=10;
    doc.text(`Reste: ${formatArgent(reste)} CFA`, 10, y);
    doc.save(`Facture_${currentEnvoi.nom}.pdf`);
}