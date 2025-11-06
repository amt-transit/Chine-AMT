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

// =======================================================
// LOGIQUE DE NAVIGATION (Onglets/Pages)
// =======================================================
function ouvrirPage(event, nomPage) {
    // Cache tous les contenus de page
    const pageContents = document.getElementsByClassName("page-content");
    for (let i = 0; i < pageContents.length; i++) {
        pageContents[i].style.display = "none";
    }

    // Désactive tous les boutons de navigation
    const navLinks = document.getElementsByClassName("nav-link");
    for (let i = 0; i < navLinks.length; i++) {
        navLinks[i].className = navLinks[i].className.replace(" active", "");
    }

    // Affiche la page actuelle et active son bouton
    document.getElementById(nomPage).style.display = "block";
    event.currentTarget.className += " active";
    
    // =============================================
    // NOUVELLE LOGIQUE POUR CHANGER LE NOM DE L'AGENCE
    // =============================================
    const agenceNomEl = document.getElementById('agence-nom');
    if (nomPage === 'Envoi') {
        agenceNomEl.innerText = 'Chine';
    } else if (nomPage === 'Reception') {
        agenceNomEl.innerText = 'Abidjan';
    }
    // =============================================
    
    // Si on ouvre l'onglet Réception, on recharge la liste
    if (nomPage === 'Reception') {
        chargerClients();
    }
}


