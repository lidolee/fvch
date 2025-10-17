<?php
/**
 * FVCH Offer Dispatch API v18 - Enterprise Refactor (Manual Loading)
 *
 * This script is the definitive endpoint for the FVCH Angular application.
 * It handles CORS, manually loads all required service classes to work without Composer's autoloader,
 * validates input, processes the offer, and sends it via SMTP.
 */

// --- 1. HTTP & CORS HANDLING (MUST BE ABSOLUTELY FIRST) -------------------
$allowedOrigins = [
    'http://10.1.1.100:4200',
    'http://localhost:4200',
    'https://www.flyer-verteilen.ch',
    'https://flyer-verteilen.ch'
];

if (isset($_SERVER['HTTP_ORIGIN']) && in_array($_SERVER['HTTP_ORIGIN'], $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    exit(json_encode(['status' => 'error', 'message' => 'Only POST method is accepted.']));
}

header('Content-Type: application/json');


// --- 2. BOOTSTRAPPING & MANUAL LOADING ------------------------------------
// This part is crucial as it replaces the composer autoloading for our classes.
require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/services/Config.php';
require_once __DIR__ . '/services/OfferData.php';
require_once __DIR__ . '/services/TemplateService.php';
require_once __DIR__ . '/services/EmailService.php';
require_once __DIR__ . '/services/StorageService.php';
require_once __DIR__ . '/services/OfferProcessor.php';

use FVCH\Offer\Config;
use FVCH\Offer\OfferData;
use FVCH\Offer\OfferProcessor;
use FVCH\Offer\EmailService;
use FVCH\Offer\TemplateService;
use FVCH\Offer\StorageService;


// --- 3. MAIN APPLICATION LOGIC --------------------------------------------
try {
    // Dependency Injection: Instantiate services
    $config = new Config(__DIR__);
    $emailService = new EmailService($config);
    $templateService = new TemplateService(__DIR__ . '/email.template.php');
    $storageService = new StorageService(__DIR__ . '/db');

    // Input validation and creation of a structured data object
    $payload = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new InvalidArgumentException('Invalid JSON format received.');
    }
    $offerData = OfferData::fromPayload($payload);

    // The main processor orchestrates the entire workflow
    $processor = new OfferProcessor($templateService, $emailService, $storageService, $config);

    // Process the offer (generates template, saves file, sends email)
    $result = $processor->process($offerData);

    // Success response
    http_response_code(200);
    echo json_encode([
        'status' => 'success',
        'message' => 'Offer sent successfully.',
        'reference' => $result['reference'],
        'viewUrl' => $result['viewUrl']
    ]);

} catch (Exception $e) {
    // Centralized error handling
    http_response_code($e instanceof InvalidArgumentException ? 400 : 500);
    echo json_encode(['status' => 'error', 'message' => 'Server error: ' . $e->getMessage()]);
}

exit;
