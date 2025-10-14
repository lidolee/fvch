<?php
namespace FVCH\Offer;

class Config
{
    private array $env;

    public function __construct(string $rootDir)
    {
        try {
            $dotenv = \Dotenv\Dotenv::createImmutable($rootDir);
            $dotenv->load();
            $this->env = $_ENV;
        } catch (\Throwable $th) {
            $this->env = [];
        }
    }

    public function get(string $key, $default = null)
    {
        return $this->env[$key] ?? $default;
    }

    public function handleCorsAndMethodEnforcement(): void
    {
        $allowedOrigins = [
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
    }
}
