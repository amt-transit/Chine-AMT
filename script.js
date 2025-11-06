// =======================================================
// CONFIGURATION FIREBASE
// (Assurez-vous que vos clés sont bien ici)
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
// LOGIQUE DES ONGLETS
// =======================================================
function ouvrirOnglet(event, nomOnglet) {
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }

    const tabLinks = document.getElementsByClassName("tab-link");
    for (let i = 0; i < tabLinks.length; i++) {
        tabLinks[i].className = tabLinks[i].className.replace(" active", "");
    }

    document.getElementById(nomOnglet).style.display = "block";
    event.currentTarget.className += " active";
    
    if (nomOnglet === 'Reception') {
        chargerClients();
        masquerDetails(); // Masquer les détails à chaque changement d'onglet
    }
}


// Attend que tout le HTML soit chargé
document.addEventListener('DOMContentLoaded', function() {
    
    // Au démarrage, ouvrir le premier onglet par défaut
    document.querySelector('.tab-link.active').click();

    // === LOGIQUE ONGLET 1 : ENVOI ===
    
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
                quantiteEnvoyee: document.getElementById('quantite-envoyee').value,
                poidsEnvoye: parseFloat(poidsInput.value) || 0,
                volumeEnvoye: parseFloat(volumeInput.value) || 0,
                prixEstime: prixCalculeSpan.innerText,
                photosURLs: [],
                creeLe: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (photosInput.files.length > 0) {
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

async function chargerClients() {
    const tbody = document.getElementById('liste-clients-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7">Chargement des expéditions...</td></tr>';

    try {
        const snapshot = await db.collection('expeditions').orderBy('creeLe', 'desc').get();
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7">Aucune expédition trouvée.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const envoi = doc.data();
            const id = doc.id;

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
                <td>${envoi.prenom} ${envoi.nom}</td>
                <td>${envoi.type}</td>
                <td>${envoi.quantiteEnvoyee}</td>
                <td>${poidsVolume}</td>
                <td>${envoi.prixEstime}</td>
                <td>
                    <button class="btn-afficher">Afficher</button>
                </td>
            `;

            const boutonAfficher = tr.querySelector('.btn-afficher');
            boutonAfficher.setAttribute('data-id', id);
            boutonAfficher.setAttribute('data-nom', `${envoi.prenom} ${envoi.nom}`);
            boutonAfficher.setAttribute('data-qte', envoi.quantiteEnvoyee);
            boutonAfficher.setAttribute('data-poids-volume', envoi.type === 'aerien' ? envoi.poidsEnvoye : envoi.volumeEnvoye);
            boutonAfficher.setAttribute('data-poids-label', poidsVolumeLabel);
            boutonAfficher.setAttribute('data-prix', envoi.prixEstime);
            
            boutonAfficher.onclick = () => selectionnerClient(boutonAfficher);

            tbody.appendChild(tr);
        });

    } catch (erreur) {
        console.error("Erreur chargement clients: ", erreur);
        tbody.innerHTML = '<tr><td colspan="7">Erreur de chargement.</td></tr>';
    }
}


const detailsReceptionDiv = document.getElementById('details-reception');
const clientSelectionneSpan = document.getElementById('client-selectionne');
const qteAttendueSpan = document.getElementById('qte-attendue');
const poidsAttenduSpan = document.getElementById('poids-attendu');
const prixAttenduSpan = document.getElementById('prix-attendu');
const poidsRecuLabel = document.querySelector('label[for="poids-recu"]');

function selectionnerClient(bouton) {
    detailsReceptionDiv.style.display = 'block';

    const nom = bouton.getAttribute('data-nom');
    const qteAttendue = bouton.getAttribute('data-qte');
    const poidsVolumeAttendu = bouton.getAttribute('data-poids-volume');
    const poidsLabel = bouton.getAttribute('data-poids-label');
    const prixAttendu = bouton.getAttribute('data-prix');

    clientSelectionneSpan.innerText = nom;
    qteAttendueSpan.innerText = qteAttendue;
    poidsAttenduSpan.innerText = poidsLabel;
    prixAttenduSpan.innerText = prixAttendu;
    
    poidsRecuLabel.innerText = poidsLabel.includes('Kg') ? 'Poids effectivement reçu (Kg)' : 'Volume effectivement reçu (CBM)';
    
    detailsReceptionDiv.dataset.qteAttendue = qteAttendue;
    detailsReceptionDiv.dataset.poidsAttendu = poidsVolumeAttendu;
    
    document.getElementById('diff-qte').innerHTML = '';
    document.getElementById('diff-poids').innerHTML = '';
    document.getElementById('quantite-recue').value = '';
    document.getElementById('poids-recu').value = '';

    // Défiler vers les détails si sur mobile
    if (window.innerWidth < 768) {
        detailsReceptionDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// NOUVEAU: Fonction pour masquer les détails
function masquerDetails() {
    detailsReceptionDiv.style.display = 'none';
    // On pourrait aussi effacer les champs si on veut
    // document.getElementById('quantite-recue').value = '';
    // document.getElementById('poids-recu').value = '';
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
        diffPoidsEl.innerHTML = `Poids/Volume: OK (Reçu: ${poidsRecu})`;
        diffPoidsEl.className = 'diff-ok';
    } else {
        let signe = diffPoids > 0 ? '+' : '';
        diffPoidsEl.innerHTML = `Différence Poids/Volume: ${signe}${diffPoids.toFixed(2)} (Reçu: ${poidsRecu}, Attendu: ${poidsAttendu})`;
        diffPoidsEl.className = 'diff-erreur';
    }
}
