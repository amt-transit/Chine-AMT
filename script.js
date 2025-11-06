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
let envoiEnCours = []; // Stocke les clients avant la validation groupée
let clientsCharges = []; // Stocke les clients chargés pour l'export
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
        chargerClients(); // Charger les clients en ouvrant la page
    }
}


// Attend que tout le HTML soit chargé
document.addEventListener('DOMContentLoaded', function() {
    
    // Au démarrage, ouvrir la première page par défaut
    setTimeout(() => {
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink) activeLink.click();
    }, 10);


    // === LOGIQUE PAGE 1 : ENVOI ===
    
    // Récupération des champs du formulaire d'ajout
    const typeEnvoiSelect = document.getElementById('type-envoi');
    const champPoids = document.getElementById('champ-poids');
    const champVolume = document.getElementById('champ-volume');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const prixCalculeSpan = document.getElementById('prix-calcule');
    const photosInput = document.getElementById('photos-colis');
    const apercuPhotosDiv = document.getElementById('apercu-photos');

    // Récupération des boutons d'action
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
    
    // Calcul du prix pour UN client
    function calculerPrixClient() {
        const type = typeEnvoiSelect.value;
        const poids = parseFloat(poidsInput.value) || 0;
        const volume = parseFloat(volumeInput.value) || 0;
        let prix = 0;

        if (type === 'aerien') {
            prix = poids * PRIX_AERIEN_KG;
        } else if (type === 'maritime') {
            prix = volume * PRIX_MARITIME_CBM;
        }
        prixCalculeSpan.innerText = prix.toLocaleString('fr-FR') + ' CFA';
    }
    gererChampsEnvoi();
    
    // Aperçu Photos (inchangé)
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

    // NOUVELLE LOGIQUE: Bouton "Ajouter à l'envoi"
    btnAjouterClient.addEventListener('click', function() {
        // 1. Valider les champs requis
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

        // 2. Créer l'objet client
        const clientData = {
            nom: nom,
            prenom: prenom,
            tel: tel,
            quantiteEnvoyee: document.getElementById('quantite-envoyee').value,
            poidsEnvoye: parseFloat(poidsInput.value) || 0,
            volumeEnvoye: parseFloat(volumeInput.value) || 0,
            prixEstime: prixCalculeSpan.innerText,
            photosFiles: Array.from(photosInput.files) // Stocke les fichiers
        };

        // 3. Ajouter à la liste
        envoiEnCours.push(clientData);
        
        // 4. Mettre à jour le tableau HTML
        mettreAJourTableauEnvoiEnCours();

        // 5. Réinitialiser le formulaire client
        document.getElementById('form-ajout-client').reset();
        apercuPhotosDiv.innerHTML = '';
        calculerPrixClient();
    });

    // NOUVELLE LOGIQUE: Bouton "Valider l'envoi groupé"
    btnValiderEnvoiGroupe.addEventListener('click', async function() {
        if (envoiEnCours.length === 0) {
            alert("La liste d'envoi est vide. Veuillez ajouter au moins un client.");
            return;
        }

        this.disabled = true;
        this.innerText = 'Enregistrement en cours...';

        try {
            // 1. Récupérer les infos communes
            const dateEnvoi = document.getElementById('date-envoi').value;
            const typeEnvoi = document.getElementById('type-envoi').value;

            // 2. Générer la référence unique
            const typeRef = typeEnvoi === 'aerien' ? 'AMTA' : 'AMTM';
            const date = new Date();
            const refNum = `${typeRef}${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
            
            // 3. Boucler sur chaque client et l'envoyer à Firebase
            for (const client of envoiEnCours) {
                // 3a. Télécharger les photos pour CE client
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

                // 3b. Créer l'objet final pour Firebase
                const envoiFinal = {
                    reference: refNum,
                    date: dateEnvoi,
                    type: typeEnvoi,
                    nom: client.nom,
                    prenom: client.prenom,
                    tel: client.tel,
                    quantiteEnvoyee: client.quantiteEnvoyee,
                    poidsEnvoye: client.poidsEnvoye,
                    volumeEnvoye: client.volumeEnvoye,
                    prixEstime: client.prixEstime,
                    photosURLs: photosURLs,
                    creeLe: firebase.firestore.FieldValue.serverTimestamp()
                };

                // 3c. Envoyer à la collection
                await db.collection('expeditions').add(envoiFinal);
            }

            // 4. Tout réinitialiser
            alert(`Envoi groupé ${refNum} enregistré avec succès !`);
            envoiEnCours = [];
            mettreAJourTableauEnvoiEnCours();
            document.getElementById('form-envoi-commun').reset();
            
        } catch (erreur) {
            console.error("Erreur enregistrement groupé: ", erreur);
            alert("Échec de l'enregistrement: " + erreur.message);
        } finally {
            this.disabled = false;
            this.innerText = "Valider l'envoi groupé";
        }
    });
    
    
    // === LOGIQUE PAGE 2 : RECEPTION ===
    
    // Logique de recherche (inchangée)
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
                const nomClient = row.cells[2].innerText.toLowerCase(); // Colonne Client
                const telephone = row.cells[3].innerText.toLowerCase(); // Colonne Téléphone
                if (nomClient.includes(query) || telephone.includes(query)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            }
        });
    }

    // NOUVEAU: Logique d'export
    const btnExportPDF = document.getElementById('btn-export-pdf');
    const btnExportExcel = document.getElementById('btn-export-excel');
    
    if(btnExportPDF) btnExportPDF.addEventListener('click', exporterPDF);
    if(btnExportExcel) btnExportExcel.addEventListener('click', exporterExcel);

}); // <-- FIN DE DOMContentLoaded


// =======================================================
// FONCTIONS GLOBALES (PAGE ENVOI)
// =======================================================

function mettreAJourTableauEnvoiEnCours() {
    const tbody = document.getElementById('tbody-envoi-en-cours');
    tbody.innerHTML = ''; // Vider la table

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
                <button classclass="btn-action btn-supprimer" onclick="supprimerClientEnvoiEnCours(${index})">X</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function supprimerClientEnvoiEnCours(index) {
    if (confirm("Voulez-vous retirer ce client de la liste ?")) {
        envoiEnCours.splice(index, 1); // Retire l'élément à l'index donné
        mettreAJourTableauEnvoiEnCours(); // Met à jour le tableau
    }
}


// =======================================================
// FONCTIONS GLOBALES (PAGE RÉCEPTION)
// =======================================================

// Charge les clients dans le tableau
async function chargerClients() {
    clientsCharges = []; // Vider la liste pour l'export
    const tbody = document.getElementById('liste-clients-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="9">Chargement des expéditions...</td></tr>';

    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="9">Aucune expédition trouvée.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const envoi = doc.data();
            const id = doc.id;
            const nomClient = `${envoi.prenom} ${envoi.nom}`;

            let poidsVolume = '';
            let poidsVolumeLabel = '';
            if (envoi.type === 'aerien') {
                poidsVolume = `${envoi.poidsEnvoye} Kg`;
                poidsVolumeLabel = `${envoi.poidsEnvoye} Kg`;
            } else {
                poidsVolume = `${envoi.volumeEnvoye} CBM`;
                poidsVolumeLabel = `${envoi.volumeEnvoye} CBM`;
            }
            
            // Stocker pour l'export
            clientsCharges.push({
                id: id,
                ...envoi,
                nomClient: nomClient,
                poidsVolume: poidsVolume
            });

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${envoi.reference || 'N/A'}</td>
                <td>${envoi.date}</td>
                <td>${nomClient}</td>
                <td>${envoi.tel || 'N/A'}</td>
                <td>${envoi.type}</td>
                <td>${envoi.quantiteEnvoyee}</td>
                <td>${poidsVolume}</td>
                <td>${envoi.prixEstime}</td>
                <td>
                    <button class="btn-action btn-afficher">Afficher</button>
                    <button class="btn-action btn-supprimer">X</button>
                </td>
            `;

            const boutonAfficher = tr.querySelector('.btn-afficher');
            const boutonSupprimer = tr.querySelector('.btn-supprimer');

            // Stocker les données sur le bouton "Afficher"
            boutonAfficher.setAttribute('data-nom', nomClient);
            boutonAfficher.setAttribute('data-ref', envoi.reference || 'N/A');
            boutonAfficher.setAttribute('data-tel', envoi.tel || '');
            boutonAfficher.setAttribute('data-qte', envoi.quantiteEnvoyee);
            boutonAfficher.setAttribute('data-poids-volume', envoi.type === 'aerien' ? envoi.poidsEnvoye : envoi.volumeEnvoye);
            boutonAfficher.setAttribute('data-poids-label', poidsVolumeLabel);
            boutonAfficher.setAttribute('data-prix', envoi.prixEstime);
            const photosURLs = envoi.photosURLs || [];
            boutonAfficher.setAttribute('data-photos', JSON.stringify(photosURLs));
            
            // Stocker les données sur le bouton "Supprimer"
            boutonSupprimer.setAttribute('data-id', id);
            boutonSupprimer.setAttribute('data-nom', nomClient);
            
            boutonAfficher.onclick = () => selectionnerClient(boutonAfficher);
            boutonSupprimer.onclick = () => supprimerEnvoi(boutonSupprimer);

            tbody.appendChild(tr);
        });

    } catch (erreur) {
        console.error("Erreur chargement clients: ", erreur);
        tbody.innerHTML = '<tr><td colspan="9">Erreur de chargement.</td></tr>';
    }
}

