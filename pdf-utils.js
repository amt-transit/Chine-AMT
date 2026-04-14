// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\pdf-utils.js

// =======================================================
// EXPORT PDF & EXCEL
// =======================================================
// Fonction utilitaire pour charger le logo en tant qu'objet Image pour jsPDF
function chargerLogo() { return new Promise(r => { const i = new Image(); i.src = '/logo_amt.png'; i.onload = () => r(i); i.onerror = () => r(null); }); }

// Fonction utilitaire pour générer le QR Code en Base64
function genererQRCodeBase64(text) {
    return new Promise((resolve) => {
        const tempDiv = document.createElement("div");
        new QRCode(tempDiv, { text: text, width: 128, height: 128, correctLevel : QRCode.CorrectLevel.M });
        setTimeout(() => {
            const canvas = tempDiv.querySelector("canvas");
            if (canvas) resolve(canvas.toDataURL("image/png"));
            else {
                const img = tempDiv.querySelector("img");
                resolve(img ? img.src : null);
            }
        }, 50);
    });
}

// Génère une étiquette PDF au format 100x60mm pour l'impression thermique
async function genererEtiquette() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf;
    // Création du document PDF en mode paysage ('l'), unité mm, taille personnalisée
    const doc = new jsPDF('l', 'mm', [100, 60]); 
    const logo = await chargerLogo();
    
    const qte = parseInt(currentEnvoi.quantiteEnvoyee) || 1;
    
    for (let i = 1; i <= qte; i++) {
        if (i > 1) doc.addPage([100, 60], 'l');
        
        // Dessin du cadre orange
        doc.setDrawColor(255, 165, 0); doc.setLineWidth(1.5); doc.rect(2, 2, 96, 56); doc.setLineWidth(0.5); doc.rect(4, 4, 92, 52);
        // Ajout du logo si chargé
        if (logo) doc.addImage(logo, 'PNG', 6, 6, 12, 12);
        
        // --- NOUVEAU DESIGN ÉTIQUETTE ---
        
        // Bloc Numéro de Colis (Haut Droite)
        doc.setFillColor(255, 140, 0); // Orange AMT
        doc.rect(76, 4, 20, 10, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont("helvetica", "bold");
        doc.text(`${i} / ${qte}`, 86, 11, { align: 'center' });
        
        // En-tête de l'entreprise
        doc.setTextColor(26, 58, 95); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("amt TRANSIT CARGO", 20, 10);
        doc.setTextColor(0); doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.text("+225 0703165050  |  +86 19515284352", 20, 14);
        
        // Ligne séparatrice en-tête
        doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(6, 16.5, 94, 16.5);
        
        // Génération et Affichage du QR Code en grand à droite
        let qrBase64 = null;
        try {
            qrBase64 = await genererQRCodeBase64(`${currentEnvoi.reference}-${i}`);
        } catch(e) { console.error("Erreur QR Code:", e); }
        if (qrBase64) doc.addImage(qrBase64, 'PNG', 68, 19, 26, 26);
        
        // Destinataire (Milieu Gauche)
        let y = 21; const x = 6;
        doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("DESTINATAIRE :", x, y); y += 4;
        doc.setFontSize(11); doc.text(`${currentEnvoi.prenom} ${currentEnvoi.nom}`.toUpperCase(), x, y); y += 5;
        doc.setFontSize(10); doc.text(`Tél: ${currentEnvoi.tel}`, x, y); y += 5;
        
        // Expéditeur
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100); doc.text("EXPÉDITEUR :", x, y); y += 3;
        doc.setFont("helvetica", "normal"); doc.text(`${currentEnvoi.expediteur || 'AMT'} - ${currentEnvoi.telExpediteur || ''}`, x, y); y += 6;
        
        // Référence très visible (Bas Gauche)
        doc.setTextColor(0);
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("RÉFÉRENCE COLIS :", x, y); y += 5;
        doc.setFontSize(15); doc.setFont("helvetica", "bold"); doc.text(`${currentEnvoi.reference}-${i}`, x, y);
        
        // Ligne de séparation Footer
        doc.setDrawColor(200); doc.line(6, 51, 94, 51);
        
        // Footer (Poids/Volume / BL)
        let isAirLabel = (currentEnvoi.type || "").startsWith('aerien');
        let pv = isAirLabel ? `${currentEnvoi.poidsEnvoye || 0} Kg` : `${currentEnvoi.volumeEnvoye || 0} CBM`;
        doc.setFontSize(7); doc.setFont("helvetica", "bold");
        let footerText = `${isAirLabel ? 'POIDS TOTAL' : 'VOLUME TOTAL'} : ${pv}`;
        if(currentEnvoi.type === 'maritime' && currentEnvoi.numBL) {
            footerText += `   |   CONTENEUR : ${currentEnvoi.numBL}`;
        }
        doc.text(footerText, x, 54.5);
    }
    
    doc.save(`Etiquettes_${currentEnvoi.reference}.pdf`);
}

