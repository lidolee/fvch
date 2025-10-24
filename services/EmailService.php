<?php
namespace FVCH\Offer;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

class EmailService
{
    private Config $config;

    public function __construct(Config $config)
    {
        $this->config = $config;
    }

    /**
     * Sendet die E-Mail.
     *
     * @param string $recipientEmail E-Mail des Empfängers
     * @param string $recipientName Name des Empfängers
     * @param string $subject Betreff
     * @param string $body HTML-Body
     * @param string|null $qrCodeData Rohe Bilddaten des QR-Codes für CID-Einbettung
     * @param string|null $qrCodeMimeType Mime-Typ des QR-Codes (z.B. 'image/png')
     * @param string|null $pdfData Base64-kodierte PDF-Daten für den Anhang
     */
    public function send(
        string $recipientEmail,
        string $recipientName,
        string $subject,
        string $body,
        ?string $qrCodeData = null,
        ?string $qrCodeMimeType = null,
        ?string $pdfData = null // PDF-Daten als neuer optionaler Parameter
    ): void
    {
        $mail = new PHPMailer(true);
        $mail->CharSet = 'UTF-8';

        try {
            // Server-Einstellungen
            $mail->isSMTP();
            $mail->Host = $this->config->get('SMTP_HOST');
            $mail->SMTPAuth = $this->config->get('SMTP_AUTH') === 'true';
            $mail->Username = $this->config->get('SMTP_USERNAME');
            $mail->Password = $this->config->get('SMTP_PASSWORD');
            $mail->SMTPSecure = $this->config->get('SMTP_ENCRYPTION');
            $mail->Port = (int)$this->config->get('SMTP_PORT');

            // Empfänger
            $mail->setFrom($this->config->get('MAIL_FROM'), $this->config->get('MAIL_FROM_NAME'));
            $mail->addAddress($recipientEmail, $recipientName);

            // BCC an interne Adresse
            $internalEmail = $this->config->get('INTERNAL_EMAIL');
            if (!empty($internalEmail)) {
                $mail->addBCC($internalEmail);
            }

            $mail->addReplyTo($this->config->get('MAIL_FROM'), $this->config->get('MAIL_FROM_NAME'));

            // *** ANHANG 1: QR-Code als CID-Einbettung (für Outlook-Kompatibilität) ***
            if ($qrCodeData !== null && $qrCodeMimeType !== null) {
                // Fügt die rohen Bilddaten als eingebettetes Bild hinzu
                // Der 'cid' (qr_image) muss mit dem 'src' im email.template.php übereinstimmen
                $mail->addStringEmbeddedImage(
                    $qrCodeData,
                    'qr_image', // Dies ist die Content-ID (CID)
                    'qr_code.png', // Dateiname (optional)
                    'base64', // PHPMailer verarbeitet die rohen Daten, aber 'base64' ist oft stabiler, falls wir uns entscheiden, es zu kodieren
                    $qrCodeMimeType
                );
            }

            // *** ANHANG 2: Logistik-PDF (falls vorhanden) ***
            if ($pdfData !== null) {
                // Fügt die Base64-kodierten PDF-Daten als Anhang hinzu
                $mail->addStringAttachment(
                    base64_decode($pdfData), // PHPMailer erwartet rohe Daten, daher dekodieren wir das Base64
                    'Verteilerliste Logistik.pdf',
                    'base64', // Art der Kodierung des vorherigen Arguments (nicht relevant, da wir rohe Daten senden)
                    'application/pdf'
                );
            }

            // Inhalt
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $body;
            // $mail->AltBody = 'Dies ist eine HTML-E-Mail. Bitte verwenden Sie einen kompatiblen E-Mail-Client.';

            $mail->send();

        } catch (Exception $e) {
            // Loggt den Fehler, anstatt das Skript abstürzen zu lassen
            $this->logError("PHPMailer Fehler: {$mail->ErrorInfo}");
            // Wir werfen den Fehler weiter, damit der OfferProcessor ihn fangen kann
            throw new \Exception("E-Mail konnte nicht gesendet werden: {$mail->ErrorInfo}");
        }
    }

    /**
     * Einfacher Datei-Logger für Diagnosen.
     */
    private function logError(string $message): void
    {
        $logFile = __DIR__ . '/../api_errors.log';
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($logFile, "[{$timestamp}] EMAIL_SERVICE_ERROR - {$message}\n", FILE_APPEND);
    }
}
