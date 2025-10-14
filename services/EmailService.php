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

    public function send(string $recipientEmail, string $recipientName, string $subject, string $body): void
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

        $mail->send();
    }
}