// Génère la facture PDF principale (A4)
async function genererFacture() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait, millimètres, A4
    
    // --- DÉFINITION DES COULEURS (Charte graphique) ---
    const blueColor = [26, 58, 95];     // Bleu foncé AMT (#1a3a5f)
    const yellowColor = [241, 196, 15]; // Jaune AMT (#f1c40f)
    const darkColor = [51, 51, 51];     // Gris très foncé pour le texte (#333)
    const grayColor = [119, 119, 119];  // Gris moyen pour les infos secondaires (#777)

    const logo = await chargerLogo();
    
    // --- BANDEAU SUPÉRIEUR ---
    // Ligne jaune décorative tout en haut
    doc.setDrawColor(...yellowColor);
    doc.setLineWidth(2);
    doc.line(0, 1, 210, 1); 

    // --- EN-TÊTE (HEADER) ---
    let y = 20;
    
    // Affichage du logo
    if (logo) doc.addImage(logo, 'PNG', 15, 10, 25, 25);
    
    // Informations de l'entreprise (Gauche)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...blueColor);
    doc.text("amt", 45, 20); // Partie 'amt' en bleu
    const wAmt = doc.getTextWidth("amt");
    doc.setTextColor(...yellowColor);
    doc.text("transit", 45 + wAmt + 2, 20); // Partie 'transit' en jaune

    // Coordonnées de l'entreprise
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...darkColor);
    doc.text("AMT TRANSIT CARGO", 45, 26);
    doc.text("Siège: Abidjan - Chine", 45, 31);
    doc.text("Tél: +225 07 03 16 50 50", 45, 36);
    doc.text("Tèl: +86 195 1528 4352", 45, 41);
    doc.text("Email: info@amt-transit.com", 45, 46);

    // Informations de la facture (Droite)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16); 
    doc.setTextColor(...blueColor);
    doc.text("FACTURE", 195, 20, { align: "right" }); // Titre aligné à droite
    
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.text(`N°: ${currentEnvoi.reference || '-'}`, 195, 30, { align: "right" });
    doc.text(`DATE: ${new Date().toLocaleDateString('fr-FR')}`, 195, 35, { align: "right" });

    // Ligne de séparation grise sous l'en-tête
    y = 50;
    doc.setDrawColor(238, 238, 238); // Gris très clair (#eee)
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);

    // --- SECTION DÉTAILS (CLIENT & LOGISTIQUE) ---
    y += 10;
    const col1X = 15;

    // Titres des colonnes
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkColor);
    
    doc.text("CLIENT", col1X, y);
    doc.text("LOGISTIQUE", 195, y, { align: "right" });
    
    // Ligne de soulignement jaune pour les titres
    doc.setDrawColor(...yellowColor);
    doc.setLineWidth(0.5);
    doc.line(col1X, y + 2, 195, y + 2);

    y += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    // Données Client (Gauche)
    doc.text(`NOM: ${(currentEnvoi.prenom + ' ' + currentEnvoi.nom).toUpperCase()}`, col1X, y);
    doc.text(`TÉL: ${currentEnvoi.tel}`, col1X, y + 6);
    doc.text(`REF: ${currentEnvoi.reference}`, col1X, y + 12);

    // Données Logistique (Droite)
    doc.text(`EXPÉDITEUR: ${currentEnvoi.expediteur || 'AMT'}`, 195, y, { align: "right" });
    doc.text(`TÉL EXP.: ${currentEnvoi.telExpediteur || '-'}`, 195, y + 6, { align: "right" });
    doc.text(`DATE ENREG.: ${new Date(currentEnvoi.date).toLocaleDateString('fr-FR')}`, 195, y + 12, { align: "right" });
    
    if(currentEnvoi.numBL) {
        doc.setTextColor(255, 0, 0); // Couleur Rouge
        doc.setFont("helvetica", "bold"); // Texte en gras
        doc.text(`CONTENEUR / BL: ${currentEnvoi.numBL}`, 195, y + 18, { align: "right" });
        doc.setTextColor(...darkColor); // On remet le texte normal pour la suite
        doc.setFont("helvetica", "normal");
    }

    // --- TABLEAU DES SERVICES ---
    y += 30;
    
    // Calculs financiers
    let pBrut = parseInt((currentEnvoi.prixEstime || "0").replace(/\D/g, '')) || 0;
    let remise = currentEnvoi.remise || 0;
    let frais = currentEnvoi.fraisSupplementaires || 0;
    let pNet = pBrut + frais - remise;
    
    // Détermination type (Air/Mer) et unités
    let isAir = (currentEnvoi.type || "").startsWith('aerien');
    let vol = isAir ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye;
    let unit = isAir ? 'Kg' : 'CBM';
    let pu = vol > 0 ? (pBrut / vol) : 0;

    // Préparation des données pour autoTable
    const headers = [["SERVICES", "DESCRIPTION", "QTÉ", "POIDS / VOL", "PRIX UNITAIRE", "TOTAL"]];
    const body = [[
        `Fret ${(currentEnvoi.type || "").toUpperCase()}`,
        currentEnvoi.description || 'Marchandise diverse',
        currentEnvoi.quantiteEnvoyee,
        `${vol || 0} ${unit}`,
        formatArgent(pu),
        formatArgent(pBrut)
    ]];

    // Génération du tableau
    doc.autoTable({
        startY: y,
        head: headers,
        body: body,
        theme: 'plain', // Thème minimaliste
        headStyles: { 
            fillColor: blueColor, 
            textColor: 255, 
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 2,
            fontSize: 7
        },
        bodyStyles: {
            textColor: darkColor,
            cellPadding: 5,
            valign: 'middle',
            fontSize: 7
        },
        columnStyles: {
            0: { cellWidth: 35 },
            4: { halign: 'right' },
            5: { halign: 'right' }
        },
        didParseCell: function(data) {
            // Ajout d'une bordure fine en bas des cellules du corps
            if (data.section === 'body') {
                data.cell.styles.borderBottomWidth = 0.1;
                data.cell.styles.borderBottomColor = [221, 221, 221];
            }
        }
    });

    // Mise à jour de la position Y après le tableau
    y = doc.lastAutoTable.finalY + 10;

    // --- TOTAUX (Aligné à droite) ---
    const startXStats = 130;
    
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    
    // Total HT
    doc.text("TOTAL HT", startXStats, y);
    doc.text(`${formatArgent(pBrut)} CFA`, 195, y, { align: "right" });
    y += 7;

    // Frais supplémentaires
    if (frais > 0) {
        doc.text("Frais Suppl.", startXStats, y);
        doc.text(`${formatArgent(frais)} CFA`, 195, y, { align: "right" });
        y += 7;
    }
    // Remise
    if (remise > 0) {
        doc.text("Remise", startXStats, y);
        doc.text(`- ${formatArgent(remise)} CFA`, 195, y, { align: "right" });
        y += 7;
    }

    // Ligne de séparation avant le TTC
    doc.setDrawColor(221, 221, 221);
    doc.line(startXStats, y-2, 195, y-2);

    // Total TTC
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...blueColor);
    doc.text("TOTAL TTC", startXStats, y + 2);
    doc.text(`${formatArgent(pNet)} CFA`, 195, y + 2, { align: "right" });

    y += 15;

    // --- ENCADRÉ STATUT PAIEMENT ---
    let dejaPayeTotal = parseInt(currentEnvoi.montantPaye) || 0;
    let resteFinal = pNet - dejaPayeTotal;

    // Fond gris clair
    doc.setFillColor(249, 249, 249); 
    doc.rect(15, y, 180, 20, 'F');
    
    // Barre verticale bleue à gauche
    doc.setDrawColor(...blueColor);
    doc.setLineWidth(1.5);
    doc.line(15, y, 15, y + 20);

    // Titre de l'encadré
    doc.setFontSize(9);
    doc.setTextColor(...darkColor);
    doc.setFont("helvetica", "bold");
    doc.text("Statut Paiement:", 20, y + 8);
    
    // Montant payé
    doc.setFont("helvetica", "normal");
    doc.text(`${formatArgent(dejaPayeTotal)} CFA Payé`, 55, y + 8);
    doc.text("|", 100, y + 8);
    
    // Reste à payer (Aligné à droite)
    doc.setFont("helvetica", "bold");
    doc.text(`Restant: ${formatArgent(resteFinal)} CFA`, 190, y + 8, { align: "right" });

    // Info dernier agent
    let agent = "Bureau";
    if(currentEnvoi.historiquePaiements && currentEnvoi.historiquePaiements.length > 0) {
        agent = currentEnvoi.historiquePaiements[currentEnvoi.historiquePaiements.length-1].agent || "Bureau";
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...grayColor);
    doc.text(`Dernier Agent: ${agent}`, 20, y + 16);

    y += 35;

    // --- CONDITIONS DE VENTE (Bas de page) ---
    // Ligne pointillée de séparation
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.5);
    doc.setLineDash([2, 2], 0);
    doc.line(15, y, 195, y);
    doc.setLineDash([]); // Retour ligne continue

    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkColor);
    doc.text("CONDITIONS DE VENTE", 105, y, { align: "center" });
    // Soulignement du titre
    doc.setDrawColor(...darkColor);
    doc.line(85, y+1, 125, y+1);

    y += 6;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const terms = "Les délais de transport sont fournis à titre purement indicatif par AMT Transit. Les retards de navires ou de dédouanement ne sauraient engager la responsabilité de l'entreprise. Le stockage est gracieux durant 7 jours calendaires après l'arrivée. Passé ce délai, des frais de magasinage s'appliquent. Toute marchandise non retirée après un délai de 30 jours (1 mois) sera considérée comme abandonnée et pourra être mise au rebut. L'indemnisation en cas de dommages est strictement limitée au montant des frais de transport, sauf en cas de souscription à une assurance spécifique préalable. Le règlement intégral est exigé avant tout retrait de marchandise. Toute contestation doit impérativement être signalée dès réception de la facture, faute de quoi les conditions sont considérées comme acceptées sans réserve.";
    // Affichage du texte justifié (splitTextToSize gère le retour à la ligne)
    doc.text(doc.splitTextToSize(terms, 180), 15, y);

    // --- PIED DE PAGE (FOOTER) ---
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("AMT TRANSIT CARGO - Siège Social: Abidjan, Côte d'Ivoire - RC: 929 865 103", 105, pageHeight - 10, { align: "center" });

    doc.save(`Facture_${currentEnvoi.nom}.pdf`);
}

