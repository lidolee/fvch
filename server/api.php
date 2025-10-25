<?php
// Setzt den Content-Type Header auf JSON, damit das Frontend die Antwort versteht
header('Content-Type: application/json; charset=utf-8');

// CORS-Header (Cross-Origin Resource Sharing)
// Erlaubt dem Angular-Frontend (von einer anderen Domain/Port) den Zugriff auf diese API
// Passen Sie 'Allowed-Origin' ggf. auf Ihre Produktionsdomain an
header('Access-Control-Allow-Origin: *'); // Für Produktion einschränken!
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Behandelt Preflight-Requests (OPTIONS) vom Browser
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); // No Content
    exit;
}

// Stellt sicher, dass nur POST-Anfragen verarbeitet werden
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); // Method Not Allowed
    echo json_encode(['message' => 'Nur POST-Anfragen sind erlaubt.']);
    exit;
}

// PHP-Fehlerbehandlung (optional, aber empfohlen für die Produktion)
// error_reporting(0);
// ini_set('display_errors', 0);
// ini_set('log_errors', 1);
// ini_set('error_log', __DIR__ . '/api_errors.log'); // Stellt sicher, dass das Verzeichnis beschreibbar ist

// Autoloader für PHPMailer (falls über Composer installiert)
// Wenn Sie PHPMailer manuell eingebunden haben, passen Sie den Pfad an
require_once __DIR__ . '/vendor/autoload.php';

// Manuelles Laden der Service-Klassen
require_once __DIR__ . '/services/Config.php';
require_once __DIR__ . '/services/OfferData.php';
require_once __DIR__ . '/services/TemplateService.php';
require_once __DIR__ . '/services/StorageService.php';
require_once __DIR__ . '/services/EmailService.php';
// *** NEU: PdfGenerator laden ***
require_once __DIR__ . '/services/PdfGenerator.php';
require_once __DIR__ . '/services/OfferProcessor.php';


use FVCH\Offer\Config;
use FVCH\Offer\OfferData;
// *** KORREKTUR: Tippfehler im Namespace korrigiert ***
use FVCH\Offer\TemplateService;
use FVCH\Offer\StorageService;
use FVCH\Offer\EmailService;
use FVCH\Offer\PdfGenerator; // *** NEU: PdfGenerator importieren ***
use FVCH\Offer\OfferProcessor;

try {
    // 1. Konfiguration laden (lädt .env-Datei)
    $config = new Config(__DIR__ . '/.env');

    // Setzt die Zeitzone (wichtig für date())
    date_default_timezone_set($config->get('TIMEZONE', 'Europe/Zurich'));

    // 2. Eingehende Daten lesen
    $input = file_get_contents('php://input');
    if (empty($input)) {
        throw new \Exception('Keine Eingabedaten empfangen.');
    }

    // 3. Datenobjekt erstellen
    // *** KORREKTUR: JSON-String ZUERST in ein Array dekodieren ***
    $payload = json_decode($input, true);
    if ($payload === null) {
        throw new \Exception('Ungültige JSON-Eingabedaten empfangen: ' . json_last_error_msg());
    }

    // *** KORREKTUR: Aufruf der KORREKTEN statischen Factory-Methode (aus der bereitgestellten Datei) ***
    $offerData = OfferData::fromPayload($payload);

    // 4. Services instanziieren
    $templateService = new TemplateService(__DIR__ . '/email.template.php');
    $storageService = new StorageService(__DIR__ . '/db'); // Stellt sicher, dass /db beschreibbar ist
    $emailService = new EmailService($config);
    // *** NEU: PdfGenerator instanziieren ***
    $pdfGenerator = new PdfGenerator();

    // *** NEU: PdfGenerator an den OfferProcessor übergeben ***
    $offerProcessor = new OfferProcessor(
        $templateService,
        $emailService,
        $storageService,
        $config,
        $pdfGenerator // Hier wird die neue Abhängigkeit injiziert
    );

    // 5. Prozess starten
    $result = $offerProcessor->process($offerData);

    // 6. Erfolgsantwort an das Frontend senden
    http_response_code(200);
    echo json_encode($result);

} catch (\Exception $e) {
    // 7. Fehlerbehandlung (fängt alle Fehler ab, auch die vom OfferProcessor)
    // Loggt den Fehler (optional, aber empfohlen)
    file_put_contents(__DIR__ . '/api_errors.log', date('Y-m-d H:i:s') . ' - API_ERROR: ' . $e.getMessage() . "\n" . $e.getTraceAsString() . "\n", FILE_APPEND);

    // Sendet eine saubere JSON-Fehlermeldung an das Frontend
    http_response_code(400); // Bad Request oder 500 Internal Server Error
    echo json_encode([
        'message' => 'Ein Fehler ist aufgetreten: ' . $e->getMessage()
    ]);
}
