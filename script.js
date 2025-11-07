// =======================================================
// CONFIGURATION FIREBASE
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

// Raccourcis vers les services
const db = firebase.firestore();
const storage = firebase.storage();

// =Variables globales
let envoiEnCours = [];
let clientsCharges = [];
let allPastClients = [];
const PRIX_AERIEN_KG = 10000;
const PRIX_MARITIME_CBM = 25000;


// =======================================================
// LOGIQUE DE NAVIGATION (Pages)
// =======================================================
function ouvrirPage(event, nomPage) {
    const pageContents = document.getElementsByClassName("page-content");
    for (let i = 0; i < pageContents.length; i++) {
        pageContents[i].style.display = "none";
    }
    const navLinks = document.getElementsByClassName("nav-link");
    for (let i = 0; i < navLinks.length; i++) {
        navLinks[i].className = navLinks[i].className.replace(" active", "");
    }
    document.getElementById(nomPage).style.display = "block";
    event.currentTarget.className += " active";
    
    const agenceNomEl = document.getElementById('agence-nom');
    if (nomPage === 'Envoi') {
        agenceNomEl.innerText = 'Chine';
    } else if (nomPage === 'Reception') {
        agenceNomEl.innerText = 'Abidjan';
        chargerClients();
    }
}


// Attend que tout le HTML soit chargé
document.addEventListener('DOMContentLoaded', function() {
    
    // Au démarrage, ouvrir la première page par défaut
    setTimeout(() => {
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink) activeLink.click();
    }, 10);
    
    loadAllClientsForAutocomplete();

    // === LOGIQUE PAGE 1 : ENVOI ===
    
    const typeEnvoiSelect = document.getElementById('type-envoi');
    const champPoids = document.getElementById('champ-poids');
    const champVolume = document.getElementById('champ-volume');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const prixCalculeSpan = document.getElementById('prix-calcule');
    const photosInput = document.getElementById('photos-colis');
    const apercuPhotosDiv = document.getElementById('apercu-photos');
    const btnAjouterClient = document.getElementById('btn-ajouter-client');
    const btnValiderEnvoiGroupe = document.getElementById('btn-valider-envoi-groupe');

    // Gestion de l'affichage Poids/Volume
    typeEnvoiSelect.addEventListener('change', gererChampsEnvoi);
    poidsInput.addEventListener('input', calculerPrixClient);
    volumeInput.addEventListener('input', calculerPrixClient);
    
    function gererChampsEnvoi() {
        const type = typeEnvoiSelect.value;
        if (type === 'aerien') {
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
            volumeInput.value = 0;
            poidsInput.value = 0;
        }
        calculerPrixClient();
    }
    
    function calculerPrixClient() {
        const type = typeEnvoiSelect.value;
        const poids = parseFloat(poidsInput.value) || 0;
        const volume = parseFloat(volumeInput.value) || 0;
        let prix = 0;
        if (type === 'aerien') prix = poids * PRIX_AERIEN_KG;
        else if (type === 'maritime') prix = volume * PRIX_MARITIME_CBM;
        prixCalculeSpan.innerText = prix.toLocaleString('fr-FR') + ' CFA';
    }
    gererChampsEnvoi();
    
    // Aperçu Photos
    photosInput.addEventListener('change', function() {
        apercuPhotosDiv.innerHTML = '';
        if (this.files.length > 0) {
            for (const file of this.files) {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const img = document.createElement('img');
                        img.src = e.target.result;
                        apercuPhotosDiv.appendChild(img);
                    }
                    reader.readAsDataURL(file);
                }
            }
        }
    });

    // Bouton "Ajouter à l'envoi"
    btnAjouterClient.addEventListener('click', function() {
        const typeEnvoi = document.getElementById('type-envoi').value;
        const dateEnvoi = document.getElementById('date-envoi').value;
        if (!typeEnvoi || !dateEnvoi) {
            alert("Veuillez d'abord remplir les 'Informations communes' (Date et Type d'envoi).");
            return;
        }
        const nom = document.getElementById('client-nom').value;
        const prenom = document.getElementById('client-prenom').value;
        const tel = document.getElementById('client-tel').value;
        if (!nom || !prenom || !tel) {
            alert("Veuillez remplir le Nom, Prénom et Téléphone du client.");
            return;
        }
        const clientData = {
            nom: nom,
            prenom: prenom,
            tel: tel,
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

    // Bouton "Valider l'envoi groupé" (MODIFIÉ)
    btnValiderEnvoiGroupe.addEventListener('click', async function() {
        if (envoiEnCours.length === 0) {
            alert("La liste d'envoi est vide. Veuillez ajouter au moins un client.");
            return;
        }
        this.disabled = true;
        this.innerText = 'Enregistrement en cours...';
        try {
            const dateEnvoi = document.getElementById('date-envoi').value;
            const typeEnvoi = document.getElementById('type-envoi').value;
            const typeRef = typeEnvoi === 'aerien' ? 'AMTA' : 'AMTM';
            const date = new Date();
            const refNum = `${typeRef}${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
            
            for (const client of envoiEnCours) {
                let photosURLs = [];
                if (client.photosFiles.length > 0) {
                    for (const file of client.photosFiles) {
                        const nomFichier = `colis/${refNum}/${client.nom}_${Date.now()}_${file.name}`;
                        const refFichier = storage.ref(nomFichier);
                        const snapshot = await refFichier.put(file);
                        const url = await snapshot.ref.getDownloadURL();
                        photosURLs.push(url);
                    }
                }

                // Calculs initiaux
                const quantiteEnvoyeeNum = parseInt(client.quantiteEnvoyee) || 0;
                const poidsEnvoyeNum = (typeEnvoi === 'aerien') ? client.poidsEnvoye : client.volumeEnvoye;
                const diffPoidsInitial = -poidsEnvoyeNum;
                let prixDiffInitial = 0;
                if (typeEnvoi === 'aerien') {
                    prixDiffInitial = diffPoidsInitial * PRIX_AERIEN_KG;
                } else {
                    prixDiffInitial = diffPoidsInitial * PRIX_MARITIME_CBM;
                }

                const envoiFinal = {
                    reference: refNum,
                    date: dateEnvoi,
                    type: typeEnvoi,
                    nom: client.nom,
                    prenom: client.prenom,
                    tel: client.tel,
                    quantiteEnvoyee: quantiteEnvoyeeNum,
                    poidsEnvoye: client.poidsEnvoye,
                    volumeEnvoye: client.volumeEnvoye,
                    prixEstime: client.prixEstime,
                    photosURLs: photosURLs,
                    creeLe: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'En attente',
                    quantiteRecue: 0,
                    poidsRecu: 0,
                    differenceQuantite: -quantiteEnvoyeeNum,
                    differencePoids: diffPoidsInitial,
                    prixDifference: prixDiffInitial
                };
                await db.collection('expeditions').add(envoiFinal);
            }
            alert(`Envoi groupé ${refNum} enregistré avec succès !`);
            envoiEnCours = [];
            mettreAJourTableauEnvoiEnCours();
            document.getElementById('form-envoi-commun').reset();
            loadAllClientsForAutocomplete();
            
        } catch (erreur) {
            console.error("Erreur enregistrement groupé: ", erreur);
            alert("Échec de l'enregistrement: " + erreur.message);
        } finally {
            this.disabled = false;
            this.innerText = "Valider l'envoi groupé";
        }
    });
    
    
    // === LOGIQUE PAGE 2 : RECEPTION ===
    
    // Logique de recherche
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = searchInput.value.toLowerCase();
            const tbody = document.getElementById('liste-clients-tbody');
            if (!tbody) return;
            const rows = tbody.getElementsByTagName('tr');
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row.cells.length <= 1) {
                    row.style.display = "";
                    continue;
                }
                const nomClient = row.cells[2].innerText.toLowerCase();
                const telephone = row.cells[3].innerText.toLowerCase();
                if (nomClient.includes(query) || telephone.includes(query)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            }
        });
    }

    // Logique d'export
    const btnExportPDF = document.getElementById('btn-export-pdf');
    const btnExportExcel = document.getElementById('btn-export-excel');
    if(btnExportPDF) btnExportPDF.addEventListener('click', exporterPDF);
    if(btnExportExcel) btnExportExcel.addEventListener('click', exporterExcel);
    
    
    // =======================================================
    // LOGIQUE D'AUTOCOMPLÉTION (PAGE ENVOI)
    // =======================================================
    const nomInput = document.getElementById('client-nom');
    const suggestionsBox = document.getElementById('autocomplete-suggestions');

    nomInput.addEventListener('input', function() {
        const query = nomInput.value.toLowerCase();
        if (query.length < 1) {
            suggestionsBox.style.display = 'none';
            return;
        }
        const matches = allPastClients.filter(client => 
            client.nom.toLowerCase().startsWith(query) || 
            client.prenom.toLowerCase().startsWith(query)
        );
        showSuggestions(matches);
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.autocomplete-container')) {
            suggestionsBox.style.display = 'none';
        }
    });

}); // <-- FIN DE DOMContentLoaded


// =======================================================
// FONCTIONS D'AUTOCOMPLÉTION
// =======================================================
async function loadAllClientsForAutocomplete() {
    try {
        const clientMap = new Map();
        const snapshot = await db.collection('expeditions').get();
        snapshot.forEach(doc => {
            const envoi = doc.data();
            if (envoi.tel) {
                clientMap.set(envoi.tel, {
                    nom: envoi.nom,
                    prenom: envoi.prenom,
                    tel: envoi.tel
                });
            }
        });
        allPastClients = Array.from(clientMap.values());
        console.log(`Chargé ${allPastClients.length} clients uniques pour l'autocomplétion.`);
    } catch (erreur) {
        console.error("Erreur chargement clients pour autocomplétion: ", erreur);
    }
}
function showSuggestions(matches) {
    const suggestionsBox = document.getElementById('autocomplete-suggestions');
    suggestionsBox.innerHTML = '';
    if (matches.length === 0) {
        suggestionsBox.style.display = 'none';
        return;
    }
    matches.slice(0, 5).forEach(client => {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${client.nom}</strong> ${client.prenom} (${client.tel})`;
        div.addEventListener('click', () => {
            selectSuggestion(client);
        });
        suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
}
function selectSuggestion(client) {
    document.getElementById('client-nom').value = client.nom;
    document.getElementById('client-prenom').value = client.prenom;
    document.getElementById('client-tel').value = client.tel;
    document.getElementById('autocomplete-suggestions').style.display = 'none';
}

// =======================================================
// FONCTIONS GLOBALES (PAGE ENVOI)
// =======================================================
function mettreAJourTableauEnvoiEnCours() {
    const tbody = document.getElementById('tbody-envoi-en-cours');
    tbody.innerHTML = '';
    if (envoiEnCours.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Aucun client ajouté.</td></tr>';
        return;
    }
    envoiEnCours.forEach((client, index) => {
        const typeEnvoi = document.getElementById('type-envoi').value;
        let poidsVolume = typeEnvoi === 'aerien' ? `${client.poidsEnvoye} Kg` : `${client.volumeEnvoye} CBM`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${client.prenom} ${client.nom}</td>
            <td>${client.tel}</td>
            <td>${client.quantiteEnvoyee}</td>
            <td>${poidsVolume}</td>
            <td>${client.prixEstime}</td>
            <td>
                <button class="btn-action btn-supprimer" onclick="supprimerClientEnvoiEnCours(${index})">X</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
function supprimerClientEnvoiEnCours(index) {
    if (confirm("Voulez-vous retirer ce client de la liste ?")) {
        envoiEnCours.splice(index, 1);
        mettreAJourTableauEnvoiEnCours();
    }
}

// =======================================================
// FONCTIONS GLOBALES (PAGE RÉCEPTION)
// =======================================================
async function chargerClients() {
    clientsCharges = [];
    const tbody = document.getElementById('liste-clients-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10">Chargement des expéditions...</td></tr>';
    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="10">Aucune expédition trouvée.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const envoi = doc.data();
            const id = doc.id;
            const nomClient = `${envoi.prenom} ${envoi.nom}`;

            let poidsVolume = '';
            if (envoi.type === 'aerien') {
                poidsVolume = `${envoi.poidsEnvoye} Kg`;
            } else {
                poidsVolume = `${envoi.volumeEnvoye} CBM`;
            }
            
            clientsCharges.push({ id: id, ...envoi, nomClient: nomClient, poidsVolume: poidsVolume });

            const tr = document.createElement('tr');
            
            let statusHtml = '';
            let statusClass = 'status-attente';
            let statusText = envoi.status || 'En attente';
            if (statusText === 'Reçu - Conforme') {
                statusClass = 'status-conforme';
            } else if (statusText === 'Reçu - Supérieur') { // NOUVEAU STATUT
                statusClass = 'status-superieur';
            } else if (statusText === 'Reçu - Ecart') {
                statusClass = 'status-ecart';
            }
            statusHtml = `<span class="status-badge ${statusClass}">${statusText}</span>`;

            tr.innerHTML = `
                <td>${envoi.reference || 'N/A'}</td>
                <td>${envoi.date}</td>
                <td>${nomClient}</td>
                <td>${envoi.tel || 'N/A'}</td>
                <td>${envoi.type}</td>
                <td>${envoi.quantiteEnvoyee}</td>
                <td>${poidsVolume}</td>
                <td>${envoi.prixEstime}</td>
                <td>${statusHtml}</td>
                <td>
                    <button class="btn-action btn-afficher">Afficher</button>
                    <button class="btn-action btn-supprimer">X</button>
                </td>
            `;

            const boutonAfficher = tr.querySelector('.btn-afficher');
            const boutonSupprimer = tr.querySelector('.btn-supprimer');
            
            boutonAfficher.setAttribute('data-doc', JSON.stringify({id, ...envoi}));
            boutonSupprimer.setAttribute('data-id', id);
            boutonSupprimer.setAttribute('data-nom', nomClient);
            
            boutonAfficher.onclick = () => selectionnerClient(boutonAfficher);
            boutonSupprimer.onclick = () => supprimerEnvoi(boutonSupprimer);

            tbody.appendChild(tr);
        });
    } catch (erreur) {
        console.error("Erreur chargement clients: ", erreur);
        tbody.innerHTML = '<tr><td colspan="10">Erreur de chargement.</td></tr>';
    }
}

// LOGIQUE DE MODAL (TRÈS MODIFIÉE)
const modalBackdrop = document.getElementById('modal-backdrop');
const clientSelectionneSpan = document.getElementById('client-selectionne');
const refAttendueSpan = document.getElementById('ref-attendue');
const telAttenduSpan = document.getElementById('tel-attendu');
const qteAttendueSpan = document.getElementById('qte-attendue');
const poidsAttenduSpan = document.getElementById('poids-attendu');
const prixAttenduSpan = document.getElementById('prix-attendu');
const poidsRecuLabel = document.querySelector('label[for="poids-recu"]');
const photosRecuesContainer = document.getElementById('photos-recues-container');
const photosRecuesApercu = document.getElementById('photos-recues-apercu');
const formReceptionContainer = document.getElementById('form-reception-container');
const receptionStatusDisplay = document.getElementById('reception-status-display');
const receptionStatus = document.getElementById('reception-status');
const receptionSummary = document.getElementById('reception-summary');
const receptionDifferencesDisplay = document.getElementById('reception-differences-display');


function selectionnerClient(bouton) {
    const envoi = JSON.parse(bouton.getAttribute('data-doc'));
    
    modalBackdrop.dataset.docId = envoi.id;
    modalBackdrop.dataset.envoi = bouton.getAttribute('data-doc');

    // 1. Remplir les "Données envoyées (Chine)"
    clientSelectionneSpan.innerText = `${envoi.prenom} ${envoi.nom}`;
    refAttendueSpan.innerText = envoi.reference || 'N/A';
    telAttenduSpan.innerText = envoi.tel || 'N/A';
    qteAttendueSpan.innerText = envoi.quantiteEnvoyee;
    prixAttenduSpan.innerText = envoi.prixEstime;

    let poidsLabel = '';
    if (envoi.type === 'aerien') {
        poidsLabel = `${envoi.poidsEnvoye} Kg`;
        poidsRecuLabel.innerText = 'Ajouter Poids (Kg)';
    } else {
        poidsLabel = `${envoi.volumeEnvoye} CBM`;
        poidsRecuLabel.innerText = 'Ajouter Volume (CBM)';
    }
    poidsAttenduSpan.innerText = poidsLabel;
    
    // 2. Afficher les photos
    photosRecuesApercu.innerHTML = '';
    if (envoi.photosURLs && envoi.photosURLs.length > 0) {
        envoi.photosURLs.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.alt = "Photo du colis";
            img.onclick = () => window.open(url, '_blank');
            photosRecuesApercu.appendChild(img);
        });
        photosRecuesContainer.style.display = 'block';
    } else {
        photosRecuesContainer.style.display = 'none';
    }

    // 3. Mettre à jour l'état actuel de la réception
    updateModalStatus(envoi);

    // 4. Afficher le modal
    modalBackdrop.style.display = 'flex';
}

// MODIFIÉ: Met à jour l'état du modal, y compris le manque à gagner
function updateModalStatus(envoi) {
    const status = envoi.status || 'En attente';
    const qteAttendue = envoi.quantiteEnvoyee;
    const qteRecue = envoi.quantiteRecue || 0;
    const diffQte = envoi.differenceQuantite; // Vient directement de la BDD

    const poidsAttendu = (envoi.type === 'aerien') ? envoi.poidsEnvoye : envoi.volumeEnvoye;
    const poidsRecu = envoi.poidsRecu || 0;
    const diffPoids = envoi.differencePoids; // Vient directement de la BDD
    const prixDiffNum = envoi.prixDifference || 0;
    
    // Mettre à jour le badge de statut
    receptionStatus.innerText = status;
    receptionStatus.className = 'status-badge';
    if (status === 'Reçu - Conforme') {
        receptionStatus.classList.add('status-conforme');
    } else if (status === 'Reçu - Supérieur') {
        receptionStatus.classList.add('status-superieur');
    } else if (status === 'Reçu - Ecart') {
        receptionStatus.classList.add('status-ecart');
    } else {
        receptionStatus.classList.add('status-attente');
    }

    // Mettre à jour le résumé
    receptionSummary.innerHTML = `
        <p>Quantité Reçue: <strong>${qteRecue} / ${qteAttendue}</strong></p>
        <p>Poids/Vol. Reçu: <strong>${poidsRecu.toFixed(2)} / ${poidsAttendu.toFixed(2)}</strong></p>
    `;

    // Mettre à jour les différences
    receptionDifferencesDisplay.innerHTML = '';
    if (status !== 'En attente') {
        if (diffQte === 0) {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-ok">Quantité: OK</p>`;
        } else if (diffQte > 0) {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-superieur">Surplus Quantité: +${diffQte} colis</p>`;
        } else {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-erreur">Écart Quantité: ${diffQte} colis</p>`;
        }
        
        if (Math.abs(diffPoids) < 0.001) {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-ok">Poids/Volume: OK</p>`;
        } else if (diffPoids > 0) {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-superieur">Surplus Poids/Volume: +${diffPoids.toFixed(2)}</p>`;
        } else {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-erreur">Écart Poids/Volume: ${diffPoids.toFixed(2)}</p>`;
        }
        
        // AFFICHAGE DU MANQUE À GAGNER / GAIN
        if (Math.abs(prixDiffNum) < 1) { // Si c'est 0
             // Ne rien afficher
        } else if (prixDiffNum > 0) {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-superieur">Gain Inattendu: ${prixDiffNum.toLocaleString('fr-FR')} CFA</p>`;
        } else {
            receptionDifferencesDisplay.innerHTML += `<p class="diff-erreur">Manque à Gagner: ${Math.abs(prixDiffNum).toLocaleString('fr-FR')} CFA</p>`;
        }
    }

    // Cacher le formulaire si c'est conforme
    if (status === 'Reçu - Conforme') {
        formReceptionContainer.style.display = 'none';
    } else {
        formReceptionContainer.style.display = 'block';
    }
}


function fermerModal(event) {
    if (event.target.id === 'modal-backdrop' || 
        event.target.classList.contains('modal-close') ||
        event.target.classList.contains('btn-secondaire')) 
    {
        modalBackdrop.style.display = 'none';
        modalBackdrop.dataset.docId = '';
        modalBackdrop.dataset.envoi = '';
    }
}

// MODIFIÉ: La fonction AJOUTE la réception
async function enregistrerReception() {
    const bouton = document.querySelector('#form-reception-container .btn-principal');
    bouton.disabled = true;
    bouton.innerText = "Enregistrement...";

    try {
        const docId = modalBackdrop.dataset.docId;
        const envoi = JSON.parse(modalBackdrop.dataset.envoi);

        const qteNouvelle = parseInt(document.getElementById('quantite-recue').value) || 0;
        const poidsNouveau = parseFloat(document.getElementById('poids-recu').value) || 0;
        
        if (qteNouvelle === 0 && poidsNouveau === 0) {
             alert("Veuillez entrer une quantité ou un poids.");
             throw new Error("Entrée vide");
        }

        const qteAttendue = parseInt(envoi.quantiteEnvoyee);
        const poidsAttendu = (envoi.type === 'aerien') ? envoi.poidsEnvoye : envoi.volumeEnvoye;

        const qteDejaRecue = envoi.quantiteRecue || 0;
        const poidsDejaRecu = envoi.poidsRecu || 0;

        const qteTotalRecue = qteDejaRecue + qteNouvelle;
        const poidsTotalRecu = poidsDejaRecu + poidsNouveau;

        const diffQte = qteTotalRecue - qteAttendue;
        const diffPoids = poidsTotalRecu - poidsAttendu;
        
        let prixDifference = 0;
        if (envoi.type === 'aerien') {
            prixDifference = diffPoids * PRIX_AERIEN_KG;
        } else {
            prixDifference = diffPoids * PRIX_MARITIME_CBM;
        }

        // NOUVELLE LOGIQUE DE STATUT
        let status = '';
        const estConforme = (diffQte === 0 && Math.abs(diffPoids) < 0.001);
        const estSuperieur = (diffQte >= 0 && diffPoids >= -0.001); // (diffQte >= 0 AND diffPoids >= 0, avec tolérance)

        if (estConforme) {
            status = 'Reçu - Conforme';
        } else if (estSuperieur) {
            status = 'Reçu - Supérieur';
        } else {
            status = 'Reçu - Ecart';
        }

        const receptionData = {
            status: status,
            quantiteRecue: qteTotalRecue,
            poidsRecu: poidsTotalRecu,
            differenceQuantite: diffQte,
            differencePoids: diffPoids,
            prixDifference: prixDifference, // Stocke le N°
            dateReception: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('expeditions').doc(docId).update(receptionData);

        const nouvelEnvoi = { ...envoi, ...receptionData };
        modalBackdrop.dataset.envoi = JSON.stringify(nouvelEnvoi);

        updateModalStatus(nouvelEnvoi);
        
        document.getElementById('quantite-recue').value = '';
        document.getElementById('poids-recu').value = '';

        chargerClients();

    } catch (erreur) {
        if (erreur.message !== "Entrée vide") {
            console.error("Erreur lors de l'enregistrement de la réception: ", erreur);
            alert("Échec de l'enregistrement: " + erreur.message);
        }
    } finally {
        bouton.disabled = false;
        bouton.innerText = "Enregistrer la Réception";
    }
}


// FONCTION: SUPPRIMER UN ENVOI
async function supprimerEnvoi(bouton) {
    const id = bouton.getAttribute('data-id');
    const nom = bouton.getAttribute('data-nom');
    if (!id) {
        alert('Erreur: ID de document non trouvé.');
        return;
    }
    if (confirm(`Voulez-vous vraiment supprimer l'expédition pour ${nom} ?\nCette action est irréversible.`)) {
        try {
            await db.collection('expeditions').doc(id).delete();
            alert('Envoi supprimé avec succès.');
            chargerClients();
        } catch (erreur) {
            console.error("Erreur lors de la suppression: ", erreur);
            alert("Échec de la suppression: " + erreur.message);
        }
    }
}


// =======================================================
// FONCTIONS D'EXPORT (MODIFIÉES)
// =======================================================
function exporterExcel() {
    if (clientsCharges.length === 0) {
        alert("Aucune donnée à exporter.");
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Référence,Date,Client,Téléphone,Type,Qté Envoyée,Poids/Vol Envoyé,Prix Estimé,Statut,Qté Reçue,Poids/Vol Reçu,Diff. Qté,Diff. Poids,Prix Écart (CFA)\r\n";
    
    clientsCharges.forEach(client => {
        csvContent += [
            `"${client.reference || ''}"`, `"${client.date}"`, `"${client.nomClient}"`, `"${client.tel || ''}"`,
            `"${client.type}"`, client.quantiteEnvoyee, `"${client.poidsVolume}"`, `"${client.prixEstime}"`,
            `"${client.status || 'En attente'}"`, client.quantiteRecue || 0, client.poidsRecu || 0,
            client.differenceQuantite || 0, client.differencePoids || 0, client.prixDifference || 0
        ].join(',') + "\r\n";
    });
    
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "expeditions_complet.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exporterPDF() {
    if (clientsCharges.length === 0) {
        alert("Aucune donnée à exporter.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    const headers = [["Ref", "Date", "Client", "Téléphone", "Type", "Qté Env.", "Poids/Vol", "Statut", "Qté Reçue", "Diff. Qté", "Diff. Poids", "Prix Écart"]];
    const body = clientsCharges.map(client => [
        client.reference || '', client.date, client.nomClient, client.tel || '',
        client.type, client.quantiteEnvoyee, client.poidsVolume, client.status || 'En attente',
        client.quantiteRecue || 0, client.differenceQuantite || 0, client.differencePoids.toFixed(2) || 0,
        (client.prixDifference || 0).toLocaleString('fr-FR')
    ]);

    doc.autoTable({
        head: headers,
        body: body,
        styles: { fontSize: 6 },
        headStyles: { fillColor: [21, 96, 158] },
        margin: { top: 10 }
    });

    doc.save('expeditions_complet.pdf');
}
