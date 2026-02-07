// c:\Users\JEANAFFA\OneDrive\Documents\GitHub\Chine-AMT\pdf-utils.js

// =======================================================
// EXPORT PDF & EXCEL
// =======================================================
function chargerLogo() { return new Promise(r => { const i = new Image(); i.src = '/logo_amt.png'; i.onload = () => r(i); i.onerror = () => r(null); }); }

async function genererEtiquette() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', [100, 60]); 
    const logo = await chargerLogo();
    doc.setDrawColor(255, 165, 0); doc.setLineWidth(1.5); doc.rect(2, 2, 96, 56); doc.setLineWidth(0.5); doc.rect(4, 4, 92, 52);
    if (logo) doc.addImage(logo, 'PNG', 6, 6, 12, 12);
    doc.setTextColor(255, 140, 0); doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("amt TRANSIT CARGO", 22, 10);
    doc.setTextColor(0); doc.setFontSize(8); doc.text("+225 89 84 46 57", 22, 15); doc.setFontSize(24); doc.text("N", 88, 12);
    doc.setDrawColor(0); doc.setLineWidth(0.1);
    let y = 22; const x = 6; const lineW = 88;
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text("EXPEDITEUR", x, y); y += 3;
    doc.setFont("helvetica", "normal"); doc.text(`NOM ET PRENOM: ${currentEnvoi.expediteur || 'AMT TRANSIT CARGO'}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    doc.text(`NUMERO: ${currentEnvoi.telExpediteur || '+225 0703165050'}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 6;
    doc.setFont("helvetica", "bold"); doc.text("DESTINATAIRE", x, y); y += 3;
    doc.setFont("helvetica", "normal"); doc.text(`NOM ET PRENOM: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    doc.text(`NUMERO: ${currentEnvoi.tel}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    let pv = (currentEnvoi.type || "").startsWith('aerien') ? `${currentEnvoi.poidsEnvoye} Kg` : `${currentEnvoi.volumeEnvoye} CBM`;
    doc.text(`KILOS: ${pv}  |  COLIS: ${currentEnvoi.quantiteEnvoyee}`, x, y); doc.line(x, y + 1, x + lineW, y + 1); y += 5;
    doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("+8619515284352      +2250703165050", 50, 56, { align: 'center' });
    doc.save(`Etiquette_${currentEnvoi.nom}.pdf`);
}

async function genererFacture() {
    if (!currentEnvoi) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'PNG', 10, 10, 30, 30);
    doc.setFontSize(18); doc.setTextColor(21, 96, 158); doc.setFont("helvetica", "bold"); doc.text("AMT TRANSIT CARGO", 50, 20);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Agence: Abidjan - Chine", 50, 26); doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 50, 32);
    doc.line(10, 42, 200, 42);
    let y = 50; const gap = 7;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("INFORMATIONS CLIENT", 10, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.text(`Nom: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y); y += 5; doc.text(`Tél: ${currentEnvoi.tel}`, 10, y); y += 5; doc.text(`Réf: ${currentEnvoi.reference}`, 10, y); y += 10;
    const headers1 = [["SERVICES", "DESCRIPTION", "QUANTITE", "PRIX UNITAIRE", "PRIX TOTAL"]];
    let pBrut = parseInt((currentEnvoi.prixEstime || "0").replace(/\D/g, '')) || 0;
    let remise = currentEnvoi.remise || 0;
    let frais = currentEnvoi.fraisSupplementaires || 0;
    let pNet = pBrut + frais - remise;
    let vol = (currentEnvoi.type || "").startsWith('aerien') ? currentEnvoi.poidsEnvoye : currentEnvoi.volumeEnvoye;
    let pu = vol > 0 ? (pBrut / vol).toFixed(0) : 0;
    const data1 = [[(currentEnvoi.type || "").toUpperCase(), currentEnvoi.description || '-', `${currentEnvoi.quantiteEnvoyee} Colis / ${vol}`, formatArgent(pu), formatArgent(pBrut)]];
    doc.autoTable({ startY: y, head: headers1, body: data1, theme: 'grid', headStyles: { fillColor: [21, 96, 158] }, styles: { valign: 'middle' } });
    y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("HISTORIQUE DES PAIEMENTS", 10, y); y += 6;
    const headers2 = [["DATE", "PRIX TOTAL", "MNT. PAYE", "RESTANT", "AGENT"]];
    let histRows = []; let cumul = 0;
    if (currentEnvoi.historiquePaiements && currentEnvoi.historiquePaiements.length > 0) {
        let sorted = currentEnvoi.historiquePaiements.sort((a, b) => a.date.seconds - b.date.seconds);
        sorted.forEach(h => {
            let m = parseInt(h.montant) || 0; cumul += m; let resteALinstantT = pNet - cumul; let dateStr = new Date(h.date.seconds * 1000).toLocaleString('fr-FR'); let agent = h.agent || "-";
            histRows.push([dateStr, formatArgent(pNet), `${formatArgent(m)} (${h.moyen || '?'})`, formatArgent(resteALinstantT), agent]);
        });
    } else {
        let deja = parseInt(currentEnvoi.montantPaye) || 0;
        if (deja > 0) histRows.push(["-", formatArgent(pNet), formatArgent(deja), formatArgent(pNet - deja), "Ancien Système"]); else histRows.push(["-", formatArgent(pNet), "0", formatArgent(pNet), "-"]);
    }
    doc.autoTable({ startY: y, head: headers2, body: histRows, theme: 'striped', headStyles: { fillColor: [50, 50, 50] }, styles: { fontSize: 9 } });
    y = doc.lastAutoTable.finalY;
    let dejaPayeTotal = parseInt(currentEnvoi.montantPaye) || 0;
    let resteFinal = pNet - dejaPayeTotal;
    let summaryBody = [ ["SOUS-TOTAL", formatArgent(pBrut) + " CFA"] ];
    if (frais > 0) { summaryBody.push(["FRAIS SUPP.", `+${formatArgent(frais)} CFA`]); }
    if (remise > 0) { summaryBody.push(["REMISE", `-${formatArgent(remise)} CFA`]); }
    summaryBody.push(["NET À PAYER", formatArgent(pNet) + " CFA"]);
    summaryBody.push(["TOTAL PAYÉ", formatArgent(dejaPayeTotal) + " CFA"]);
    summaryBody.push(["RESTE DÛ", formatArgent(resteFinal) + " CFA"]);
    doc.autoTable({ startY: y + 2, body: summaryBody, theme: 'plain', styles: { fontSize: 10, fontStyle: 'bold', halign: 'right', cellPadding: 2 }, columnStyles: { 0: { halign: 'left', cellWidth: 40, fillColor: [240, 240, 240] } }, margin: { left: 130 } });
    y = doc.lastAutoTable.finalY + 20;
    doc.setTextColor(150); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Merci de votre confiance - AMT Transit Cargo", 105, y, { align: 'center' }); doc.text("RC: 929 865 103 | Siège: Abidjan", 105, y + 4, { align: 'center' });
    doc.save(`Facture_${currentEnvoi.nom}.pdf`);
}

async function genererBonLivraison() {
    if (!currentEnvoi) return;
    let lieu = prompt("Veuillez saisir le LIEU DE LIVRAISON :", "Agence Abidjan - Treichville");
    if (lieu === null) return; 

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const logo = await chargerLogo();
    if (logo) doc.addImage(logo, 'PNG', 10, 10, 25, 25);
    
    doc.setFontSize(22); doc.setTextColor(142, 68, 173); doc.setFont("helvetica", "bold"); doc.text("BON DE LIVRAISON", 130, 20);
    doc.setFontSize(10); doc.setTextColor(0); doc.setFont("helvetica", "normal");
    doc.text(`N° BL: BL-${currentEnvoi.reference}`, 130, 28);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 130, 33);
    doc.setFont("helvetica", "bold"); doc.text(`Lieu de livraison : ${lieu.toUpperCase()}`, 130, 40);
    doc.line(10, 45, 200, 45);

    let y = 55;
    doc.setFontSize(11); doc.text("DESTINATAIRE:", 10, y); doc.setFont("helvetica", "normal");
    y += 5; doc.text(`Nom: ${currentEnvoi.prenom} ${currentEnvoi.nom}`, 10, y);
    y += 5; doc.text(`Téléphone: ${currentEnvoi.tel}`, 10, y);
    y += 5; doc.text(`Réf Colis: ${currentEnvoi.reference}`, 10, y);

    y += 10;
    const headers = [["DESCRIPTION", "TYPE", "QUANTITÉ", "POIDS / VOL", "ETAT"]];
    let isAir = (currentEnvoi.type || "").startsWith('aerien');
    let poidVol = isAir ? `${currentEnvoi.poidsEnvoye} Kg` : `${currentEnvoi.volumeEnvoye} CBM`;
    const body = [[currentEnvoi.description, (currentEnvoi.type || "").toUpperCase(), currentEnvoi.quantiteEnvoyee, poidVol, currentEnvoi.status || "Non vérifié"]];

    doc.autoTable({ startY: y, head: headers, body: body, theme: 'grid', headStyles: { fillColor: [142, 68, 173] }, styles: { valign: 'middle', fontSize: 10 } });

    y = doc.lastAutoTable.finalY + 20;
    doc.setLineWidth(0.5); doc.rect(10, y, 90, 40); doc.rect(110, y, 90, 40); 
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("VISA / SIGNATURE LIVREUR", 15, y + 5); doc.text("VISA / SIGNATURE CLIENT", 115, y + 5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("Je confirme avoir reçu la marchandise en bon état.", 115, y + 35);
    doc.save(`BL_${currentEnvoi.nom}.pdf`);
}

function exporterExcel() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
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

async function exporterPDF() {
    if (clientsCharges.length === 0) { alert("Rien à exporter."); return; }
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

function exporterHistoriqueExcel() {
    if (historiqueCharges.length === 0) { alert("Rien à exporter."); return; }
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

function exporterHistoriquePDF() {
    if (historiqueCharges.length === 0) { alert("Rien à exporter."); return; }
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
