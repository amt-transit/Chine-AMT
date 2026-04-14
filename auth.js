// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\auth.js

// =======================================================
// AUTHENTIFICATION
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
    // Détection de la page actuelle
    const path = window.location.pathname;
    const page = path.split("/").pop();
    const isLoginPage = (page === 'index.html' || page === '');
    
    if(user) {
        currentUser = user;
        
        // Définition du rôle
        if(user.email === 'admin@amt.com') currentRole='superadmin';
        else if(user.email.includes('chine')) currentRole='chine'; 
        else if (user.email.includes('audit')) currentRole='spectateur';
        else currentRole='abidjan';

        // --- REDIRECTION SI SUR PAGE LOGIN ---
        if(isLoginPage) {
            if(currentRole === 'superadmin') window.location.href = 'envoi.html';
            else if(currentRole === 'chine') window.location.href = 'envoi.html';
            else if(currentRole === 'spectateur') window.location.href = 'comptabilite.html';
            else window.location.href = 'envoi.html';
            return;
        }

        // --- GESTION UI SUR LES PAGES INTERNES ---
        const disp = document.getElementById('agence-nom');
        if(disp) {
             if(currentRole === 'superadmin') disp.innerText="Super Admin";
             else if(currentRole === 'chine') disp.innerText="Chine";
             else if(currentRole === 'spectateur') disp.innerText="Auditeur";
             else disp.innerText="Abidjan";
        }

        // Masquer les liens non autorisés
        if(currentRole === 'chine') {
            const navRec = document.getElementById('nav-reception'); if(navRec) navRec.style.display='none';
            const navCompta = document.getElementById('nav-compta'); if(navCompta) navCompta.style.display='none';
            const navAudit = document.getElementById('nav-audit'); if(navAudit) navAudit.style.display='none';
            const navListing = document.getElementById('nav-listing'); if(navListing) navListing.style.display='inline-flex';
            const navAdmin = document.getElementById('nav-admin'); if(navAdmin) navAdmin.style.display='none';
        } else if (currentRole === 'spectateur') {
            const navEnv = document.getElementById('nav-envoi'); if(navEnv) navEnv.style.display='none';
            const navHist = document.getElementById('nav-historique'); if(navHist) navHist.style.display='none';
            const navRec = document.getElementById('nav-reception'); if(navRec) navRec.style.display='none';
            const btnAjout = document.getElementById('btn-ajout-depense'); if(btnAjout) btnAjout.style.display = 'none';
            const navListing = document.getElementById('nav-listing'); if(navListing) navListing.style.display='inline-flex';
            const navAdmin = document.getElementById('nav-admin'); if(navAdmin) navAdmin.style.display='none';
        } else if (currentRole === 'superadmin') {
            const navEnv = document.getElementById('nav-envoi'); if(navEnv) navEnv.style.display='inline-flex';
            const navHist = document.getElementById('nav-historique'); if(navHist) navHist.style.display='inline-flex';
            const navRec = document.getElementById('nav-reception'); if(navRec) navRec.style.display='inline-flex';
            const navCompta = document.getElementById('nav-compta'); if(navCompta) navCompta.style.display='inline-flex';
            const navScan = document.getElementById('nav-scan'); if(navScan) navScan.style.display='inline-flex';
            const navListing = document.getElementById('nav-listing'); if(navListing) navListing.style.display='inline-flex';
            const navAudit = document.getElementById('nav-audit'); if(navAudit) navAudit.style.display='inline-flex';
            const navAdmin = document.getElementById('nav-admin'); if(navAdmin) navAdmin.style.display='inline-flex';
            const btnAjout = document.getElementById('btn-ajout-depense');
            if(btnAjout) btnAjout.style.display = 'inline-block';
        } else {
            // Abidjan
            const navRec = document.getElementById('nav-reception'); if(navRec) navRec.style.display='inline-flex';
            const navCompta = document.getElementById('nav-compta'); if(navCompta) navCompta.style.display='inline-flex';
            const navAudit = document.getElementById('nav-audit'); if(navAudit) navAudit.style.display='inline-flex';
            const navListing = document.getElementById('nav-listing'); if(navListing) navListing.style.display='inline-flex';
            const navAdmin = document.getElementById('nav-admin'); if(navAdmin) navAdmin.style.display='none';
            const btnAjout = document.getElementById('btn-ajout-depense');
            if(btnAjout) btnAjout.style.display = 'inline-block';
        }
    } else { 
        // Si déconnecté et pas sur la page de login, on redirige
        if(!isLoginPage) {
            window.location.href = 'index.html';
        }
        // Afficher le formulaire de login (géré par CSS/HTML sur index.html)
        const overlay = document.getElementById('login-overlay');
        if(overlay) overlay.style.display='flex'; 
    }
});

function deconnexion() {
    auth.signOut().then(() => window.location.href = 'index.html');
}
