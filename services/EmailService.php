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
     * Sendet eine E-Mail, optional mit eingebetteten Bildern (CID).
     *
     * @param string $recipientEmail
     * @param string $recipientName
     * @param string $subject
     * @param string $body
     * @param string|null $inlineImageData Die reinen Bilddaten (raw string)
     * @param string|null $inlineImageMime Der MIME-Typ (z.B. 'image/png')
     * @param string $inlineImageCid Die Content-ID (cid), die im HTML-Template verwendet wird
     * @throws Exception
     */
    public function send(
        string $recipientEmail,
        string $recipientName,
        string $subject,
        string $body,
        ?string $inlineImageData = null,
        ?string $inlineImageMime = null,
        string $inlineImageCid = 'qr_image'
    ): void
    {
        $mail = new PHPMailer(true);
        $mail->CharSet = 'UTF-8';
        $mail->isSMTP();
        $mail->Host = $this->config->get('SMTP_HOST');
        $mail->SMTPAuth = $this->config->get('SMTP_AUTH') === 'true';
        $mail->Username = $this->config->get('SMTP_USERNAME');
        $mail->Password = $this->config->get('SMTP_PASSWORD');
        $mail->SMTPSecure = $this->config->get('SMTP_ENCRYPTION');
        $mail->Port = (int)$this->config->get('SMTP_PORT');

        $mail->setFrom($this->config->get('MAIL_FROM'), $this->config->get('MAIL_FROM_NAME'));
        $mail->addAddress($recipientEmail, $recipientName);
        $mail->addBCC($this->config->get('INTERNAL_EMAIL'));
        $mail->addReplyTo($this->config->get('MAIL_FROM'), $this->config->get('MAIL_FROM_NAME'));

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $body;

        // *** KORREKTUR: Eingebettetes Bild (CID) hinzufügen ***
        // Fügt die Bilddaten als Inline-Anhang hinzu, auf den das Template verweisen kann.
        if ($inlineImageData && $inlineImageMime) {
            $mail->addStringEmbeddedImage(
                $inlineImageData,
                $inlineImageCid,
                'qr-code.png', // Name des Anhangs (beliebig)
                'base64',      // PHPMailer erwartet, dass wir 'base64' angeben, behandelt die Daten aber als raw string
                $inlineImageMime
            );
        }
        // *** ENDE DER KORREKTUR ***

        $mail->send();
    }
}
