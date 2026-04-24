// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\config.js

// =======================================================
// CONFIGURATION FIREBASE & GLOBALES
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

// Variables Globales
let envoiEnCours = [];
let sousColisList = [];
let clientsCharges = [];
let allPastClients = [];
let historiqueCharges = []; // Données filtrées pour l'export historique
let currentUser = null;
let currentRole = null;
let currentIdPaiementOpen = null;

// Données chargées pour filtres
let allHistoriqueData = [];
let allReceptionData = [];
let selectedGroupsHistorique = [];
let selectedGroupsReception = [];
let selectedHistoriqueIds = new Set();
let selectedReceptionIds = new Set();

// Constantes Prix
const PRIX_AERIEN_NORMAL = 10000;
const PRIX_AERIEN_EXPRESS = 14000;
const PRIX_MARITIME_CBM = 250000;

// États courants
let currentReceptionType = 'maritime';
let currentHistoriqueType = 'maritime';
let currentComptaType = 'maritime';
let currentEnvoi = null;
let currentModifEnvoi = null;

// Utilitaire de formatage
function formatArgent(montant) {
    if (isNaN(montant)) return "0";
    return parseInt(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// Gestion de l'affichage du menu mobile
function toggleMobileMenu() {
    const nav = document.querySelector('.main-nav');
    if (nav) nav.classList.toggle('show');
}

// =======================================================
// SYSTÈME D'ALERTES ET DE CONFIRMATIONS PERSONNALISÉES
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    const dialogHTML = `
        <div id="amt-custom-dialog" class="modal-backdrop" style="z-index: 9999; display: none;">
            <div class="modal-content" style="max-width: 350px; text-align: center; padding: 30px 20px; border-radius: 16px;">
                <div id="amt-dialog-icon" style="font-size: 50px; margin-bottom: 15px; line-height: 1;"></div>
                <h3 id="amt-dialog-title" style="margin-top: 0; font-size: 20px; margin-bottom: 10px;"></h3>
                <p id="amt-dialog-message" style="margin-bottom: 25px; font-size: 15px; color: #555; line-height: 1.5;"></p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="amt-dialog-btn-cancel" class="step-btn step-btn-back" style="display: none; flex: 1; margin: 0; padding: 12px; font-size: 14px;">Annuler</button>
                    <button id="amt-dialog-btn-ok" class="step-btn step-btn-primary" style="flex: 1; margin: 0; padding: 12px; font-size: 14px;">OK</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
});

window.showCustomAlert = function(message, type = 'info') {
    return new Promise((resolve) => {
        const backdrop = document.getElementById('amt-custom-dialog');
        if (!backdrop) { alert(message); resolve(); return; }
        
        const icon = document.getElementById('amt-dialog-icon');
        const title = document.getElementById('amt-dialog-title');
        const btnOk = document.getElementById('amt-dialog-btn-ok');
        
        document.getElementById('amt-dialog-btn-cancel').style.display = 'none';
        btnOk.className = 'step-btn step-btn-primary'; btnOk.innerText = 'OK';
        
        if (type === 'error') { icon.innerHTML = '❌'; title.innerText = 'Erreur'; title.style.color = '#c0392b'; btnOk.className = 'step-btn step-btn-red'; }
        else if (type === 'success') { icon.innerHTML = '✅'; title.innerText = 'Succès'; title.style.color = '#27ae60'; btnOk.className = 'step-btn step-btn-green'; }
        else if (type === 'warning') { icon.innerHTML = '⚠️'; title.innerText = 'Attention'; title.style.color = '#F5A623'; btnOk.className = 'step-btn step-btn-orange'; }
        else { icon.innerHTML = 'ℹ️'; title.innerText = 'Information'; title.style.color = '#1C3A5E'; }

        document.getElementById('amt-dialog-message').innerHTML = message.replace(/^✅\s*/, '').replace(/^⚠️\s*/, '').replace(/^❌\s*/, '').replace(/\n/g, '<br>');
        backdrop.style.display = 'flex';
        btnOk.onclick = () => { backdrop.style.display = 'none'; resolve(true); };
    });
};

window.showCustomConfirm = function(message) {
    return new Promise((resolve) => {
        const backdrop = document.getElementById('amt-custom-dialog');
        if (!backdrop) { resolve(confirm(message)); return; }
        
        document.getElementById('amt-dialog-icon').innerHTML = '❓';
        document.getElementById('amt-dialog-title').innerText = 'Confirmation';
        document.getElementById('amt-dialog-title').style.color = '#1C3A5E';
        document.getElementById('amt-dialog-message').innerHTML = message.replace(/^⚠️\s*/, '').replace(/\n/g, '<br>');
        
        document.getElementById('amt-dialog-btn-cancel').style.display = 'block';
        const btnOk = document.getElementById('amt-dialog-btn-ok');
        btnOk.className = 'step-btn step-btn-primary'; btnOk.innerText = 'Confirmer';
        
        backdrop.style.display = 'flex';
        btnOk.onclick = () => { backdrop.style.display = 'none'; resolve(true); };
        document.getElementById('amt-dialog-btn-cancel').onclick = () => { backdrop.style.display = 'none'; resolve(false); };
    });
};