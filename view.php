<?php
// sichere Ansicht einer gespeicherten Offerte aus /offerte/db/

$ref   = basename($_GET['ref'] ?? '');
$token = preg_replace('/[^a-f0-9]/', '', $_GET['token'] ?? '');

if (!$ref || !$token) {
    http_response_code(400);
    exit('Ungültiger Aufruf');
}

$filename = __DIR__ . '/db/' . $ref . '-' . $token . '.html';

if (!preg_match('/^[A-Z]+-\d{6}-\d{3}$/', $ref) || !file_exists($filename)) {
    http_response_code(403);
    exit('Zugriff verweigert');
}

header('Content-Type: text/html; charset=utf-8');
readfile($filename);
