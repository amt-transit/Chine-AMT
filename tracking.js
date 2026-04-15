// tracking.js — Suivi public de colis (Version améliorée)

let currentTrackingData = null;
let qrGenerated = false;

// Utilitaire de formatage montant (pas de config.js en tracking public)
function formatArgent(n) {
    if (isNaN(n)) return '0';
    return parseInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const form  = document.getElementById('tracking-form');
    const input = document.getElementById('track-input');

    // Pré-remplir depuis l'URL
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef) {
        input.value = urlRef;
        lancerRecherche(urlRef);
    }

    form.addEventListener('submit', e => {
        e.preventDefault();
        const ref = input.value.trim();
        if (!ref) return;
        window.history.pushState({}, '', '?ref=' + encodeURIComponent(ref));
        lancerRecherche(ref);
    });
});

// ─── Recherche Firestore ─────────────────────────────────
async function lancerRecherche(ref) {
    const resultEl  = document.getElementById('t-result');
    const errorEl   = document.getElementById('t-error');
    const spinnerEl = document.getElementById('t-spinner');

    resultEl.style.display  = 'none';
    errorEl.style.display   = 'none';
    spinnerEl.style.display = 'block';
    qrGenerated = false;
    document.getElementById('t-qr-section').style.display = 'none';
    document.getElementById('t-qr-canvas').innerHTML = '';

    try {
        const snap = await db.collection('expeditions')
            .where('reference', '==', ref.trim())
            .limit(1).get();

        spinnerEl.style.display = 'none';

        if (snap.empty) {
            errorEl.style.display = 'block';
            return;
        }

        currentTrackingData = snap.docs[0].data();
        afficherResultat(currentTrackingData);
    } catch (err) {
        console.error(err);
        spinnerEl.style.display = 'none';
        errorEl.innerHTML = '⚠️ Erreur réseau. Réessayez dans quelques instants.';
        errorEl.style.display = 'block';
    }
}

