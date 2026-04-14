document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('tracking-form');
    const input = document.getElementById('track-input');

    // Lire le paramètre URL s'il existe (ex: tracking.html?ref=MRT-...)
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    
    if (refParam) {
        input.value = refParam;
        lancerRecherche(refParam);
    }

    // Gestion de la soumission du formulaire
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ref = input.value.trim();
        if (ref) {
            // Met à jour l'URL sans recharger la page (pour le partage)
            window.history.pushState({}, '', '?ref=' + encodeURIComponent(ref));
            lancerRecherche(ref);
        }
    });
});

async function lancerRecherche(ref) {
    document.getElementById('tracking-result').style.display = 'none';
    document.getElementById('error-message').style.display = 'none';
    document.getElementById('loading-spinner').style.display = 'block';

    try {
        // Requête Firestore pour trouver la référence exacte
        const snap = await db.collection('expeditions').where('reference', '==', ref).limit(1).get();
        
        if (snap.empty) {
            document.getElementById('loading-spinner').style.display = 'none';
            document.getElementById('error-message').style.display = 'block';
            return;
        }

        const data = snap.docs[0].data();
        afficherResultat(data);

    } catch (error) {
        console.error("Erreur de recherche :", error);
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('error-message').innerHTML = "⚠️ Une erreur réseau est survenue.";
        document.getElementById('error-message').style.display = 'block';
    }
}

function afficherResultat(d) {
    document.getElementById('loading-spinner').style.display = 'none';
    document.getElementById('tracking-result').style.display = 'block';

    // 1. Remplissage des infos globales
    document.getElementById('t-ref').innerText = d.reference;
    document.getElementById('t-desc').innerText = `${d.quantiteEnvoyee || 1} colis - ${d.description || 'Marchandise'}`;
    document.getElementById('t-pv').innerText = (d.type || '').startsWith('aerien') ? `${d.poidsEnvoye || 0} Kg` : `${d.volumeEnvoye || 0} CBM`;

    // Calcul du Reste à payer
    let pB = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
    let reste = pN - (parseInt(d.montantPaye) || 0);

    const badgeReste = document.getElementById('t-reste');
    if (reste <= 0 && pN > 0) {
        badgeReste.className = 'reste-badge solde';
        badgeReste.innerHTML = '✅ Facture Soldée';
    } else {
        badgeReste.className = 'reste-badge';
        badgeReste.innerHTML = `💰 Reste à payer : ${formatArgent(reste)} CFA`;
    }

    // 2. Construction de la Timeline dynamique
    const status = d.status || 'En attente';
    const isArrived = d.estArrive === true || status.includes('Reçu') || status === 'Livré' || status === 'En livraison' || status === 'Au déchargement';
    const isTransit = status !== 'En attente';
    
    const tl = document.getElementById('timeline-container');
    tl.innerHTML = `
        <div class="step done"><div class="step-icon"><i class="fas fa-check"></i></div>
            <div class="step-content"><div class="step-title">🇨🇳 Enregistré en Chine</div><div class="step-desc">Colis réceptionné par notre agence.</div></div></div>
        <div class="step ${isArrived ? 'done' : (isTransit ? 'active' : '')}"><div class="step-icon"><i class="${isArrived ? 'fas fa-check' : (isTransit ? 'fas fa-ship' : 'fas fa-hourglass')}"></i></div>
            <div class="step-content"><div class="step-title">🚢 En transit</div><div class="step-desc">En route vers la Côte d'Ivoire.</div></div></div>
        <div class="step ${status === 'Livré' || status === 'En livraison' ? 'done' : (isArrived ? 'active' : '')}"><div class="step-icon"><i class="${isArrived ? 'fas fa-check' : 'fas fa-plane-arrival'}"></i></div>
            <div class="step-content"><div class="step-title">🛬 Arrivé à Abidjan</div><div class="step-desc">Disponible pour le retrait.</div></div></div>
        <div class="step ${status === 'Livré' ? 'done' : (status === 'En livraison' ? 'active' : '')}"><div class="step-icon"><i class="${status === 'Livré' ? 'fas fa-check' : 'fas fa-home'}"></i></div>
            <div class="step-content"><div class="step-title">📦 Livré</div><div class="step-desc">Colis remis au client.</div></div></div>
    `;
}