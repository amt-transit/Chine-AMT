// =======================================================
// 1. CONFIGURATION FIREBASE
// !! REMPLACEZ PAR VOS PROPRES CLÉS !!
// =======================================================
const firebaseConfig = {
  apiKey: "AIzaSyA0_2U_6muRzphWlvKZN-lP6mytzaKIj1A",
  authDomain: "chine-amt.firebaseapp.com",
  projectId: "chine-amt",
  storageBucket: "chine-amt.firebasestorage.app",
  messagingSenderId: "864644062373",
  appId: "1:864644062373:web:a3066965408fdd9387c14c"
};

// Initialiser Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const storage = firebase.storage();

// =======================================================
// 2. VARIABLES GLOBALES & TARIFS
// =======================================================
let envoiEnCours = [];
let clientsCharges = [];
let allPastClients = [];

// Variable pour le filtre Réception
let currentReceptionType = 'maritime'; // Par défaut

// Tarifs
const PRIX_AERIEN_NORMAL = 10000;
const PRIX_AERIEN_EXPRESS = 12000;
const PRIX_MARITIME_CBM = 250000;

// =======================================================
// 3. NAVIGATION PRINCIPALE
// =======================================================
function ouvrirPage(event, nomPage) {
    const contents = document.getElementsByClassName("page-content");
    for (let i = 0; i < contents.length; i++) contents[i].style.display = "none";
    
    const links = document.getElementsByClassName("nav-link");
    for (let i = 0; i < links.length; i++) links[i].className = links[i].className.replace(" active", "");
    
    document.getElementById(nomPage).style.display = "block";
    event.currentTarget.className += " active";
    
    const agenceEl = document.getElementById('agence-nom');
    
    if (nomPage === 'Envoi') {
        agenceEl.innerText = 'Chine';
        loadAllClientsForAutocomplete(); 
    } else if (nomPage === 'Reception') {
        agenceEl.innerText = 'Abidjan';
        // Ouvre par défaut sur Maritime quand on arrive sur l'onglet
        ouvrirSousOngletReception('maritime');
    } else if (nomPage === 'Comptabilite') {
        agenceEl.innerText = 'Abidjan - Compta';
        ouvrirSousOngletCompta('maritime'); 
    }
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

    // --- ÉLÉMENTS DOM PAGE ENVOI ---
    const typeEnvoiSelect = document.getElementById('type-envoi');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const prixCalculeSpan = document.getElementById('prix-calcule');
    const photosInput = document.getElementById('photos-colis');
    const apercuPhotosDiv = document.getElementById('apercu-photos');
    const btnAjouterClient = document.getElementById('btn-ajouter-client');
    const btnValiderEnvoiGroupe = document.getElementById('btn-valider-envoi-groupe');

    // --- LOGIQUE CALCUL PRIX ENVOI ---
    function gererChampsEnvoi() {
        const type = typeEnvoiSelect.value;
        const champPoids = document.getElementById('champ-poids');
        const champVolume = document.getElementById('champ-volume');
        
        if (type.startsWith('aerien')) {
            champPoids.style.display = 'block'; 
            champVolume.style.display = 'none'; 
            volumeInput.value = 0;
        } else if (type === 'maritime') {
            champPoids.style.display = 'none'; 
            champVolume.style.display = 'block'; 
            poidsInput.value = 0;
        } else {
            champPoids.style.display = 'none'; 
            champVolume.style.display = 'none';
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
        
        prixCalculeSpan.innerText = prix.toLocaleString('fr-FR') + ' CFA';
    }

    if(typeEnvoiSelect) {
        typeEnvoiSelect.addEventListener('change', gererChampsEnvoi);
        poidsInput.addEventListener('input', calculerPrixClient);
        volumeInput.addEventListener('input', calculerPrixClient);
    }

    // --- APERÇU PHOTOS ---
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

    // --- BOUTON: AJOUTER CLIENT ---
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

    // --- BOUTON: VALIDER GROUPE ---
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
                    // Upload simulation
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
                        prixEstime: client.prixEstime, photosURLs: photosURLs,
                        creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'En attente', quantiteRecue: 0, poidsRecu: 0, montantPaye: 0, historiquePaiements: [] 
                    });
                }
                alert(`Groupe ${refGroupe} enregistré !`);
                envoiEnCours = []; mettreAJourTableauEnvoiEnCours();
                document.getElementById('form-envoi-commun').reset();
                loadAllClientsForAutocomplete();
            } catch (e) { console.error(e); alert("Erreur: " + e.message); }
            finally { this.disabled = false; this.innerText = "Valider et Générer Références"; }
        });
    }

    // --- RECHERCHE & EXPORT ---
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

    // --- AUTOCOMPLETION ---
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

// =======================================================
// 5. FONCTIONS HELPERS
// =======================================================

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

