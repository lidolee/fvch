<?php
// offerte-api.php

// Setzt den Content-Type auf JSON fuer den Response
header('Content-Type: application/json');

// Lade Umgebungsvariablen und PHPMailer
require_once __DIR__ . '/vendor/autoload.php';
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

$designTemplates = [
    'silber' => <<<HTML
<p class="headline">Flyer Design</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0">
  <tr><td class="tdlabel" colspan="2">Design-Paket</td></tr>
  <tr><td class="border">Design-Paket Silber</td><td class="border align-right">399 CHF</td></tr>
  <tr><td class="tdlabel" colspan="2">Designvorschläge</td></tr>
  <tr><td class="tdvalue border" colspan="2">3 inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Korrekturen</td></tr>
  <tr><td class="tdvalue border" colspan="2">5 inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Druckfähiges PDF</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Swiss Quality-Check</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
</table>
HTML,
    'gold' => <<<HTML
<p class="headline">Flyer Design</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0">
  <tr><td class="tdlabel" colspan="2">Design-Paket</td></tr>
  <tr><td class="border">Design-Paket Gold</td><td class="border align-right">899 CHF</td></tr>
  <tr><td class="tdlabel" colspan="2">Designvorschläge</td></tr>
  <tr><td class="tdvalue border" colspan="2">3 inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Korrekturen</td></tr>
  <tr><td class="tdvalue border" colspan="2">5 inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Druckfähiges PDF</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Swiss Quality-Check</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Quelldateien (AI, PSD etc.)</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
</table>
HTML,
    'platin' => <<<HTML
<p class="headline">Flyer Design</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0">
  <tr><td class="tdlabel" colspan="2">Design-Paket</td></tr>
  <tr><td class="border">Design-Paket Platin</td><td class="border align-right">1'999 CHF</td></tr>
  <tr><td class="tdlabel" colspan="2">Designvorschläge</td></tr>
  <tr><td class="tdvalue border" colspan="2">3 inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Korrekturen</td></tr>
  <tr><td class="tdvalue border" colspan="2">5 inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Druckfähiges PDF</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Swiss Quality-Check</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Quelldateien (AI, PSD etc.)</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Logo & Branding Beratung</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
  <tr><td class="tdlabel" colspan="2">Marketing Strategie</td></tr>
  <tr><td class="tdvalue border" colspan="2">Inklusive</td></tr>
</table>
HTML
];

// --- HILFSFUNKTIONEN --------------------------------------------------
function getEnvOrDefault($key, $default = '') {
    return isset($_ENV[$key]) ? $_ENV[$key] : $default;
}

function sanitize($key) {
    return htmlspecialchars(trim($_POST[$key] ?? ''));
}

function withDash($value) {
    return $value !== '' ? $value : '—';
}

function renderTemplate($templatePath, $data) {
    $template = file_get_contents($templatePath);
    foreach ($data as $key => $value) {
        $template = str_replace('{{ ' . $key . ' }}', $value, $template);
    }
    return $template;
}

function generateToken($length = 16) {
    return bin2hex(random_bytes($length / 2));
}

// --- REFERENZ-ID GENERIEREN -------------------------------------------
$shortDate = date('ymd');
$counterFile = __DIR__ . "/.counter-$shortDate.txt";
if (!file_exists($counterFile)) file_put_contents($counterFile, "0");
$current = (int)file_get_contents($counterFile);
$current++;
file_put_contents($counterFile, $current);

$services = $_POST['services'] ?? [];
if (!is_array($services)) $services = [$services];

$prefix = '';
if (in_array('design', $services)) $prefix .= 'G';
if (in_array('druck', $services))  $prefix .= 'D';
if (in_array('verteilung', $services)) $prefix .= 'V';
if ($prefix === '') $prefix = 'X';

$reference = $prefix . '-' . $shortDate . '-' . str_pad($current, 3, '0', STR_PAD_LEFT);
$token = generateToken();

// --- FORMULARDATEN SAMMELN --------------------------------------------
$data = [
    'anrede' => sanitize('anrede'),
    'vorname' => sanitize('vorname'),
    'nachname' => sanitize('nachname'),
    'email' => sanitize('email'),
    'telefon' => withDash(sanitize('telefon')),
    'firma' => withDash(sanitize('firma')),
    'strasse' => sanitize('strasse'),
    'hausnummer' => withDash(sanitize('hausnummer')),
    'plz' => sanitize('plz'),
    'ort' => sanitize('ort'),
    'website' => withDash(sanitize('website')),
    'reference' => $reference,
    'flyer_design_block' => '',
    'flyer_druck_block' => '',
    'flyer_verteilung_block' => '',
];

$data['intro'] = $data['anrede'] === 'Herr' ? 'Sehr geehrter' : 'Sehr geehrte';

$link = 'https://www.flyer-verteilen.ch/offerte/view.php?ref=' . $reference . '&token=' . $token;
$data['view-url'] = '<a href="' . $link . '">' . $reference . '</a>';
$data['qr-code'] = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' . urlencode($link) . '" alt="QR Code zur Offerte">';

// --- BLOCK: DESIGN -----------------------------------------------------
if (in_array('design', $services)) {
    $paket = strtolower(sanitize('design-package'));
    $data['preis'] = match ($paket) {
        'silber' => '399 CHF',
        'gold' => '899 CHF',
        'platin' => "1'999 CHF",
        default => '—'
    };
    $data['flyer_design_block'] = $designTemplates[$paket] ?? '';
}
// --- BLOCK: DRUCK ------------------------------------------------------

