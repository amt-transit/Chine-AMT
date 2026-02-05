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
const PRIX_AERIEN_NORMAL = 11000;
const PRIX_AERIEN_EXPRESS = 13000;
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