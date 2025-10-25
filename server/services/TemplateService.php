<?php
namespace FVCH\Offer;

class TemplateService
{
    private string $templatePath;

    public function __construct(string $templatePath)
    {
        if (!file_exists($templatePath)) {
            throw new \RuntimeException("Template file not found at {$templatePath}");
        }
        $this->templatePath = $templatePath;
    }

    public function render(array $data): string
    {
        extract($data);
        ob_start();
        include $this->templatePath;
        return ob_get_clean();
    }
}