if (in_array('druck', $services)) {
    $data['druck-format'] = withDash(sanitize('druck-format'));
    $data['druck-grammatur'] = withDash(sanitize('druck-grammatur'));
    $data['druck-art'] = withDash(sanitize('druck-art'));

    $data['flyer_druck_block'] = '
    <p class="headline">Flyer Druck - separate Offerte</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
      <tr><td class="tdlabel">Format</td></tr>
      <tr><td class="tdvalue border">' . $data['druck-format'] . '</td></tr>
      <tr><td class="tdlabel">Material & Grammatur</td></tr>
      <tr><td class="tdvalue border">' . $data['druck-grammatur'] . '</td></tr>
      <tr><td class="tdlabel">Druckart</td></tr>
      <tr><td class="tdvalue border">' . $data['druck-art'] . '</td></tr>
    </table>';
}

// --- BLOCK: VERTEILUNG -------------------------------------------------

if (in_array('verteilung', $services)) {
    $anlieferung = withDash(sanitize('verteilung-anlieferung'));
    $zielgruppe = withDash(sanitize('verteilung-zielgruppe'));
    $datumRaw = sanitize('verteilung-datum');
    $datum = '—';
    if (!empty($datumRaw)) {
        $parsed = strtotime($datumRaw);
        $datum = $parsed ? date('d.m.Y', $parsed) : $datumRaw;
    }

    $anlieferungText = $anlieferung === 'Wir holen bei Ihnen ab'
        ? 'Wir holen bei Ihnen ab — kostenpflichtig'
        : 'Sie liefern zu uns — kostenlos';

    $anlieferungPreis = $anlieferung === 'Wir holen bei Ihnen ab'
        ? '75 CHF'
        : '0 CHF';

    $anlieferung = withDash(sanitize('verteilung-anlieferung'));
    $zielgruppe = withDash(sanitize('verteilung-zielgruppe'));
    $datumRaw = sanitize('verteilung-datum');
    $datum = '—';
    if (!empty($datumRaw)) {
        $parsed = strtotime($datumRaw);
        $datum = $parsed ? date('d.m.Y', $parsed) : $datumRaw;
    }

    $data['verteilung-anlieferung'] = $anlieferung;
    $data['verteilung-zielgruppe'] = $zielgruppe;
    $data['verteilung-datum'] = $datum;

    $preisAbholung = '75 CHF';
    $preisSelbstlieferung = '0 CHF';

    $zeileAnlieferung = $anlieferung === 'Wir holen bei Ihnen ab'
        ? '<tr><td class="border">Wir holen bei Ihnen ab</td><td class="border align-right">' . $preisAbholung . '</td></tr>'
        : '<tr><td class="border">Sie liefern zu uns — kostenlos</td><td class="border align-right">' . $preisSelbstlieferung . '</td></tr>';

    $data['flyer_verteilung_block'] = '
        <p class="headline">Flyer Verteilung</p>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
          <tr><td class="tdlabel" colspan="2">Anlieferung der Flyer</td></tr>
          <tr><td class="tdvalue border">' . $anlieferungText . '</td><td class="tdvalue border align-right">' . $anlieferungPreis . '</td></tr>
          <tr><td class="tdlabel" colspan="2">Zielgruppe</td></tr>
          <tr><td class="tdvalue border" colspan="2">' . $zielgruppe . '</td></tr>
          <tr><td class="tdlabel" colspan="2">Datum der Verteilung</td></tr>
          <tr><td class="tdvalue border" colspan="2">' . $datum . '</td></tr>
        </table>';
}

// --- E-MAIL VERSAND ----------------------------------------------------
try {
    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->isSMTP();
    $mail->Host       = getEnvOrDefault('SMTP_HOST');
    $mail->SMTPAuth   = getEnvOrDefault('SMTP_AUTH') === 'true';
    $mail->Username   = getEnvOrDefault('SMTP_USERNAME');
    $mail->Password   = getEnvOrDefault('SMTP_PASSWORD');
    $mail->SMTPSecure = getEnvOrDefault('SMTP_ENCRYPTION');
    $mail->Port       = getEnvOrDefault('SMTP_PORT');

    $mail->setFrom(getEnvOrDefault('MAIL_FROM'), getEnvOrDefault('MAIL_FROM_NAME'));
    $mail->addAddress($data['email'], $data['vorname'] . ' ' . $data['nachname']);
    $mail->addBCC(getEnvOrDefault('INTERNAL_EMAIL'));

    $mail->isHTML(true);
    $mail->Subject = 'Anfrage ' . $data['reference'];
    $mail->Body    = renderTemplate(__DIR__ . '/email.html', $data);

    // HTML-Datei speichern mit Token im geschützten Unterverzeichnis
    $htmlDir = __DIR__ . '/db';
    if (!is_dir($htmlDir)) mkdir($htmlDir, 0755, true);
    $htmlPath = $htmlDir . '/' . $reference . '-' . $token . '.html';
    file_put_contents($htmlPath, $mail->Body);

    $mail->send();

    echo json_encode([
        'success' => true,
        'reference' => $reference,
        'token' => $token,
        'link' => $link
    ]);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Mailer Error: ' . $mail->ErrorInfo
    ]);
}