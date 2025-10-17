<?php
namespace FVCH\Offer;

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
        $reference = date('ymd-His');
        $token = bin2hex(random_bytes(16));
        $viewUrl = rtrim($this->config->get('APP_URL'), '/') . '/offerte/view.php?ref=' . $reference . '&token=' . $token;

        $templateData = [
            'reference' => $reference,
            'view_url' => $viewUrl,
            'qr_code_html' => $this->generateQrCodeHtml($viewUrl),
            'kontakt' => $offerData->kontakt,
            'produktion' => $offerData->produktion,
            'verteilgebiet' => $offerData->verteilgebiet,
            'kosten' => $offerData->kosten,
        ];

        $emailBody = $this->templateService->render($templateData);

        $this->storageService->save($reference, $token, $emailBody);

        $this->emailService->send(
            $offerData->kontakt['email'],
            ($offerData->kontakt['firstName'] ?? '') . ' ' . ($offerData->kontakt['lastName'] ?? ''),
            'Ihre Anfrage ' . $reference . ' · Top Flyer verteilen',
            $emailBody
        );

        return ['reference' => $reference, 'viewUrl' => $viewUrl];
    }

    /**
     * Generates QR code HTML using file_get_contents with robust error checking.
     * This is the most reliable method without using cURL.
     * Returns an empty string if the API fails, times out, or returns non-image content.
     */
    private function generateQrCodeHtml(string $url): string
    {
        $qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' . urlencode($url);

        $context = stream_context_create(['http' => ['timeout' => 4]]);

        // Use '@' to suppress warnings if allow_url_fopen is Off, as we handle this case.
        $result = @file_get_contents($qrApiUrl, false, $context);

        // Case 1: The request failed completely. This is the most common issue.
        if ($result === false) {
            $this->logError("file_get_contents() failed. This is typically caused by the 'allow_url_fopen' setting being disabled on the server's php.ini file.");
            return '';
        }

        // Case 2: The request succeeded, but we need to validate the response.
        $httpStatus = null;
        $contentType = null;

        // The $http_response_header variable is automatically populated by PHP after a successful file_get_contents call.
        if (isset($http_response_header) && is_array($http_response_header)) {
            // Get HTTP Status
            if (preg_match('/^HTTP\/\d\.\d\s(\d{3})/', $http_response_header[0], $matches)) {
                $httpStatus = (int)$matches[1];
            }
            // Get Content-Type
            foreach ($http_response_header as $header) {
                if (stripos($header, 'Content-Type:') === 0) {
                    $contentType = trim(substr($header, strlen('Content-Type:')));
                    break;
                }
            }
        }

        // Enterprise-grade validation: Check status is 200 AND content is an image.
        if ($httpStatus === 200 && $contentType && str_starts_with($contentType, 'image/')) {
            $base64 = base64_encode($result);
            return '<img src="data:image/png;base64,' . $base64 . '" alt="QR Code zur Offerte">';
        } else {
            $this->logError("QR code API responded with an invalid status or content. HTTP Status: {$httpStatus}, Content-Type: '{$contentType}'. Expected an image.");
            return '';
        }
    }

    /**
     * Simple file-based logger for diagnostics.
     */
    private function logError(string $message): void
    {
        $logFile = __DIR__ . '/../api_errors.log';
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($logFile, "[{$timestamp}] QR_CODE_ERROR - {$message}\n", FILE_APPEND);
    }
}