// Attend que tout le HTML soit chargé
document.addEventListener('DOMContentLoaded', function() {
    
    // Au démarrage, ouvrir la première page par défaut
    setTimeout(() => {
        // S'assure que le premier clic se fait
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink) {
            activeLink.click();
        }
    }, 10);


    // === LOGIQUE PAGE 1 : ENVOI ===
    
    const formChine = document.getElementById('form-chine');
    const typeEnvoi = document.getElementById('type-envoi');
    const champPoids = document.getElementById('champ-poids');
    const champVolume = document.getElementById('champ-volume');
    const poidsInput = document.getElementById('poids-envoye');
    const volumeInput = document.getElementById('volume-envoye');
    const prixCalculeSpan = document.getElementById('prix-calcule');
    const photosInput = document.getElementById('photos-colis');
    const apercuPhotosDiv = document.getElementById('apercu-photos');
    
    const PRIX_AERIEN_KG = 10000;
    const PRIX_MARITIME_CBM = 25000;

    // Fonctions de calcul (inchangées)
    function gererChampsEnvoi() {
        const type = typeEnvoi.value;
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
        calculerPrix();
    }
    function calculerPrix() {
        const type = typeEnvoi.value;
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
    typeEnvoi.addEventListener('change', gererChampsEnvoi);
    poidsInput.addEventListener('input', calculerPrix);
    volumeInput.addEventListener('input', calculerPrix);
    gererChampsEnvoi();
    
    // Aperçu Photos (inchangé)
    photosInput.addEventListener('change', function() {
        apercuPhotosDiv.innerHTML = '';
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
    });

    // Enregistrement Firebase (inchangé, 'tel' est déjà inclus)
    formChine.addEventListener('submit', async function(e) {
        e.preventDefault();
        const bouton = formChine.querySelector('button');
        bouton.disabled = true;
        bouton.innerText = 'Enregistrement...';

        try {
            const envoi = {
                date: document.getElementById('date-envoi').value,
                type: typeEnvoi.value,
                nom: document.getElementById('client-nom').value,
                prenom: document.getElementById('client-prenom').value,
                tel: document.getElementById('client-tel').value,
                quantiteEnvoyee: document.getElementById('quantite-envoyee').value,
                poidsEnvoye: parseFloat(poidsInput.value) || 0,
                volumeEnvoye: parseFloat(volumeInput.value) || 0,
                prixEstime: prixCalculeSpan.innerText,
                photosURLs: [],
                creeLe: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (photosInput.files.length > 0) {
                // ... (logique d'upload photo inchangée) ...
                for (const file of photosInput.files) {
                    const nomFichier = `colis_${Date.now()}_${file.name}`;
                    const refFichier = storage.ref(`images_colis/${nomFichier}`);
                    const snapshot = await refFichier.put(file);
                    const url = await snapshot.ref.getDownloadURL();
                    envoi.photosURLs.push(url);
                }
            }
            
            await db.collection('expeditions').add(envoi);
            alert('Expédition enregistrée avec succès !');
            formChine.reset();
            apercuPhotosDiv.innerHTML = '';
            
        } catch (erreur) {
            console.error("Erreur enregistrement: ", erreur);
            alert("Échec de l'enregistrement: " + erreur.message);
        } finally {
            bouton.disabled = false;
            bouton.innerText = "Enregistrer l'expédition";
        }
    });
});


// === Fonctions globales (accessibles partout) ===

// MODIFIÉ: Charge les clients dans le tableau
async function chargerClients() {
    const tbody = document.getElementById('liste-clients-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8">Chargement des expéditions...</td></tr>';

    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8">Aucune expédition trouvée.</td></tr>';
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

            const tr = document.createElement('tr');
            tr.innerHTML = `
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

            // Stocker TOUTES les données sur le bouton "Afficher"
            boutonAfficher.setAttribute('data-nom', nomClient);
            boutonAfficher.setAttribute('data-tel', envoi.tel || '');
            boutonAfficher.setAttribute('data-qte', envoi.quantiteEnvoyee);
            boutonAfficher.setAttribute('data-poids-volume', envoi.type === 'aerien' ? envoi.poidsEnvoye : envoi.volumeEnvoye);
            boutonAfficher.setAttribute('data-poids-label', poidsVolumeLabel);
            boutonAfficher.setAttribute('data-prix', envoi.prixEstime);
            const photosURLs = envoi.photosURLs || [];
            boutonAfficher.setAttribute('data-photos', JSON.stringify(photosURLs));
            
            // Stocker l'ID et le Nom sur le bouton "Supprimer"
            boutonSupprimer.setAttribute('data-id', id);
            boutonSupprimer.setAttribute('data-nom', nomClient);
            
            // Attacher les fonctions
            boutonAfficher.onclick = () => selectionnerClient(boutonAfficher);
            boutonSupprimer.onclick = () => supprimerEnvoi(boutonSupprimer);

            tbody.appendChild(tr);
        });

    } catch (erreur) {
        console.error("Erreur chargement clients: ", erreur);
        tbody.innerHTML = '<tr><td colspan="8">Erreur de chargement.</td></tr>';
    }
}

// =======================================================
// NOUVELLE LOGIQUE DE MODAL (FENÊTRE POP-UP)
// =======================================================

const modalBackdrop = document.getElementById('modal-backdrop');
// Récupère les éléments du formulaire CI
const clientSelectionneSpan = document.getElementById('client-selectionne');
const telAttenduSpan = document.getElementById('tel-attendu');
const qteAttendueSpan = document.getElementById('qte-attendue');
const poidsAttenduSpan = document.getElementById('poids-attendu');
const prixAttenduSpan = document.getElementById('prix-attendu');
const poidsRecuLabel = document.querySelector('label[for="poids-recu"]');
const photosRecuesContainer = document.getElementById('photos-recues-container');
const photosRecuesApercu = document.getElementById('photos-recues-apercu');
const detailsReceptionDiv = document.getElementById('details-reception');

// Étape 1: Remplir le modal et l'afficher
function selectionnerClient(bouton) {
    // Récupération des données
    const nom = bouton.getAttribute('data-nom');
    const telAttendu = bouton.getAttribute('data-tel');
    const qteAttendue = bouton.getAttribute('data-qte');
    const poidsVolumeAttendu = bouton.getAttribute('data-poids-volume');
    const poidsLabel = bouton.getAttribute('data-poids-label');
    const prixAttendu = bouton.getAttribute('data-prix');

    // Affichage des données
    clientSelectionneSpan.innerText = nom;
    telAttenduSpan.innerText = telAttendu || 'N/A';
    qteAttendueSpan.innerText = qteAttendue;
    poidsAttenduSpan.innerText = poidsLabel;
    prixAttenduSpan.innerText = prixAttendu;
    poidsRecuLabel.innerText = poidsLabel.includes('Kg') ? 'Poids effectivement reçu (Kg)' : 'Volume effectivement reçu (CBM)';
    
    // Stockage des données pour comparaison
    detailsReceptionDiv.dataset.qteAttendue = qteAttendue;
    detailsReceptionDiv.dataset.poidsAttendu = poidsVolumeAttendu;
    
    // Nettoyage des champs
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

// Étape 2: Fermer le modal
function fermerModal(event) {
    // Si on clique sur le fond gris (backdrop), ou un bouton de fermeture
    if (event.target.id === 'modal-backdrop' || 
        event.target.classList.contains('modal-close') ||
        event.target.classList.contains('btn-secondaire')) 
    {
        modalBackdrop.style.display = 'none';
        
        // Vider aussi les photos en masquant
        photosRecuesContainer.style.display = 'none';
        photosRecuesApercu.innerHTML = '';
    }
}

// =======================================================
// NOUVELLE FONCTION: SUPPRIMER UN ENVOI
// =======================================================
async function supprimerEnvoi(bouton) {
    const id = bouton.getAttribute('data-id');
    const nom = bouton.getAttribute('data-nom');
    
    if (!id) {
        alert('Erreur: ID de document non trouvé.');
        return;
    }

    // Demande de confirmation
    if (confirm(`Voulez-vous vraiment supprimer l'expédition pour ${nom} ?\nCette action est irréversible.`)) {
        try {
            // Supprimer le document de Firestore
            await db.collection('expeditions').doc(id).delete();
            
            // TODO: Supprimer les photos associées du Storage (plus complexe, pour plus tard)
            // const photosURLs = JSON.parse(bouton.getAttribute('data-photos'));
            // for (const url of photosURLs) { ... }
            
            alert('Envoi supprimé avec succès.');
            chargerClients(); // Recharger la liste
            
        } catch (erreur) {
            console.error("Erreur lors de la suppression: ", erreur);
            alert("Échec de la suppression: " + erreur.message);
        }
    }
}


// Fonction de comparaison (inchangée, fonctionne dans le modal)
function comparerDonnees() {
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
