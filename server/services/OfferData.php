<?php

namespace FVCH\Offer;

class OfferData
{
    public readonly array $verteilgebiet;
    public readonly array $produktion;
    public readonly array $kontakt;
    public readonly array $kosten;

    private function __construct(array $payload)
    {
        $this->verteilgebiet = $payload['verteilgebiet'] ?? [];
        $this->produktion = $payload['produktion'] ?? [];
        $this->kontakt = $payload['kontakt'] ?? [];
        $this->kosten = $payload['kosten'] ?? [];
    }

    public static function fromPayload(array $payload): self
    {
        // Basic validation to ensure the payload is usable
        if (empty($payload['kontakt']['email'])) {
            throw new \InvalidArgumentException('Contact email is missing from payload.');
        }
        if (empty($payload['kosten'])) {
            throw new \InvalidArgumentException('Cost details are missing from payload.');
        }
        return new self($payload);
    }
}