// ─── Affichage ───────────────────────────────────────────
function afficherResultat(d) {
    const resultEl = document.getElementById('t-result');
    resultEl.style.display = 'block';

    // Infos de base
    document.getElementById('t-ref').textContent  = d.reference;
    const isAir = (d.type || '').startsWith('aerien');
    const pvStr = isAir ? `${d.poidsEnvoye || 0} Kg` : `${d.volumeEnvoye || 0} CBM`;
    document.getElementById('t-desc').textContent = `${d.quantiteEnvoyee || 1} colis · ${d.description || 'Marchandise'} · ${pvStr}`;

    // Reste à payer
    let pB    = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
    let pN    = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
    let reste = pN - (parseInt(d.montantPaye) || 0);
    const badgeEl = document.getElementById('t-reste');
    if (reste <= 0 && pN > 0) {
        badgeEl.className = 't-badge paid';
        badgeEl.innerHTML = '✅ Facture soldée';
    } else if (pN === 0) {
        badgeEl.className = 't-badge paid';
        badgeEl.innerHTML = '✅ Gratuit / Offert';
    } else {
        badgeEl.className = 't-badge unpaid';
        badgeEl.innerHTML = `💰 Reste à payer : <strong>${formatArgent(reste)} CFA</strong>`;
    }

    // Timeline
    _buildTimeline(d);

    // Photos
    _buildPhotos(d);

    // Scroll vers le résultat
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Timeline dynamique ──────────────────────────────────
function _buildTimeline(d) {
    const status   = d.status || 'En attente';
    const estArrive = d.estArrive === true;
    const sCh = (d.colisScannes_chargement || (d.colisScannes && status === 'Au chargement' ? d.colisScannes : []) || []).length;
    const sDe = (d.colisScannes_dechargement || []).length;
    const sLi = (d.colisScannes_livre || []).length;
    const total = parseInt(d.quantiteEnvoyee) || 1;

    // Déduire le niveau de progression
    const isCharge     = sCh > 0 || status === 'Au chargement';
    const isDecharge   = sDe > 0 || status === 'Au déchargement' || estArrive || status.includes('Reçu');
    const isEnLivraison = status === 'En livraison';
    const isLivre      = sLi > 0 || status === 'Livré';

    // Date de l'envoi formatée
    const dateEnvoi = d.date
        ? new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

    // Dates de scan (si disponibles)
    const dateCh = d.dateDernier_chargement  || (isCharge    ? 'Date enregistrée' : '');
    const dateDe = d.dateDernier_dechargement || (isDecharge  ? 'Date enregistrée' : '');
    const dateLi = d.dateDernier_livre        || (isLivre     ? 'Date enregistrée' : '');

    const steps = [
        {
            icon: '✓',
            title: '🇨🇳 Enregistré en Chine',
            desc: `Le ${dateEnvoi}`,
            done: true,
            active: false,
        },
        {
            icon: '🚢',
            title: isCharge ? `Chargé (${sCh}/${total} colis)` : 'Chargement en attente',
            desc: dateCh || 'En cours de préparation',
            done: isCharge,
            active: isCharge && !isDecharge,
        },
        {
            icon: '🛬',
            title: isDecharge ? 'Arrivé à Abidjan' : 'En route vers Abidjan',
            desc: dateDe || (isCharge ? 'Transit en cours' : 'En attente de chargement'),
            done: isDecharge,
            active: isDecharge && !isEnLivraison && !isLivre,
        },
        {
            icon: '🛵',
            title: isEnLivraison ? 'En livraison' : 'Disponible au retrait',
            desc: isDecharge ? 'Agence AMT Abidjan · Tél : +225 07 03 16 50 50' : 'Pas encore arrivé',
            done: isEnLivraison || isLivre,
            active: isDecharge && !isLivre,
        },
        {
            icon: '✓',
            title: isLivre ? `Livré (${sLi}/${total} colis)` : 'Livraison',
            desc: dateLi || (isLivre ? 'Remis au client' : 'En attente'),
            done: isLivre,
            active: isEnLivraison && !isLivre,
        },
    ];

    const tl = document.getElementById('t-timeline');
    tl.innerHTML = steps.map(s => `
        <div class="t-step ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}">
            <div class="t-step-icon">${s.done ? '✓' : (s.active ? '●' : '')}</div>
            <div class="t-step-title">${s.title}</div>
            <div class="t-step-date">${s.desc}</div>
        </div>`).join('');
}

// ─── Photos de suivi ─────────────────────────────────────
function _buildPhotos(d) {
    const section = document.getElementById('t-photos');
    const row     = document.getElementById('t-photos-row');

    const allPhotos = [
        ...(d.photos_chargement   || d.photosChargement || []),
        ...(d.photos_dechargement || []),
        ...(d.photos_livraison    || []),
        ...(d.photos_livre        || []),
    ];

    if (!allPhotos.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    row.innerHTML = allPhotos.slice(0, 8).map(url =>
        `<img src="${url}" alt="Photo suivi" onclick="agrandirPhoto('${url}')">`
    ).join('');
}

// ─── Modal photo ─────────────────────────────────────────
function agrandirPhoto(url) {
    document.getElementById('photo-overlay-img').src = url;
    document.getElementById('photo-overlay').classList.add('open');
}
function fermerPhoto() {
    document.getElementById('photo-overlay').classList.remove('open');
}

// ─── Actions ─────────────────────────────────────────────
function partagerWhatsApp() {
    if (!currentTrackingData) return;
    const d    = currentTrackingData;
    const url  = window.location.href;
    const pB   = parseInt((d.prixEstime || '0').replace(/\D/g, '')) || 0;
    const pN   = pB + (d.fraisSupplementaires || 0) - (d.remise || 0);
    const reste = pN - (parseInt(d.montantPaye) || 0);
    const status = d.status || 'En transit';

    const msg =
        `🚚 *Suivi de Colis AMT Transit*\n\n` +
        `📦 Réf : *${d.reference}*\n` +
        `👤 Client : ${d.nom} ${d.prenom}\n` +
        `📋 Statut : *${status}*\n` +
        `💰 Reste : *${reste > 0 ? formatArgent(reste) + ' CFA' : '✅ Soldé'}*\n\n` +
        `🔗 Suivre votre colis : ${url}`;

    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function copierLien() {
    const url = window.location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.querySelector('.t-btn-copy');
            if (btn) { btn.innerHTML = '✅ Copié !'; setTimeout(() => btn.innerHTML = '<i class="fas fa-link"></i> Copier le lien', 2000); }
        });
    } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}

function toggleQR() {
    const section = document.getElementById('t-qr-section');
    const isVisible = section.style.display !== 'none';

    if (isVisible) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    if (!qrGenerated) {
        document.getElementById('t-qr-canvas').innerHTML = '';
        new QRCode(document.getElementById('t-qr-canvas'), {
            text: window.location.href,
            width: 180,
            height: 180,
            colorDark: '#1C3A5E',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M,
        });
        qrGenerated = true;
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
