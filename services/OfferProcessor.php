<?php
namespace FVCH\Offer;

// Annahme: Diese Klassen sind per Autoloader oder require an anderer Stelle verfügbar.
// require_once 'TemplateService.php';
// require_once 'EmailService.php';
// require_once 'StorageService.php';
// require_once 'Config.php';
// require_once 'OfferData.php';


class OfferProcessor
{
    public function __construct(
        private TemplateService $templateService,
        private EmailService $emailService,
        private StorageService $storageService,
        private Config $config
    ) {}

    public function process(OfferData $offerData): array
    {
        try {
            $reference = date('ymd-His');
            $token = bin2hex(random_bytes(16));
            $viewUrl = rtrim($this->config->get('APP_URL'), '/') . '/offerte/view.php?ref=' . $reference . '&token=' . $token;

            // 1. QR-Code-Daten abrufen
            $qrCode = $this->generateQrCodeData($viewUrl);

            $templateData = [
                'reference' => $reference,
                'view_url' => $viewUrl,
                'kontakt' => $offerData->kontakt,
                'produktion' => $offerData->produktion,
                'verteilgebiet' => $offerData->verteilgebiet,
                'kosten' => $offerData->kosten,
            ];

            // 2. E-Mail-HTML rendern (enthält 'cid:qr_image')
            $emailBody = $this->templateService->render($templateData);

            // 3. E-Mail senden (mit CID-Anhang)
            // Dies funktioniert wie bisher.
            $this->emailService->send(
                $offerData->kontakt['email'],
                ($offerData->kontakt['firstName'] ?? '') . ' ' . ($offerData->kontakt['lastName'] ?? ''),
                'Ihre Anfrage ' . $reference . ' · Top Flyer verteilen',
                $emailBody,
                $qrCode['data'] ?? null,  // Reine Bilddaten
                $qrCode['mime'] ?? null,  // MIME-Typ (z.B. 'image/png')
                'qr_image' // Die CID, auf die sich das Template bezieht
            );

            // *** KORREKTUR: HTML für die Speicherung vorbereiten ***

            $htmlBodyToSave = $emailBody;

            // Prüfen, ob QR-Daten erfolgreich abgerufen wurden
            if ($qrCode && !empty($qrCode['data']) && !empty($qrCode['mime'])) {
                // 4. Base64-String für das QR-Bild erstellen
                $base64QrCodeSrc = 'data:' . $qrCode['mime'] . ';base64,' . base64_encode($qrCode['data']);

                // 5. Den 'cid:'-Link im HTML durch den Base64-String ersetzen
                // Dies stellt sicher, dass die gespeicherte HTML-Datei autark ist
                $htmlBodyToSave = str_replace(
                    'src="cid:qr_image"',
                    'src="' . $base64QrCodeSrc . '"',
                    $emailBody
                );
            }
            // *** ENDE KORREKTUR ***


            // 6. Modifiziertes HTML in der Datei speichern
            $this->storageService->save($reference, $token, $htmlBodyToSave);


            return ['reference' => $reference, 'viewUrl' => $viewUrl, 'success' => true];

        } catch (\Exception $e) {
            // Fehler loggen
            $this->logError('Kritischer Fehler in process(): ' . $e->getMessage());
            // Saubere Fehlerantwort an das Frontend
            return [
                'success' => false,
                'message' => 'Ein interner Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
            ];
        }
    }

    /**
     * Ruft die reinen QR-Code-Bilddaten und den MIME-Typ von der API ab.
     * Gibt ein Array ['data' => ..., 'mime' => ...] oder null bei Fehler zurück.
     */
    private function generateQrCodeData(string $url): ?array
    {
        $qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' . urlencode($url);

        if (!function_exists('curl_init')) {
            $this->logError("cURL extension is not installed or enabled on this server. Cannot fetch QR code.");
            return null;
        }

        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $qrApiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_TIMEOUT, 4);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);

        $result = curl_exec($ch);

        $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $error = curl_error($ch);

        curl_close($ch);

        if ($result === false) {
            $this->logError("cURL failed to fetch QR code. Error: " . $error);
            return null;
        }

        if ($httpStatus !== 200 || !$contentType || !str_starts_with($contentType, 'image/')) {
            $this->logError("QR code API responded with an invalid status or content. HTTP Status: {$httpStatus}, Content-Type: '{$contentType}'. Expected an image.");
            return null;
        }

        if (empty($result)) {
            $this->logError("QR code API returned 200 OK and image content-type, but the response body was empty.");
            return null;
        }

        $mimeType = $contentType;
        if (strpos($mimeType, ';') !== false) {
            $mimeType = strstr($mimeType, ';', true);
        }

        // ERFOLG: Reine Bilddaten und MIME-Typ zurückgeben
        return ['data' => $result, 'mime' => $mimeType];
    }

    /**
     * Simple file-based logger for diagnostics.
     */
    private function logError(string $message): void
    {
        $logFile = dirname(__FILE__) . '/../api_errors.log';
        $timestamp = date('Y-m_d H:i:s');
        file_put_contents($logFile, "[{$timestamp}] QR_CODE_ERROR - {$message}\n", FILE_APPEND);
    }
}
