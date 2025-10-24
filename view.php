<?php
// Einfaches Error-Handling
ini_set('display_errors', 0);
error_reporting(0);

// --- Sicherheits-Validierung der Eingaben ---

// 1. Referenz (ref) validieren
// Erlaubt nur alphanumerische Zeichen und Bindestriche.
$basename = basename(preg_replace('/[^a-zA-Z0-9-]/', '', $_GET['ref'] ?? ''));

// 2. Token (token) validieren
// Erlaubt nur hexadezimale Zeichen.
$token = preg_replace('/[^a-f0-9]/', '', $_GET['token'] ?? '');

// Wenn eine der Eingaben leer oder ungültig war, sofort abbrechen.
if (empty($basename) || empty($token) || strlen($token) !== 32) {
    http_response_code(400); // Bad Request
    echo 'Ungültige Anfrage.';
    exit;
}

// --- Dateipfade definieren ---
$dbDir = __DIR__ . '/db';

// *** KORREKTUR: Dateiname wird aus ref UND token zusammengesetzt ***
// Dies entspricht der Dateistruktur, die Sie auf dem SFTP-Server beschrieben haben
// (z.B. 251023-214518-ecd17fcb46e60afd5253ac180efef572.html)
$htmlFile = $dbDir . '/' . $basename . '-' . $token . '.html';
// *** ENDE KORREKTUR ***


// --- Existenzprüfung ---
// Prüfen, ob die kombinierte HTML-Datei existiert.
if (!file_exists($htmlFile)) {
    http_response_code(404); // Not Found
    echo 'Offerte nicht gefunden.';
    exit;
}

// --- Token-Abgleich (ENTFERNT) ---
// Die vorherige Logik, die eine separate .token-Datei gelesen hat,
// ist nicht mehr notwendig, da der Token Teil des HTML-Dateinamens ist
// und als Authentifizierung dient.


// --- Erfolg: HTML-Datei ausliefern ---
// Wenn die Prüfung bestanden wurde, den Inhalt der HTML-Datei anzeigen.
header('Content-Type: text/html; charset=utf-8');
readfile($htmlFile);
exit;
