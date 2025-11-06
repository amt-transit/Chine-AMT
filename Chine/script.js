// =======================================================
// ÉTAPE 1 : CONFIGURATION FIREBASE
// !! REMPLACEZ CECI PAR VOS PROPRES CLÉS OBTENUES SUR LE SITE DE FIREBASE !!
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
firebase.initializeApp(firebaseConfig);

// Créer des "raccourcis" vers les services Firebase
const db = firebase.firestore(); // La base de données (Firestore)
const storage = firebase.storage(); // Le stockage de fichiers (Storage)


// Attend que tout le HTML soit chargé avant d'exécuter le script
document.addEventListener('DOMContentLoaded', function() {
    
    // === VOLET 1 : LOGIQUE POUR LA CHINE ===
    
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

    // Fonctions pour calculer le prix (INCHANGÉ)
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
    
    // Aperçu photos (INCHANGÉ)
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

    // *** NOUVEAU : Logique d'enregistrement sur Firebase ***
    formChine.addEventListener('submit', async function(e) {
        e.preventDefault(); // Empêche la page de se recharger

        const bouton = formChine.querySelector('button');
        bouton.disabled = true;
        bouton.innerText = 'Enregistrement...';

        try {
            // 1. Récupérer toutes les données du formulaire
            const envoi = {
                date: document.getElementById('date-envoi').value,
                type: typeEnvoi.value,
                nom: document.getElementById('client-nom').value,
                prenom: document.getElementById('client-prenom').value,
                quantiteEnvoyee: document.getElementById('quantite-envoyee').value,
                poidsEnvoye: parseFloat(poidsInput.value) || 0,
                volumeEnvoye: parseFloat(volumeInput.value) || 0,
                prixEstime: prixCalculeSpan.innerText,
                photosURLs: [], // On va remplir ça après
                creeLe: firebase.firestore.FieldValue.serverTimestamp()
            };

            // 2. Envoyer les photos (s'il y en a)
            if (photosInput.files.length > 0) {
                for (const file of photosInput.files) {
                    // Créer un nom de fichier unique (ex: image_1678886400000.jpg)
                    const nomFichier = `colis_${Date.now()}_${file.name}`;
                    const refFichier = storage.ref(`images_colis/${nomFichier}`);
                    
                    // Envoyer le fichier
                    const snapshot = await refFichier.put(file);
                    
                    // Récupérer l'URL de téléchargement
                    const url = await snapshot.ref.getDownloadURL();
                    envoi.photosURLs.push(url);
                }
            }
            
            // 3. Envoyer les données (texte + URLs des photos) à Firestore
            await db.collection('expeditions').add(envoi);

            alert('Expédition enregistrée avec succès !');
            formChine.reset(); // Vider le formulaire
            apercuPhotosDiv.innerHTML = '';
            
        } catch (erreur) {
            console.error("Erreur lors de l'enregistrement: ", erreur);
            alert("Échec de l'enregistrement: " + erreur.message);
        } finally {
            bouton.disabled = false;
            bouton.innerText = "Enregistrer l'expédition";
        }
    });


    // === VOLET 2 : LOGIQUE POUR LA CÔTE D'IVOIRE ===
    
    const listeClientsUl = document.getElementById('liste-clients');

    // *** NOUVEAU : Charger les clients depuis Firebase ***
    async function chargerClients() {
        listeClientsUl.innerHTML = '<li>Chargement des clients...</li>';

        try {
            // Demander à Firestore toutes les 'expeditions', triées par date
            const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
            
            if (snapshot.empty) {
                listeClientsUl.innerHTML = '<li>Aucune expédition trouvée.</li>';
                return;
            }

            listeClientsUl.innerHTML = ''; // Vider la liste
            
            // Pour chaque document trouvé, créer un <li>
            snapshot.forEach(doc => {
                const envoi = doc.data(); // Les données de l'envoi
                const id = doc.id; // L'ID unique du document

                const li = document.createElement('li');
                li.innerText = `Client: ${envoi.prenom} ${envoi.nom} (Envoi du ${envoi.date})`;
                
                // On stocke TOUTES les infos dans les attributs data-*
                li.setAttribute('data-id', id);
                li.setAttribute('data-nom', `${envoi.prenom} ${envoi.nom}`);
                li.setAttribute('data-qte', envoi.quantiteEnvoyee);
                li.setAttribute('data-poids', envoi.poidsEnvoye);
                li.setAttribute('data-prix', envoi.prixEstime);
                
                // On attache la fonction onclick
                li.onclick = () => selectionnerClient(li);
                
                listeClientsUl.appendChild(li);
            });

        } catch (erreur) {
            console.error("Erreur chargement clients: ", erreur);
            listeClientsUl.innerHTML = '<li>Erreur de chargement.</li>';
        }
    }

    // Charger les clients au démarrage
    chargerClients();
});


// === Fonctions globales pour le Volet 2 (INCHANGÉES) ===

const detailsReceptionDiv = document.getElementById('details-reception');
const clientSelectionneSpan = document.getElementById('client-selectionne');
const qteAttendueSpan = document.getElementById('qte-attendue');
const poidsAttenduSpan = document.getElementById('poids-attendu');
const prixAttenduSpan = document.getElementById('prix-attendu');

function selectionnerClient(elementLi) {
    detailsReceptionDiv.style.display = 'block';

    const nom = elementLi.getAttribute('data-nom');
    const qteAttendue = elementLi.getAttribute('data-qte');
    const poidsAttendu = elementLi.getAttribute('data-poids');
    const prixAttendu = elementLi.getAttribute('data-prix');

    clientSelectionneSpan.innerText = nom;
    qteAttendueSpan.innerText = qteAttendue;
    poidsAttenduSpan.innerText = poidsAttendu;
    prixAttenduSpan.innerText = prixAttendu;
    
    detailsReceptionDiv.dataset.qteAttendue = qteAttendue;
    detailsReceptionDiv.dataset.poidsAttendu = poidsAttendu;
    
    document.getElementById('diff-qte').innerHTML = '';
    document.getElementById('diff-poids').innerHTML = '';
    document.getElementById('quantite-recue').value = '';
    document.getElementById('poids-recu').value = '';
}

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
        diffPoidsEl.innerHTML = `Poids: OK (Reçu: ${poidsRecu} Kg)`;
        diffPoidsEl.className = 'diff-ok';
    } else {
        let signe = diffPoids > 0 ? '+' : '';
        diffPoidsEl.innerHTML = `Différence Poids: ${signe}${diffPoids.toFixed(2)} Kg (Reçu: ${poidsRecu} Kg, Attendu: ${poidsAttendu} Kg)`;
        diffPoidsEl.className = 'diff-erreur';
    }

    // TODO : On pourrait aussi enregistrer ces données de réception dans Firebase
    // db.collection('expeditions').doc(id_du_client).update({ ... });
}