// Génère un Bon de Livraison (BL)
async function genererBonLivraison() {
    if (!currentEnvoi) return;
    let lieu = prompt("Veuillez saisir le LIEU DE LIVRAISON :", "Koumassi Zone Industreille - Cocody");
    if (lieu === null) return; 

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'PNG', 10, 10, 25, 25);
    
    // Titre BL
    doc.setFontSize(22); doc.setTextColor(142, 68, 173); doc.setFont("helvetica", "bold"); doc.text("BON DE LIVRAISON", 130, 20);
    
    // Infos BL
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "normal");
    doc.text(`N° BL: BL-${currentEnvoi.reference}`, 130, 28);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 130, 33);
    if(currentEnvoi.numBL) doc.text(`Conteneur: ${currentEnvoi.numBL}`, 130, 38);
    
    // Lieu de livraison
    doc.setFont("helvetica", "bold");
    const lieuSplit = doc.splitTextToSize(`Lieu de livraison : ${lieu.toUpperCase()}`, 70);
    doc.text(lieuSplit, 130, 40);
    let lineY = 45 + (lieuSplit.length - 1) * 5;
    doc.line(10, lineY, 200, lineY);

    // Infos Destinataire
    let y = lineY + 10;
    doc.setFontSize(11); doc.text("DESTINATAIRE:", 10, y); doc.setFont("helvetica", "normal");
    y += 5; doc.text(`Nom: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y);
    y += 5; doc.text(`Téléphone: ${currentEnvoi.tel}`, 10, y);
    y += 5; doc.text(`Réf Colis: ${currentEnvoi.reference}`, 10, y);

    // Tableau des colis
    y += 10;
    const headers = [["DESCRIPTION", "TYPE", "QUANTITÉ", "POIDS / VOL", "ETAT"]];
    let isAir = (currentEnvoi.type || "").startsWith('aerien');
    let poidVol = isAir ? `${currentEnvoi.poidsEnvoye || 0} Kg` : `${currentEnvoi.volumeEnvoye || 0} CBM`;
    const body = [[currentEnvoi.description, (currentEnvoi.type || "").toUpperCase(), currentEnvoi.quantiteEnvoyee, poidVol, currentEnvoi.status || "Non vérifié"]];

    doc.autoTable({ startY: y, head: headers, body: body, theme: 'grid', headStyles: { fillColor: [142, 68, 173] }, styles: { valign: 'middle', fontSize: 10 } });

    // Zone de signatures
    y = doc.lastAutoTable.finalY + 20;
    doc.setLineWidth(0.5); doc.rect(10, y, 90, 40); doc.rect(110, y, 90, 40); 
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("VISA / SIGNATURE LIVREUR", 15, y + 5); doc.text("VISA / SIGNATURE CLIENT", 115, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("Je confirme avoir reçu la marchandise en bon état.", 115, y + 35);
    doc.save(`BL_${currentEnvoi.nom}.pdf`);
}

// Exporte la liste des expéditions en CSV (Excel)
function exporterExcel() {
    if (clientsCharges.length === 0) { showCustomAlert("Rien à exporter.", "warning"); return; }
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Client,Téléphone,Desc,Type,Qté,Poids,Prix Restant,Statut\r\n";
    let tQ = 0, tV = 0, tP = 0;
    clientsCharges.forEach(c => {
        let isAir = (c.type||"").startsWith('aerien');
        let pv = isAir ? c.poidsEnvoye : c.volumeEnvoye;
        let pB = parseInt((c.prixEstime||"0").replace(/\D/g, '')) || 0;
        let pN = pB + (c.fraisSupplementaires||0) - (c.remise || 0);
        let dej = parseInt(c.montantPaye)||0;
        let rest = pN - dej;
        tQ += parseInt(c.quantiteEnvoyee)||0; tV += parseFloat(pv)||0; tP += rest;
        csvContent += `"${c.reference}","${c.date}","${c.nom}","${c.tel || ''}","${c.description}","${c.type}",${c.quantiteEnvoyee},"${pv}","${rest}","${c.status}"\r\n`;
    });
    csvContent += `,,,,,,,"TOTAL:",${tQ},"${tV}","${tP}",""\r\n`;
    var link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "expeditions.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// Exporte la liste des expéditions en PDF
async function exporterPDF() {
    if (clientsCharges.length === 0) { showCustomAlert("Rien à exporter.", "warning"); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', 'a4');
    
    const logo = await chargerLogo();
    if (logo) { doc.addImage(logo, 'PNG', 14, 10, 20, 20); }
    doc.setFontSize(18); doc.setTextColor(21, 96, 158); doc.text("LISTE DES EXPEDITIONS", 40, 22);

    const headers = [["Ref", "Client", "Tél", "Desc.", "Type", "Qté", "Kg/CBM", "Reste"]];
    let tQ = 0, tV = 0, tP = 0;
    const body = clientsCharges.map(c => {
        let isAir = (c.type||"").startsWith('aerien');
        let pv = isAir ? c.poidsEnvoye : c.volumeEnvoye;
        let pB = parseInt((c.prixEstime||"0").replace(/\D/g, '')) || 0;
        let pN = pB + (c.fraisSupplementaires||0) - (c.remise || 0);
        let dej = parseInt(c.montantPaye)||0;
        let rest = pN - dej;
        tQ += parseInt(c.quantiteEnvoyee)||0; tV += parseFloat(pv)||0; tP += rest;
        return [c.reference, c.nom, c.tel || '', c.description, c.type, c.quantiteEnvoyee, pv, formatArgent(rest)];
    });
    doc.autoTable({ startY: 35, head: headers, body: body, styles: { fontSize: 8 }, foot: [["TOTAL GÉNÉRAL", "", "", "", "", tQ, tV.toFixed(2), formatArgent(tP) + " CFA"]], footStyles: { fillColor: [50, 50, 50], textColor: [0, 255, 255], fontStyle: 'bold' } }); 
    doc.save('expeditions.pdf');
}

// Exporte l'historique en CSV
function exporterHistoriqueExcel() {
    if (historiqueCharges.length === 0) { showCustomAlert("Rien à exporter.", "warning"); return; }
    let csvContent = "data:text/csv;charset=utf-8,Ref,Date,Destinataire,Telephone,Description,Type,Qte,Poids/Vol,Prix Final,Statut\r\n";
    let tQ = 0, tV = 0, tP = 0;
    historiqueCharges.forEach(d => {
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? d.poidsEnvoye : d.volumeEnvoye;
        let st = d.status || 'En attente';
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g, '')) || 0;
        let final = pB + (d.fraisSupplementaires||0) - (d.remise || 0);
        tQ += parseInt(d.quantiteEnvoyee)||0; tV += parseFloat(pv)||0; tP += final;
        csvContent += `"${d.reference}","${d.date}","${d.nom} ${d.prenom}","${d.tel}","${d.description}","${d.type}",${d.quantiteEnvoyee},"${pv}","${final}","${st}"\r\n`;
    });
    csvContent += `,,,,,,,"TOTAL:",${tQ},"${tV}","${tP}",""\r\n`;
    var link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "Historique_Envois.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// Exporte l'historique en PDF
function exporterHistoriquePDF() {
    if (historiqueCharges.length === 0) { showCustomAlert("Rien à exporter.", "warning"); return; }
    const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', 'a4');
    const headers = [["Ref", "Date", "Destinataire", "Tél", "Desc", "Type", "Qté", "Poids/Vol", "Prix Final", "Statut"]];
    let tQ = 0, tV = 0, tP = 0;
    const body = historiqueCharges.map(d => {
        let isAir = (d.type||"").startsWith('aerien');
        let pv = isAir ? d.poidsEnvoye : d.volumeEnvoye;
        let pB = parseInt((d.prixEstime||"0").replace(/\D/g, '')) || 0;
        let final = pB + (d.fraisSupplementaires||0) - (d.remise || 0);
        tQ += parseInt(d.quantiteEnvoyee)||0; tV += parseFloat(pv)||0; tP += final;
        return [d.reference, d.date, `${d.nom} ${d.prenom}`, d.tel, d.description, d.type, d.quantiteEnvoyee, pv, formatArgent(final), d.status || 'En attente'];
    });
    doc.text(`Historique Envois - ${currentHistoriqueType.toUpperCase()}`, 14, 10);
    doc.autoTable({ head: headers, body: body, styles: { fontSize: 7 }, margin: { top: 15 }, foot: [["TOTAL GÉNÉRAL", "", "", "", "", "", tQ, tV.toFixed(2), formatArgent(tP) + " CFA", ""]], footStyles: { fillColor: [50, 50, 50], textColor: [0, 255, 255], fontStyle: 'bold' } });
    doc.save('Historique_Envois.pdf');
}