function putting(id) { return document.getElementById(id); } 

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
            const key = (d.nom + d.tel).toLowerCase();
            if(d.nom) map.set(key, {nom: d.nom, prenom: d.prenom, tel: d.tel});
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

// =======================================================
// 6. FONCTIONS RECEPTION (FILTRAGE + MODAL)
// =======================================================

// NOUVEAU : Navigation Sous-Onglets Réception
function ouvrirSousOngletReception(type) {
    currentReceptionType = type;
    
    // Mise à jour visuelle des boutons
    const btnMer = document.getElementById('btn-rec-maritime');
    const btnAir = document.getElementById('btn-rec-aerien');
    
    if (type === 'maritime') {
        btnMer.classList.add('active');
        btnAir.classList.remove('active');
    } else {
        btnMer.classList.remove('active');
        btnAir.classList.add('active');
    }
    
    // Rechargement du tableau avec le filtre
    chargerClients();
}

// Variables Modal
const modalBackdrop = document.getElementById('modal-backdrop');
const clientSelectionneSpan = document.getElementById('client-selectionne');
const refAttendueSpan = document.getElementById('ref-attendue');
const descAttendueSpan = document.getElementById('desc-attendue');
const telAttenduSpan = document.getElementById('tel-attendu');
const qteAttendueSpan = document.getElementById('qte-attendue');
const poidsAttenduSpan = document.getElementById('poids-attendu');
const prixRestantSpan = document.getElementById('prix-restant');
const photosRecuesContainer = document.getElementById('photos-recues-container');
const photosRecuesApercu = document.getElementById('photos-recues-apercu');
const receptionStatus = document.getElementById('reception-status');
const receptionSummary = document.getElementById('reception-summary');

let currentEnvoi = null;

async function chargerClients() {
    const tbody = document.getElementById('liste-clients-tbody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9">Chargement...</td></tr>';
    
    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // --- FILTRE LOGIQUE ---
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

                const tr = document.createElement('tr');
                tr.className = 'interactive-table-row';
                tr.innerHTML = `<td>${data.reference}</td><td>${data.date}</td><td>${data.nom}</td><td>${data.description || ''}</td><td>${data.type}</td><td>${data.quantiteEnvoyee}</td><td>${poidsVol}</td><td>${data.prixEstime}</td><td><span class="status-badge ${statusClass}">${data.status || 'En attente'}</span></td>`;
                
                tr.onclick = () => selectionnerClient({id: doc.id, ...data});
                tbody.appendChild(tr);
            }
        });
        
        if (tbody.innerHTML === '') {
            tbody.innerHTML = '<tr><td colspan="9">Aucun envoi trouvé pour ce type.</td></tr>';
        }

    } catch (e) { console.error(e); }
}

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
    let unite = isAerien ? ' Kg' : ' CBM';
    poidsAttenduSpan.innerText = (valeurPoidsVol || 0) + unite;
    
    let prixString = (envoi.prixEstime || "0").toString();
    let prixTotal = parseInt(prixString.replace(/[^0-9]/g, '')) || 0;
    let dejaPaye = parseInt(envoi.montantPaye) || 0;
    let restant = prixTotal - dejaPaye;
    
    if(restant <= 0) {
        prixRestantSpan.innerText = "SOLDÉ (0 CFA)";
        prixRestantSpan.style.color = "green";
        document.getElementById('montant-paye').value = 0; 
    } else {
        prixRestantSpan.innerText = restant.toLocaleString('fr-FR') + ' CFA';
        prixRestantSpan.style.color = "#dc3545";
        document.getElementById('montant-paye').value = restant;
    }

    photosRecuesApercu.innerHTML = '';
    if(envoi.photosURLs && envoi.photosURLs.length > 0) {
        document.getElementById('photos-recues-container').style.display = 'block';
        envoi.photosURLs.forEach(url => {
            const img = document.createElement('img'); img.src = url;
            photosRecuesApercu.appendChild(img);
        });
    } else {
        document.getElementById('photos-recues-container').style.display = 'none';
    }
    
    document.getElementById('quantite-recue').value = '';
    document.getElementById('poids-recu').value = '';
    const labelPoids = document.getElementById('label-poids-recu');
    if(labelPoids) labelPoids.innerText = isAerien ? "Ajouter Poids (Kg)" : "Ajouter Volume (CBM)";

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

function fermerModal(e) {
    if (e.target === modalBackdrop || e.target.classList.contains('modal-close') || e.target.classList.contains('btn-secondaire')) {
        modalBackdrop.style.display = 'none';
    }
}

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

