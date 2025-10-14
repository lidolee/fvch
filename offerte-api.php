<?php
// offerte-api.php (v3 - Adapted for nested frontend payload)

// --- DEPENDENCIES & SETUP ---
header('Content-Type: application/json');
require_once __DIR__ . '/vendor/autoload.php';
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// --- CORS HANDLING ---
header("Access-Control-Allow-Origin: http://localhost:4200");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- LOAD ENVIRONMENT VARIABLES ---
try {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
    $dotenv->load();
    $dotenv->required(['SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_PORT', 'MAIL_FROM', 'MAIL_FROM_NAME', 'INTERNAL_EMAIL', 'BASE_URL']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Configuration error: ' . $e->getMessage()]);
    exit;
}

// --- HELPER FUNCTIONS ---
function getEnvOrDefault(string $key, $default = null) {
    return $_ENV[$key] ?? $default;
}

function renderTemplate(string $path, array $data): string {
    $template = file_get_contents($path);
    foreach ($data as $key => $value) {
        if (is_string($value) || is_numeric($value)) {
            $template = str_replace('{{ ' . $key . ' }}', htmlspecialchars($value), $template);
        }
    }
    // Render blocks
    $template = str_replace('{{ kontaktdaten_block }}', createContactBlock($data), $template);
    $template = str_replace('{{ flyer_design_block }}', createDesignBlock($data['design'] ?? 'none'), $template);
    $template = str_replace('{{ flyer_druck_block }}', createPrintBlock($data), $template);
    $template = str_replace('{{ flyer_verteilung_block }}', createDistributionBlock($data), $template);
    return $template;
}

// --- HTML BLOCK GENERATORS (Adapted for nested data) ---
function createContactBlock(array $data): string {
    return '
        <p class="headline">Kontaktdaten</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td class="tdlabel">Kontaktperson</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['anrede']) . ' ' . htmlspecialchars($data['vorname']) . ' ' . htmlspecialchars($data['nachname']) . '</td></tr>
            <tr><td class="tdlabel">E-Mail</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['email']) . '</td></tr>
            <tr><td class="tdlabel">Telefon</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['telefon']) . '</td></tr>
            <tr><td class="tdlabel">Firma</td></tr>
            <tr><td class="border tdvalue">' . (htmlspecialchars($data['firma']) ?: '-') . '</td></tr>
            <tr><td class="tdlabel">Strasse & Hausnummer</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['strasse']) . ' ' . htmlspecialchars($data['hausnummer']) . '</td></tr>
            <tr><td class="tdlabel">PLZ & Ort</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['plz']) . ' ' . htmlspecialchars($data['ort']) . '</td></tr>
        </table>';
}

function createDesignBlock(string $design): string {
    $designKey = strtolower($design);
    $templates = [
        'silber' => '<p class="headline">Flyer Design</p><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="tdlabel" colspan="2">Design-Paket</td></tr><tr><td class="border">Design-Paket Silber</td><td class="border align-right">399 CHF</td></tr><tr><td class="tdlabel" colspan="2">Designvorschläge</td></tr><tr><td class="tdvalue border" colspan="2">1 inklusive</td></tr><tr><td class="tdlabel" colspan="2">Korrekturen</td></tr><tr><td class="tdvalue border" colspan="2">1 inklusive</td></tr><tr><td class="tdlabel" colspan="2">Druckfähiges PDF</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Swiss Quality-Check</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr></table>',
        'gold' => '<p class="headline">Flyer Design</p><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="tdlabel" colspan="2">Design-Paket</td></tr><tr><td class="border">Design-Paket Gold</td><td class="border align-right">899 CHF</td></tr><tr><td class="tdlabel" colspan="2">Designvorschläge</td></tr><tr><td class="tdvalue border" colspan="2">2 inklusive</td></tr><tr><td class="tdlabel" colspan="2">Korrekturen</td></tr><tr><td class="tdvalue border" colspan="2">3 inklusive</td></tr><tr><td class="tdlabel" colspan="2">Druckfähiges PDF</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Swiss Quality-Check</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Quelldateien (AI, PSD etc.)</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr></table>',
        'platin' => '<p class="headline">Flyer Design</p><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="tdlabel" colspan="2">Design-Paket</td></tr><tr><td class="border">Design-Paket Platin</td><td class="border align-right">1\'999 CHF</td></tr><tr><td class="tdlabel" colspan="2">Designvorschläge</td></tr><tr><td class="tdvalue border" colspan="2">3 inklusive</td></tr><tr><td class="tdlabel" colspan="2">Korrekturen</td></tr><tr><td class="tdvalue border" colspan="2">5 inklusive</td></tr><tr><td class="tdlabel" colspan="2">Druckfähiges PDF</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Swiss Quality-Check</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Quelldateien (AI, PSD etc.)</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Logo & Branding Beratung</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr><tr><td class="tdlabel" colspan="2">Marketing Strategie</td></tr><tr><td class="tdvalue border" colspan="2">Inklusive</td></tr></table>',
        'none' => '<p class="headline">Flyer Design</p><p>Kein Design-Paket ausgewählt.</p>'
    ];
    return $templates[$designKey] ?? $templates['none'];
}

function createPrintBlock(array $data): string {
    return '
        <p class="headline">Flyer Druck (separate Offerte)</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td class="tdlabel">Format</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['druck_format'] ?? '-') . '</td></tr>
            <tr><td class="tdlabel">Material & Grammatur</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['druck_grammatur'] ?? '-') . '</td></tr>
            <tr><td class="tdlabel">Druckart</td></tr>
            <tr><td class="border tdvalue">' . htmlspecialchars($data['druck_art'] ?? '-') . '</td></tr>
        </table>';
}

