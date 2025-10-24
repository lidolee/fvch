<?php

namespace FVCH\Offer;

// Importiert die FPDF-Klasse aus dem globalen Namespace (via Composer 'vendor/autoload.php')
use FPDF;

/**
 * PdfGenerator Service
 * Erstellt das Logistik-PDF-Dokument.
 * Diese Klasse ist ein Wrapper um die FPDF-Bibliothek.
 */
class PdfGenerator
{
    /**
     * Erstellt das PDF "Verteilerliste Logistik".
     *
     * @param array $selectedPlzEntries Daten aus $verteilgebiet['selectedPlzEntries']
     * @param array $costItems Daten aus $kosten['distributionCostItems']
     * @return string Die rohen PDF-Daten als String.
     * @throws \Exception Wenn die PDF-Erstellung fehlschlägt.
     */
    public function generateLogisticsPdf(array $selectedPlzEntries, array $costItems): string
    {
        // 1. Preis-Lookup-Tabelle erstellen
        // (Da die Preise in einem separaten Array sind, mappen wir sie für einfachen Zugriff)
        $priceMap = [];
        foreach ($costItems as $item) {
            $priceMap[$item['plz']] = $item['price'] ?? 0.0;
        }

        // 2. PDF-Objekt initialisieren (Querformat, mm, A4)
        $pdf = new FPDF('L', 'mm', 'A4');
        $pdf->AddPage();
        $pdf->SetAutoPageBreak(true, 15);
        $pdf->SetMargins(10, 10, 10);

        // 3. Titel
        $pdf->SetFont('Arial', 'B', 16);
        $pdf->Cell(0, 10, 'Verteilerliste Logistik', 0, 1, 'C');
        $pdf->Ln(5);

        // 4. Tabellen-Header
        $pdf->SetFont('Arial', 'B', 8); // Kleinere Schrift für die Tabelle
        $pdf->SetFillColor(230, 230, 230); // Heller Grauton für Header

        // Spaltenbreiten (Gesamtbreite 277mm im Querformat A4)
        $pdf->Cell(40, 7, 'PLZ Ort', 1, 0, 'L', true);
        $pdf->Cell(40, 7, 'Alle Haeuser (Anzahl)', 1, 0, 'R', true);
        $pdf->Cell(40, 7, 'Preis Alle (CHF)', 1, 0, 'R', true);
        $pdf->Cell(39, 7, 'MFH (Anzahl)', 1, 0, 'R', true);
        $pdf->Cell(39, 7, 'EFH (Anzahl)', 1, 0, 'R', true);
        $pdf->Cell(79, 7, 'Interne Notizen', 1, 1, 'L', true); // Zusätzliche Spalte

        // 5. Tabellen-Daten
        $pdf->SetFont('Arial', '', 8);
        $totalFlyers = 0;
        $totalPrice = 0;

        foreach ($selectedPlzEntries as $plz) {
            $plzCode = $plz['plz4'] ?? 'N/A';
            $plzOrt = htmlspecialchars_decode($plzCode . ' ' . ($plz['ort'] ?? 'N/A')); // Umlaute korrekt darstellen

            $anzahlAlle = $plz['all'] ?? 0;
            $anzahlMfh = $plz['mfh'] ?? 0;
            $anzahlEfh = $plz['efh'] ?? 0;

            // Preis aus der Map holen
            $preis = $priceMap[$plzCode] ?? 0.0;

            $totalFlyers += $anzahlAlle;
            $totalPrice += $preis;

            $pdf->Cell(40, 6, $plzOrt, 1, 0, 'L');
            $pdf->Cell(40, 6, number_format($anzahlAlle, 0, '.', "'"), 1, 0, 'R');
            $pdf->Cell(40, 6, number_format($preis, 2, '.', "'"), 1, 0, 'R');
            $pdf->Cell(39, 6, number_format($anzahlMfh, 0, '.', "'"), 1, 0, 'R');
            $pdf->Cell(39, 6, number_format($anzahlEfh, 0, '.', "'"), 1, 0, 'R');
            $pdf->Cell(79, 6, '', 1, 1, 'L'); // Leere Notiz-Spalte
        }

        // 6. Gesamt-Summe
        $pdf->SetFont('Arial', 'B', 9);
        $pdf->Cell(40, 7, 'TOTAL', 1, 0, 'L', true);
        $pdf->Cell(40, 7, number_format($totalFlyers, 0, '.', "'"), 1, 0, 'R', true);
        $pdf->Cell(40, 7, number_format($totalPrice, 2, '.', "'"), 1, 0, 'R', true);
        $pdf->Cell(39, 7, '', 1, 0, 'R', true); // Leer
        $pdf->Cell(39, 7, '', 1, 0, 'R', true); // Leer
        $pdf->Cell(79, 7, '', 1, 1, 'L', true); // Leer

        // 7. PDF als String zurückgeben
        return $pdf->Output('S');
    }
}