// =======================================================
// 8. COMPTABILITÉ
// =======================================================
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
                    if(parts.length > 0) {
                         let p = parts[parts.length-1];
                         if(p.startsWith('EV')) groupSort = p;
                    }
                }
                items.push({ 
                    ...data, id: doc.id, isDepense: false, 
                    sortDate: dateRef, sortGroup: groupSort, sortRef: data.reference || "ZZZ",
                    history: data.historiquePaiements || []
                });
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

                htmlRow = `<tr class="row-month-${monthIndex}"><td>${dateStr}</td><td>-</td><td>${item.motif}</td><td>Dépense</td><td>-</td><td>-</td><td>-</td><td class="text-red">${m.toLocaleString('fr-FR')}</td><td>${item.moyenPaiement}</td><td><button class="btn-suppr-small" onclick="supprimerDepense('${item.id}')"><i class="fas fa-trash"></i></button></td></tr>`;
            } else {
                let prixDu = parseInt(item.prixEstime.replace(/[^0-9]/g, '')) || 0;
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

                htmlRow = `<tr class="row-month-${monthIndex} interactive-table-row" onclick='voirHistoriquePaiement(${JSON.stringify(item)})'><td>${dateStr}</td><td>${item.reference}</td><td>${item.description||'-'}</td><td>${item.prenom} ${item.nom}</td><td>${prixDu.toLocaleString('fr-FR')}</td><td style="${reste>0?'color:#c0392b':'color:#27ae60'}">${reste.toLocaleString('fr-FR')}</td><td class="text-green">${payeTotal.toLocaleString('fr-FR')}</td><td>-</td><td>${item.moyenPaiement||'-'}</td><td><i class="fas fa-eye"></i></td></tr>`;
            }
            tbody.innerHTML += htmlRow;

            if (index === items.length - 1 && currentGroup !== "" && !currentGroup.startsWith('ZZZ')) {
                let wLabel = typeFiltre.startsWith('aerien') ? 'Kg' : 'CBM';
                tbody.innerHTML += `<tr class="group-summary-row"><td colspan="4">TOTAL ${currentGroup}</td><td colspan="2">${groupQty} Colis</td><td colspan="4">${groupVol.toFixed(3)} ${wLabel}</td></tr>`;
            }
        });

        document.getElementById('total-credit').innerText = totalCredit.toLocaleString('fr-FR') + ' CFA';
        const elC = document.getElementById('total-caisse');
        elC.innerText = totalCaisse.toLocaleString('fr-FR') + ' CFA';
        elC.className = totalCaisse>=0 ? 'text-green' : 'text-red';
        document.getElementById('total-bonus').innerText = totalBonus.toLocaleString('fr-FR') + ' CFA';

        document.getElementById('pay-espece-in').innerText = totauxMode.Espece.toLocaleString('fr-FR');
        document.getElementById('pay-espece-out').innerText = totauxSortieMode.Espece.toLocaleString('fr-FR');
        document.getElementById('pay-cheque-in').innerText = totauxMode.Cheque.toLocaleString('fr-FR');
        document.getElementById('pay-cheque-out').innerText = totauxSortieMode.Cheque.toLocaleString('fr-FR');
        document.getElementById('pay-om-in').innerText = totauxMode.OM.toLocaleString('fr-FR');
        document.getElementById('pay-om-out').innerText = totauxSortieMode.OM.toLocaleString('fr-FR');
        document.getElementById('pay-wave-in').innerText = totauxMode.Wave.toLocaleString('fr-FR');
        document.getElementById('pay-wave-out').innerText = totauxSortieMode.Wave.toLocaleString('fr-FR');
        document.getElementById('pay-cb-in').innerText = totauxMode.CB.toLocaleString('fr-FR');
        document.getElementById('pay-cb-out').innerText = totauxSortieMode.CB.toLocaleString('fr-FR');
        
        let tIn = Object.values(totauxMode).reduce((a,b)=>a+b,0);
        let tOut = Object.values(totauxSortieMode).reduce((a,b)=>a+b,0);
        document.getElementById('pay-total-in').innerText = tIn.toLocaleString('fr-FR');
        document.getElementById('pay-total-out').innerText = tOut.toLocaleString('fr-FR');

    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="10">Erreur.</td></tr>'; }
}

// MODALS & HELPERS
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
            tb.innerHTML += `<tr><td>${d}</td><td class="text-green">${parseInt(h.montant).toLocaleString('fr-FR')}</td><td>${h.moyen}</td></tr>`;
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

function exporterExcel() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Client,Desc,Type,Qté,Poids,Prix,Statut\r\n";
    clientsCharges.forEach(c => {
        csvContent += `"${c.reference}","${c.date}","${c.nom}","${c.description}","${c.type}",${c.quantiteEnvoyee},"${c.poidsEnvoye||c.volumeEnvoye}","${c.prixEstime}","${c.status}"\r\n`;
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
    const headers = [["Ref", "Date", "Client", "Desc", "Type", "Qté", "Poids", "Prix", "Statut"]];
    const body = clientsCharges.map(c => [c.reference, c.date, c.nom, c.description, c.type, c.quantiteEnvoyee, c.poidsEnvoye||c.volumeEnvoye, c.prixEstime, c.status]);
    doc.autoTable({ head: headers, body: body, styles: { fontSize: 7 } });
    doc.save('expeditions.pdf');
}