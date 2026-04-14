// =======================================================
// INITIALISATION APP SECONDAIRE (Pour création sans déco)
// =======================================================
let secondaryApp;
if (!firebase.apps.find(app => app.name === "Secondary")) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
} else {
    secondaryApp = firebase.app("Secondary");
}
const secondaryAuth = secondaryApp.auth();

// =======================================================
// SÉCURITÉ STRICTE DE LA PAGE
// =======================================================
auth.onAuthStateChanged(user => {
    if (user) {
        // Vérification stricte de l'email admin (Super Admin)
        if (user.email !== 'admin@amt.com') {
            window.location.href = 'index.html';
        } else {
            // Si c'est bien l'admin, on charge la liste
            chargerUtilisateurs();
        }
    } else {
        window.location.href = 'index.html';
    }
});

// =======================================================
// CRÉATION D'UN NOUVEL UTILISATEUR
// =======================================================
document.getElementById('form-create-user').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;
    
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création en cours...';

    try {
        // 1. Création de l'utilisateur dans l'app secondaire
        const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        
        // 2. Sauvegarde des infos en base de données principale
        await db.collection('utilisateurs').doc(userCredential.user.uid).set({
            email: email,
            password: password, // Sauvegarde en clair (usage interne strict)
            role: role,
            creeLe: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 3. Déconnexion immédiate de l'app secondaire pour la nettoyer
        await secondaryAuth.signOut();

        showCustomAlert("✅ Utilisateur créé avec succès !", "success");
        e.target.reset(); // Vider le formulaire

    } catch (error) {
        console.error("Erreur de création :", error);
        showCustomAlert("Erreur : " + error.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Créer l\'utilisateur';
    }
});

// =======================================================
// LECTURE ET AFFICHAGE EN TEMPS RÉEL (onSnapshot)
// =======================================================
function chargerUtilisateurs() {
    db.collection('utilisateurs').orderBy('creeLe', 'desc').onSnapshot(snap => {
        const tbody = document.getElementById('tbody-users');
        if (!tbody) return;
        
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#888;">Aucun utilisateur trouvé.</td></tr>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const d = doc.data();
            const pwdId = `pwd-${doc.id}`;
            const roleColors = { 'chine': '#e67e22', 'abidjan': '#15609e', 'spectateur': '#8e44ad' };
            const roleColor = roleColors[d.role] || '#555';

            html += `<tr>
                <td data-label="Email" style="font-weight:bold;">${d.email}</td>
                <td data-label="Rôle"><span class="status-badge" style="background:${roleColor}; font-size:11px; text-transform:uppercase;">${d.role}</span></td>
                <td data-label="Mot de passe">
                    <span id="${pwdId}" data-pwd="${d.password}" style="font-family:monospace; font-size:14px; letter-spacing:2px; background:#f0f2f5; padding:4px 8px; border-radius:4px;">••••••••</span>
                    <i class="fas fa-eye" style="cursor:pointer; margin-left:10px; color:#1C3A5E;" title="Afficher/Masquer" onclick="togglePassword('${pwdId}', this)"></i>
                </td>
                <td data-label="Actions">
                    <button class="btn-suppr-small" style="background:#dc3545;" onclick="supprimerFirestoreUser('${doc.id}')" title="Supprimer de la liste">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    });
}

// =======================================================
// FONCTIONS UTILITAIRES (Mot de passe & Suppression)
// =======================================================
window.togglePassword = function(spanId, iconEl) {
    const span = document.getElementById(spanId);
    if (!span) return;
    
    const isHidden = span.innerText === '••••••••';
    if (isHidden) {
        span.innerText = span.getAttribute('data-pwd');
        span.style.letterSpacing = 'normal';
        iconEl.classList.remove('fa-eye');
        iconEl.classList.add('fa-eye-slash');
        iconEl.style.color = '#c0392b';
    } else {
        span.innerText = '••••••••';
        span.style.letterSpacing = '2px';
        iconEl.classList.remove('fa-eye-slash');
        iconEl.classList.add('fa-eye');
        iconEl.style.color = '#1C3A5E';
    }
};

window.supprimerFirestoreUser = async function(id) {
    const confirm = await showCustomConfirm("⚠️ Retirer cet utilisateur de la base de données ?\n\n(Note: Cela supprimera son rôle mais ne désactivera pas son compte Firebase Auth, il faut le faire manuellement dans la console Firebase).");
    if (confirm) {
        try {
            await db.collection('utilisateurs').doc(id).delete();
            showCustomAlert("Utilisateur supprimé de la liste avec succès.", "success");
        } catch (e) {
            showCustomAlert("Erreur lors de la suppression : " + e.message, "error");
        }
    }
};