function createDistributionBlock(array $data): string {
    $plzRows = '';
    if (!empty($data['verteilung_plz'])) {
        foreach ($data['verteilung_plz'] as $plz) {
            $plzRows .= '<tr><td class="border">' . htmlspecialchars($plz['plz']) . ' ' . htmlspecialchars($plz['ort']) . '</td><td class="border align-right">' . number_format($plz['haushalte'], 0, '.', "'") . '</td></tr>';
        }
    }
    $total = (float)($data['kosten']['total'] ?? 0);
    $vat = $total * 0.081;
    $totalInclVat = $total + $vat;

    return '
        <p class="headline">Flyer Verteilung</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td class="tdlabel">Gesamtauflage</td></tr>
            <tr><td class="border tdvalue">' . number_format($data['verteilung_auflage'] ?? 0, 0, '.', "'") . ' Haushalte</td></tr>
        </table>' .
        (!empty($plzRows) ? '<p class="headline" style="margin-top: 24px;">Ausgewählte Verteilgebiete</p><table role="presentation" border="0" cellpadding="0" cellspacing="0">' . $plzRows . '</table>' : '') . '
        <p class="headline" style="margin-top: 24px;">Zusammenfassung Kosten</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr><td class="border">Verteilung</td><td class="border align-right">' . number_format((float)($data['kosten']['distribution'] ?? 0), 2, '.', "'") . ' CHF</td></tr>' .
        ($data['kosten']['design'] > 0 ? '<tr><td class="border">Design</td><td class="border align-right">' . number_format((float)($data['kosten']['design'] ?? 0), 2, '.', "'") . ' CHF</td></tr>' : '') . '
            <tr><td class="border">Zwischensumme</td><td class="border align-right">' . number_format($total, 2, '.', "'") . ' CHF</td></tr>
            <tr><td class="border">8.1% Mehrwertsteuer</td><td class="border align-right">' . number_format($vat, 2, '.', "'") . ' CHF</td></tr>
            <tr><td class="text-bold">Summe Total</td><td class="align-right text-bold">' . number_format($totalInclVat, 2, '.', "'") . ' CHF</td></tr>
        </table>';
}

// --- SCRIPT EXECUTION ---
$rawPayload = file_get_contents('php://input');
$data = json_decode($rawPayload, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON format.']);
    exit;
}

// --- DATA TRANSFORMATION: Map nested payload to flat structure for template ---
$flatData = [
    'anrede' => $data['kontakt']['gender'] === 'female' ? 'Frau' : 'Herr',
    'vorname' => $data['kontakt']['firstname'],
    'nachname' => $data['kontakt']['lastname'],
    'email' => $data['kontakt']['email'],
    'telefon' => $data['kontakt']['phone'],
    'firma' => $data['kontakt']['company'],
    'strasse' => $data['kontakt']['street'],
    'hausnummer' => $data['kontakt']['streetnumber'],
    'plz' => $data['kontakt']['plz'],
    'ort' => $data['kontakt']['city'],
    'design' => $data['produktion']['design']['design'],
    'druck_format' => $data['produktion']['druck']['format'],
    'druck_grammatur' => $data['produktion']['druck']['paper'],
    'druck_art' => $data['produktion']['druck']['fold'],
    'verteilung_plz' => $data['verteilgebiet']['selectedPlz'],
    'verteilung_auflage' => $data['verteilgebiet']['totalHouseholds'],
    'kosten' => $data['kosten'],
];

// Generate unique reference and token
$reference = 'ANF-' . date('ymd') . '-' . substr(strtoupper(uniqid()), -3);
$token = bin2hex(random_bytes(16));
$flatData['reference'] = $reference;
$flatData['view_url'] = getEnvOrDefault('BASE_URL') . '/offerte/view.php?ref=' . $reference . '&token=' . $token;

// --- E-MAIL DISPATCH ---
try {
    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->isSMTP();
    $mail->Host       = getEnvOrDefault('SMTP_HOST');
    $mail->SMTPAuth   = getEnvOrDefault('SMTP_AUTH', 'true') === 'true';
    $mail->Username   = getEnvOrDefault('SMTP_USERNAME');
    $mail->Password   = getEnvOrDefault('SMTP_PASSWORD');
    $mail->SMTPSecure = getEnvOrDefault('SMTP_ENCRYPTION', 'tls');/*  */
    $mail->Port       = (int)getEnvOrDefault('SMTP_PORT', 587);

    $mail->setFrom(getEnvOrDefault('MAIL_FROM'), getEnvOrDefault('MAIL_FROM_NAME'));
    $mail->addAddress($flatData['email'], $flatData['vorname'] . ' ' . $flatData['nachname']);
    $mail->addBCC(getEnvOrDefault('INTERNAL_EMAIL'));

    $mail->isHTML(true);
    $mail->Subject = 'Ihre Anfrage ' . $flatData['reference'];
    $mail->Body    = renderTemplate(__DIR__ . '/email.html', $flatData);

    $htmlDir = __DIR__ . '/db';
    if (!is_dir($htmlDir)) mkdir($htmlDir, 0755, true);
    $htmlPath = $htmlDir . '/' . $reference . '-' . $token . '.html';
    file_put_contents($htmlPath, $mail->Body);

    $mail->send();

    http_response_code(200);
    echo json_encode(['status' => 'success', 'message' => 'Anfrage versendet.', 'reference' => $reference, 'viewUrl' => $flatData['view_url']]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => "E-Mail konnte nicht gesendet werden: {$mail->ErrorInfo}"]);
}

exit;