// LOGIQUE DE MODAL (FENÊTRE POP-UP)
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
const detailsReceptionDiv = document.getElementById('details-reception');

function selectionnerClient(bouton) {
    // Récupération des données
    const nom = bouton.getAttribute('data-nom');
    const ref = bouton.getAttribute('data-ref');
    const telAttendu = bouton.getAttribute('data-tel');
    const qteAttendue = bouton.getAttribute('data-qte');
    const poidsVolumeAttendu = bouton.getAttribute('data-poids-volume');
    const poidsLabel = bouton.getAttribute('data-poids-label');
    const prixAttendu = bouton.getAttribute('data-prix');

    // Affichage des données
    clientSelectionneSpan.innerText = nom;
    refAttendueSpan.innerText = ref;
    telAttenduSpan.innerText = telAttendu || 'N/A';
    qteAttendueSpan.innerText = qteAttendue;
    poidsAttenduSpan.innerText = poidsLabel;
    prixAttenduSpan.innerText = prixAttendu;
    poidsRecuLabel.innerText = poidsLabel.includes('Kg') ? 'Poids reçu (Kg)' : 'Volume reçu (CBM)';
    
    // Stockage des données pour comparaison
    detailsReceptionDiv.dataset.qteAttendue = qteAttendue;
    detailsReceptionDiv.dataset.poidsAttendu = poidsVolumeAttendu;
    
    // Nettoyage
    document.getElementById('diff-qte').innerHTML = '';
    document.getElementById('diff-poids').innerHTML = '';
    document.getElementById('quantite-recue').value = '';
    document.getElementById('poids-recu').value = '';

    // Affichage des photos
    photosRecuesApercu.innerHTML = '';
    const photosURLsString = bouton.getAttribute('data-photos');
    const photosURLs = JSON.parse(photosURLsString);

    if (photosURLs && photosURLs.length > 0) {
        photosURLs.forEach(url => {
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

    // Afficher le modal
    modalBackdrop.style.display = 'flex';
}

function fermerModal(event) {
    if (event.target.id === 'modal-backdrop' || 
        event.target.classList.contains('modal-close') ||
        event.target.classList.contains('btn-secondaire')) 
    {
        modalBackdrop.style.display = 'none';
        photosRecuesContainer.style.display = 'none';
        photosRecuesApercu.innerHTML = '';
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
            chargerClients(); // Recharger la liste
        } catch (erreur) {
            console.error("Erreur lors de la suppression: ", erreur);
            alert("Échec de la suppression: " + erreur.message);
        }
    }
}


// Fonction de comparaison
function comparerDonnees() {
    // ... (Logique de comparaison inchangée) ...
    const qteAttendue = parseFloat(detailsReceptionDiv.dataset.qteAttendue);
    const poidsAttendu = parseFloat(detailsReceptionDiv.dataset.poidsAttendu);
    const qteRecue = parseFloat(document.getElementById('quantite-recue').value) || 0;
    const poidsRecu = parseFloat(document.getElementById('poids-recu').value) || 0;
    const diffQteEl = document.getElementById('diff-qte');
    const diffPoidsEl = document.getElementById('diff-poids');
    const diffQte = qteRecue - qteAttendue;
    const diffPoids = poidsRecu - poidsAttendu;

    if (diffQte === 0) {
        diffQteEl.innerHTML = `Quantité: OK (Reçu: ${qteRecue})`;
        diffQteEl.className = 'diff-ok';
    } else {
        let signe = diffQte > 0 ? '+' : '';
        diffQteEl.innerHTML = `Différence Quantité: ${signe}${diffQte} (Reçu: ${qteRecue}, Attendu: ${qteAttendue})`;
        diffQteEl.className = 'diff-erreur';
    }
    if (diffPoids === 0) {
        diffPoidsEl.innerHTML = `Poids/Volume: OK (Reçu: ${poidsRecu})`;
        diffPoidsEl.className = 'diff-ok';
    } else {
        let signe = diffPoids > 0 ? '+' : '';
        diffPoidsEl.innerHTML = `Différence Poids/Volume: ${signe}${diffPoids.toFixed(2)} (Reçu: ${poidsRecu}, Attendu: ${poidsAttendu})`;
        diffPoidsEl.className = 'diff-erreur';
    }
}


// =======================================================
// NOUVELLES FONCTIONS D'EXPORT
// =======================================================

function exporterExcel() {
    if (clientsCharges.length === 0) {
        alert("Aucune donnée à exporter.");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    // Entêtes
    csvContent += "Référence,Date,Client,Téléphone,Type,Quantité,Poids/Volume,Prix\r\n";
    
    // Lignes
    clientsCharges.forEach(client => {
        csvContent += [
            `"${client.reference || ''}"`,
            `"${client.date}"`,
            `"${client.nomClient}"`,
            `"${client.tel || ''}"`,
            `"${client.type}"`,
            client.quantiteEnvoyee,
            `"${client.poidsVolume}"`,
            `"${client.prixEstime}"`
        ].join(',') + "\r\n";
    });
    
    // Créer le lien de téléchargement
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "expeditions.csv");
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
    const doc = new jsPDF();

    const headers = [["Référence", "Date", "Client", "Téléphone", "Type", "Qté", "Poids/Vol", "Prix"]];
    const body = clientsCharges.map(client => [
        client.reference || '',
        client.date,
        client.nomClient,
        client.tel || '',
        client.type,
        client.quantiteEnvoyee,
        client.poidsVolume,
        client.prixEstime
    ]);

    doc.autoTable({
        head: headers,
        body: body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [21, 96, 158] } // Bleu
    });

    doc.save('expeditions.pdf');
}
