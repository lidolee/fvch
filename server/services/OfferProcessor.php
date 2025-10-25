<?php

namespace FVCH\Offer;

class OfferProcessor
{
    private TemplateService $templateService;
    private EmailService $emailService;
    private StorageService $storageService;
    private Config $config;
    private PdfGenerator $pdfGenerator;

    public function __construct(
        TemplateService $templateService,
        EmailService $emailService,
        StorageService $storageService,
        Config $config,
        PdfGenerator $pdfGenerator // PDF-Generator wird injiziert
    ) {
        $this->templateService = $templateService;
        $this->emailService = $emailService;
        $this->storageService = $storageService;
        $this->config = $config;
        $this->pdfGenerator = $pdfGenerator;
    }

    /**
     * Hauptprozess zur Verarbeitung des Angebots.
     * @throws \Exception Wirft eine Ausnahme, wenn das Speichern fehlschlägt.
     */
    public function process(OfferData $offerData): array
    {
        $reference = date('ymd-His');
        $token = bin2hex(random_bytes(16));
        $viewUrl = rtrim($this->config->get('APP_URL'), '/') . '/offerte/view.html?ref=' . $reference . '&token=' . $token;

        // 1. QR-Code-Daten abrufen (Robustes cURL)
        $qrCodeResult = $this->generateQrCodeData($viewUrl);

        // 2. E-Mail-Text (HTML) generieren
        $templateData = [
            'reference' => $reference,
            'view_url' => $viewUrl,
            'kontakt' => $offerData->kontakt,
            'produktion' => $offerData->produktion,
            'verteilgebiet' => $offerData->verteilgebiet,
            'kosten' => $offerData->kosten,
        ];
        $emailBodyHtml = $this->templateService->render($templateData);

        // 3. PDF-Daten generieren (nur wenn Bedingungen erfüllt sind)
        $pdfData = null; // Initialisieren als null
        $verteilungTyp = $offerData->verteilgebiet['verteilungTyp'] ?? null;
        $zielgruppe = $offerData->verteilgebiet['zielgruppe'] ?? null;

        if ($verteilungTyp === 'Nach PLZ' && $zielgruppe === 'Alle Haushalte') {
            try {
                $pdfData = $this->pdfGenerator->generateLogisticsPdf(
                    $offerData->verteilgebiet['selectedPlzEntries'] ?? [],
                    $offerData->kosten['distributionCostItems'] ?? []
                );
            } catch (\Exception $e) {
                // PDF-Generierung ist fehlgeschlagen, protokolliert, aber stoppt den Prozess nicht
                $this->logError("PDF_GENERATION_FAILED: " . $e->getMessage());
                $pdfData = null; // Sicherstellen, dass es null bleibt
            }
        }

        // 4. HTML für die Speicherung vorbereiten (Base64-QR-Code einbetten)
        $storageHtml = $this->replaceQrCodeForStorage($emailBodyHtml, $qrCodeResult);

        // 5. Angebot auf der Festplatte speichern (Kritischer Schritt)
        // Dies muss VOR dem E-Mail-Versand geschehen. Wenn dies fehlschlägt, ist der ganze Prozess gescheitert.
        $this->storageService->save($reference, $token, $storageHtml);

        // 6. E-Mail versenden (Nicht-kritischer Schritt)
        // *** KORREKTUR: E-Mail-Versand in eigenen try...catch-Block kapseln ***
        try {
            $this->emailService->send(
                $offerData->kontakt['email'],
                ($offerData->kontakt['firstName'] ?? '') . ' ' . ($offerData->kontakt['lastName'] ?? ''),
                'Ihre Anfrage ' . $reference . ' · Top Flyer verteilen',
                $emailBodyHtml, // Das Original-HTML mit <cid:qr_image>
                $qrCodeResult['data'] ?? null,   // Die reinen QR-Bilddaten für CID
                $qrCodeResult['mime'] ?? null,   // Der MIME-Typ für CID
                $pdfData // Die PDF-Daten als String (oder null)
            );
        } catch (\Exception $e) {
            // Wenn E-Mail fehlschlägt: Fehler protokollieren, aber den Prozess nicht abbrechen.
            // Der Benutzer erhält trotzdem seine Referenznummer.
            $this->logError("EMAIL_SEND_FAILED: " . $e->getMessage());
        }

        // 7. Erfolgsantwort an das Frontend zurückgeben (wird jetzt immer erreicht, wenn Speicherung OK war)
        return ['reference' => $reference, 'viewUrl' => $viewUrl];
    }

    /**
     * Ersetzt den CID-Platzhalter im HTML durch Base64-Daten für die Speicherung.
     */
    private function replaceQrCodeForStorage(string $html, array $qrCodeResult): string
    {
        if (empty($qrCodeResult['data']) || empty($qrCodeResult['mime'])) {
            // Wenn QR-Code-Abruf fehlschlägt, CID-Tag entfernen
            return str_replace('<img src="cid:qr_image"', '<p>[QR-Code konnte nicht generiert werden]</p><img src=""', $html);
        }

        $base64Src = 'data:' . $qrCodeResult['mime'] . ';base64,' . base64_encode($qrCodeResult['data']);
        return str_replace('<img src="cid:qr_image"', '<img src="' . $base64Src . '"', $html);
    }

    /**
     * Ruft den QR-Code serverseitig über cURL ab.
     * Gibt ein Array mit reinen Bilddaten und MIME-Typ zurück.
     */
    private function generateQrCodeData(string $url): array
    {
        $qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' . urlencode($url);

        if (!function_exists('curl_init')) {
            $this->logError("cURL ist nicht installiert oder aktiviert.");
            return ['data' => null, 'mime' => null];
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $qrApiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5); // 5 Sekunden Timeout
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true); // Sicherstellen, dass SSL verifiziert wird
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

        $result = curl_exec($ch);
        $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

        if (curl_errno($ch)) {
            $this->logError("cURL Error: " . curl_error($ch));
            curl_close($ch);
            return ['data' => null, 'mime' => null];
        }

        curl_close($ch);

        // Strenge Validierung
        if ($httpStatus === 200 && $contentType && str_starts_with($contentType, 'image/') && !empty($result)) {
            return ['data' => $result, 'mime' => $contentType];
        } else {
            $this->logError("QR code API invalid response. Status: {$httpStatus}, Type: '{$contentType}'");
            return ['data' => null, 'mime' => null];
        }
    }

    /**
     * Einfacher Datei-basierter Logger für Diagnosen.
     */
    private function logError(string $message): void
    {
        $logFile = __DIR__ . '/../api_errors.log';
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($logFile, "[{$timestamp}] OFFER_PROCESSOR_ERROR - {$message}\n", FILE_APPEND);
    }
}
