<?php
namespace FVCH\Offer;

class StorageService
{
    private string $dbDir;

    public function __construct(string $dbDir)
    {
        $this->dbDir = $dbDir;
        if (!is_dir($this->dbDir)) {
            if (!mkdir($this->dbDir, 0755, true)) {
                throw new \RuntimeException("Failed to create storage directory: {$this->dbDir}");
            }
        }
    }

    public function save(string $reference, string $token, string $content): void
    {
        $filePath = $this->dbDir . '/' . $reference . '-' . $token . '.html';
        if (file_put_contents($filePath, $content) === false) {
            throw new \RuntimeException('Failed to save offer HTML to disk.');
        }
    }
}
