<?php
// Template Helper Functions, co-located with the template for maintainability.
// (HINWEIS: Dies basiert auf der von Ihnen zuvor geposteten Template-Version)

function render_contact_block(array $kontakt): void {
  echo '<p class="headline">Kontaktdaten</p>';
  echo '<table role="presentation" border="0" cellpadding="0" cellspacing="0">';
  
  $anrede = htmlspecialchars($kontakt['salutation'] ?? 'Herr/Frau');
  $vorname = htmlspecialchars($kontakt['firstName'] ?? '');
  $nachname = htmlspecialchars($kontakt['lastName'] ?? '');
  echo '<tr><td class="tdlabel">Kontaktperson</td></tr>';
  echo '<tr><td class="tdvalue border">' . $anrede . ' ' . $vorname . ' ' . $nachname . '</td></tr>';
  
  if (!empty($kontakt['email'])) {
    $email = htmlspecialchars($kontakt['email']);
    echo '<tr><td class="tdlabel">E-Mail</td></tr>';
    echo '<tr><td class="tdvalue border"><a href="mailto:' . $email . '">' . $email . '</a></td></tr>';
  }
  if (!empty($kontakt['phone'])) {
    echo '<tr><td class="tdlabel">Telefon</td></tr>';
    echo '<tr><td class="tdvalue border">' . htmlspecialchars($kontakt['phone']) . '</td></tr>';
  }
  if (!empty($kontakt['company'])) {
    echo '<tr><td class="tdlabel">Firma</td></tr>';
    echo '<tr><td class="tdvalue border">' . htmlspecialchars($kontakt['company']) . '</td></tr>';
  }
  if (!empty($kontakt['street'])) {
    $hausnummer = htmlspecialchars($kontakt['houseNumber'] ?? '');
    $plz = htmlspecialchars($kontakt['postalCode'] ?? '');
    $ort = htmlspecialchars($kontakt['city'] ?? '');
    echo '<tr><td class="tdlabel">Adresse</td></tr>';
    echo '<tr><td class="tdvalue border">' . htmlspecialchars($kontakt['street']) . ' ' . $hausnummer . '<br>' . $plz . ' ' . $ort . '</td></tr>';
  }
  if (!empty($kontakt['website'])) {
    echo '<tr><td class="tdlabel">Website</td></tr>';
    echo '<tr><td class="tdvalue border">' . htmlspecialchars($kontakt['website']) . '</td></tr>';
  }
  echo '</table>';
}

function render_design_block(array $produktion, array $kosten): void {
  $design = strtolower($produktion['designPackage'] ?? 'none');
  
  if ($design === 'eigenes' || $design === 'self') {
    echo '<p class="headline">Flyer Design</p><table role="presentation" border="0" cellpadding="0" cellspacing="0">';
    echo '<tr><td class="tdlabel">Design-Paket</td><td class="tdlabel align-right">Preis</td></tr>';
    echo '<tr><td class="tdvalue border">Eigenes Design als PDF</td><td class="tdvalue border align-right">0.00</td></tr>';
    echo '</table>';
    return;
  }
  
  $packageMap = [
    'basis' => 'silber',
    'plus' => 'gold',
    'premium' => 'platin'
  ];
  $designKey = $packageMap[$design] ?? 'none';
  
  $details = [
    'silber' => ['name' => 'Basis Paket', 'items' => ['Designvorschläge' => '1 inklusive', 'Korrekturen' => '1 inklusive', 'Druckfähiges PDF' => 'Inklusive']],
    'gold'   => ['name' => 'Plus Paket', 'items' => ['Designvorschläge' => '2 inklusive', 'Korrekturen' => '3 inklusive', 'Quelldateien' => 'Inklusive']],
    'platin' => ['name' => 'Premium Paket', 'items' => ['Designvorschläge' => '3 inklusive', 'Korrekturen' => '5 inklusive', 'Logo & Branding' => 'Inklusive']]
  ];
  
  if ($designKey === 'none' || !isset($details[$designKey])) {
    echo '<p class="headline">Flyer Design</p><p>Kein Design-Paket ausgewählt.</p>';
    return;
  }
  
  $package = $details[$designKey];
  $price = number_format($kosten['designPackageCost'] ?? 0, 2, '.', "'");
  
  echo '<p class="headline">Flyer Design</p><table role="presentation" border="0" cellpadding="0" cellspacing="0">';
  echo '<tr><td class="tdlabel">Design-Paket</td><td class="tdlabel align-right">Preis</td></tr>';
  echo '<tr><td class="tdvalue border">' . $package['name'] . '</td><td class="tdvalue border align-right">' . $price . '</td></tr>';
  
  echo '</table>';
}

function render_print_block(array $produktion): void {
  $printOption = $produktion['printOption'] ?? 'none';
  // Logic adjusted to only show details if printOption is 'service'
  if ($printOption !== 'service' || empty($produktion['printServiceDetails']['format'])) {
    // If 'Flyer vorhanden' or no format, show a simpler message or nothing related to print details.
    // The format itself will be handled in render_distribution_block.
    echo '<p class="headline">Flyer Druck</p><p>Kein Druckservice bestellt / Flyer vorhanden.</p>';
    return;
  }
  $details = $produktion['printServiceDetails'];
  ?>
  <p class="headline">Flyer Druck (Separate Offerte)</p>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0">
    <tr><td class="tdlabel">Format</td></tr>
    <tr><td class="tdvalue border"><?= htmlspecialchars($details['format'] ?? '') ?></td></tr>
    <tr><td class="tdlabel">Grammatur</td></tr>
    <tr><td class="tdvalue border"><?= htmlspecialchars(($details['grammatur'] ?? '') . 'g/m²') ?></td></tr>
    <tr><td class="tdlabel">Druckart</td></tr>
    <tr><td class="tdvalue border"><?= htmlspecialchars($details['art'] ?? '') ?></td></tr>
    <tr><td class="tdlabel">Ausführung</td></tr>
    <tr><td class="tdvalue border"><?= htmlspecialchars(($details['ausfuehrung'] ?? '')) ?></td></tr>
  </table>
  <?php
}

function render_perimeter_block(array $verteilgebiet): void {
  $verteilungTyp = $verteilgebiet['verteilungTyp'];
  $perimeterHinweis = "";
  
  if ($verteilungTyp === 'Nach PLZ') {
    $perimeterHinweis = "";
  }
  else {
    $perimeterHinweis = "<strong>Bitte senden Sie uns Ihren gewünschten Perimeter per E-Mail. Gerne können Sie hierzu einfach auf diese E-Mail antworten. Nachdem wir Ihren Perimeter erhalten haben, erhalten Sie Ihre finale Offerte per E-Mail.</strong><br><br>";
  }
  ?>
  <?= $perimeterHinweis ?>
  <?php
}

function render_distribution_block(array $verteilgebiet, array $kosten, array $produktion): void {
  // Logic to determine the flyer format regardless of print option
  $flyerFormat = null;
  $printOption = $produktion['printOption'] ?? 'none';
  
  if ($printOption === 'service') {
    $flyerFormat = $produktion['printServiceDetails']['format'] ?? null;
  } else { // This covers the 'self' (Flyer vorhanden) case
    $flyerFormat = $produktion['anlieferDetails']['format'] ?? null;
  }
  
  $verteilungTyp = $verteilgebiet['verteilungTyp'];
  
  ?>
  <p class="headline">Flyer Verteilung</p>
  
  <?php if (!empty($flyerFormat)): ?>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
      <tr><td class="tdlabel">Format</td></tr>
      <tr>
        <td class="tdvalue border">
          <?= htmlspecialchars($flyerFormat) ?>
          <?= $flyerFormat === "Anderes Format" ? '<br><br><span class="text-muted">Bitte beachten Sie, dass bei Spezialformaten ein Zuschlag für die Verteilung anfällt. Sie erhalten den finalen Preis nach einer manuellen Berechnung via E-Mail.</span>' : '' ?>
        </td></tr>
    </table>
    <br>
  <?php endif; ?>
  
  <!-- *** MODIFIED: Conditional display based on verteilungTyp *** -->
  <?php if ($verteilungTyp === 'Nach PLZ'): ?>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
      <tr><td class="tdlabel">Gesamtauflage</td><td class="tdlabel align-right">Zielgruppe</td></tr>
      <tr>
        <td class="tdvalue border"><?= number_format($verteilgebiet['totalFlyersCount'] ?? 0, 0, '.', "'") ?></td>
        <td class="tdvalue border align-right"><?= htmlspecialchars($verteilgebiet['zielgruppe'] ?? 'N/A') ?></td>
      </tr>
    </table>
    <br>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td class="tdlabel">PLZ Ort</td>
        <td class="tdlabel align-right">Flyer</td>
        <td class="tdlabel align-right">Preis</td>
      </tr>
      <?php if (!empty($kosten['distributionCostItems'])): ?>
        <?php foreach ($kosten['distributionCostItems'] as $item): ?>
          <tr>
            <td class="tdvalue border"><?= htmlspecialchars($item['plz'] . ' ' . $item['ort']) ?></td>
            <td class="tdvalue border align-right"><?= number_format($item['flyers'], 0, '.', "'") ?></td>
            <td class="tdvalue border align-right"><?= number_format($item['price'] ?? 0, 2, '.', "'") ?></td>
          </tr>
        <?php endforeach; ?>
      <?php endif; ?>
    </table>
  <?php else: // Assuming 'Nach Perimeter' or other types ?>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
      <tr>
        <td class="tdlabel">Verteilgebiet</td>
      </tr>
      <tr><td class="tdvalue border">Nach Perimeter</td>
      </tr>
      <tr>
        <td class="tdlabel">Gesamtauflage</td>
      </tr>
      <tr>
        <td class="tdvalue border">Manuelle Berechnung</td>
      </tr>
    </table>
  <?php endif; ?>
  
  <?php if ($verteilungTyp === 'Nach PLZ'): ?>
    <br>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
      <!-- Surcharges Section -->
      <?php
      $surchargesExist = !empty($kosten['expressZuschlagPrice']) || !empty($kosten['fahrzeugGpsPrice']) || !empty($kosten['zuschlagFormatPrice']) || !empty($kosten['flyerAbholungPrice']) || !empty($kosten['ausgleichKleinauftragPrice']);
      ?>
      <?php if ($surchargesExist): ?>
        <tr><td colspan="3">&nbsp;</td></tr>
        <tr><td class="tdlabel" colspan="3">Zuschläge</td></tr>
        <?php if (!empty($kosten['expressZuschlagPrice'])): ?>
          <tr>
            <td class="tdvalue border" colspan="2">Express Zuschlag 25%</td>
            <td class="tdvalue border align-right"><?= number_format($kosten['expressZuschlagPrice'], 2, '.', "'") ?></td>
          </tr>
        <?php endif; ?>
        <?php if (!empty($kosten['fahrzeugGpsPrice'])): ?>
          <tr>
            <td class="tdvalue border" colspan="2">Servicepauschale</td>
            <td class="tdvalue border align-right"><?= number_format($kosten['fahrzeugGpsPrice'], 2, '.', "'") ?></td>
          </tr>
        <?php endif; ?>
        <?php if (!empty($kosten['zuschlagFormatPrice'])): ?>
          <tr>
            <td class="tdvalue border" colspan="2"><?= htmlspecialchars($kosten['zuschlagFormatAnzeigeText'] ?? 'Formatzuschlag') ?></td>
            <td class="tdvalue border align-right"><?= number_format($kosten['zuschlagFormatPrice'], 2, '.', "'") ?></td>
          </tr>
        <?php endif; ?>
        <?php if (!empty($kosten['flyerAbholungPrice'])): ?>
          <tr>
            <td class="tdvalue border" colspan="2">Flyer Abholung</td>
            <td class="tdvalue border align-right"><?= number_format($kosten['flyerAbholungPrice'], 2, '.', "'") ?></td>
          </tr>
        <?php endif; ?>
        <?php if (!empty($kosten['ausgleichKleinauftragPrice'])): ?>
          <tr>
            <td class="tdvalue border" colspan="2">Ausgleich Kleinauftrag</td>
            <td class="tdvalue border align-right"><?= number_format($kosten['ausgleichKleinauftragPrice'], 2, '.', "'") ?></td>
          </tr>
        <?php endif; ?>
      <?php endif; ?>
      
      <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
      <tr>
        <td class="tdvalue border" colspan="2">Zwischensumme</td>
        <td class="tdvalue border align-right"><?= number_format($kosten['subTotalDistribution'] ?? 0, 2, '.', "'") ?></td>
      </tr>
      <tr>
        <td class="tdvalue border" colspan="2">MwSt.</td>
        <td class="tdvalue border align-right"><?= number_format($kosten['taxAmount'] ?? 0, 2, '.', "'") ?></td>
      </tr>
      <tr>
        <td class="tdvalue border text-bold" colspan="2">Total provisorisch CHF</td>
        <td class="tdvalue border align-right text-bold"><?= number_format($kosten['grandTotalCalculated'] ?? 0, 2, '.', "'") ?></td>
      </tr>
    </table>
  <?php
  endif;
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Anfrage</title>
  <style>
    body { font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 16px; line-height: 1.2; color: #333333; }
    table { border-collapse: collapse; width: 100%; }
    table td { font-family: sans-serif; vertical-align: middle; padding: 8px 0px; }
    table .tdlabel { font-size: 10px !important; letter-spacing: 0.5px; font-weight: 600; text-transform: uppercase; color: #666666; padding: 8px 0px 2px 0px; }
    table .tdvalue { font-size: 14px !important; padding: 8px 0px 6px 0px; }
    .container { margin: 0 auto !important; max-width: 600px; padding: 24px 0; width: 600px; }
    .main { background: #ffffff; border: 1px solid #dddddd; border-radius: 2px; width: 100%; }
    .wrapper { padding: 24px; }
    .header { padding: 36px 24px 18px 24px; border-bottom: 1px solid #dddddd; }
    .footer { padding-top: 24px; }
    .footer td { color: #9a9ea6; font-size: 14px !important;; }
    p { margin: 0 0 18px 0; }
    a { color: #0867ec; }
    .title { font-weight: bold; font-size: 20px; }
    .headline { font-family: "Montserrat", sans-serif; text-transform: uppercase; font-size: 14px !important; letter-spacing: 0.5px; font-weight: bold; color: #212529; margin-top: 24px; margin-bottom: 12px; border-top: 2px solid #dddddd; padding-top: 12px}
    .border { border-bottom: 1px solid #dddddd; }
    .align-top { vertical-align: top !important; }
    .align-right { text-align: right !important; }
    .text-bold { font-weight: bold !important; }
  </style>
</head>
<body>
<table role="presentation" border="0" cellpadding="0" cellspacing="0">
  <tr>
    <td>&nbsp;</td>
    <td class="container">
      <div class="content">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="main">
          <tr>
            <td class="wrapper header">
              <img width="220" src="https://www.flyer-verteilen.ch/wp-content/uploads/2025/10/logo-fv-cloud.png" alt="Logo">
            </td>
          </tr>
          <tr>
            <td class="wrapper">
              <p class="title">Anfrage <?= htmlspecialchars($reference) ?></p>
              
              <img width="100%" style="padding-bottom: 24px" src="https://www.flyer-verteilen.ch/wp-content/uploads/2025/10/mail-header-02.png" alt="Header">
              
              <p>Grüezi <?= htmlspecialchars($kontakt['salutation'] ?? '') ?> <?= htmlspecialchars($kontakt['lastName'] ?? '') ?>,</p>
              <p>Wir haben Ihre Anfrage erhalten. Diese wird von unseren Mitarbeitern so rasch als möglich bearbeitet. Sie erhalten dann eine verbindliche Offerte via E-Mail.</p>
              
              <?php render_perimeter_block($verteilgebiet); ?>
              
              Bei Fragen oder Unklarheiten sind wir gerne persönlich für Sie da. Sie erreichen uns telefonisch unter <a href="tel:+41782480448">078 248 04 48</a> oder via E-Mail an <a href="mailto:info@flyer-verteilen.ch">info@flyer-verteilen.ch</a>
              
              <br><br>
              <p>Herzlichen Dank für Ihr Vertrauen.<br>Freundliche Grüsse.</p>
              <p>Ihr Team von Top Flyer Verteilen</p>
              
              <!-- *** KORREKTUR: Umstellung auf CID-Einbettung *** -->
              <!-- Diese Variable '$view_url' wird vom OfferProcessor immer bereitgestellt -->
              <?php if (!empty($view_url)): ?>
                <p class="headline">QR-Code & Link</p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="tdlabel">QR-Code</td>
                    <td class="tdlabel" style="padding-left: 18px;">Link zur Anfrage</td>
                  </tr>
                  <tr>
                    <!--
                      Das 'src' verweist auf 'cid:qr_image'.
                      Der EmailService hängt das Bild mit genau dieser ID an.
                      Dies funktioniert in allen E-Mail-Clients, inkl. Outlook.
                    -->
                    <td class="tdvalue border"><img src="cid:qr_image" alt="QR Code zur Offerte" width="150" height="150"></td>
                    <td class="tdvalue border align-top" style="padding-left: 18px;"><a href="<?= htmlspecialchars($view_url) ?>">REF <?= htmlspecialchars($reference) ?></a></td>
                  </tr>
                </table>
                <br>
              <?php endif; ?>
              <!-- *** ENDE DER KORREKTUR *** -->
              
              <?php render_contact_block($kontakt); ?>
              <br>
              <p class="title">Leistungen</p>
              
              <?php render_design_block($produktion, $kosten); ?>
              <br>
              <?php render_print_block($produktion); ?>
              <br>
              <?php render_distribution_block($verteilgebiet, $kosten, $produktion); ?>
            
            </td>
          </tr>
        </table>
        <div class="footer">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span>Top Flyerverteilen GmbH<br>Hagenholzstrasse 108B<br>8050 Zürich</span><br>
                <a href="mailto:info@flyer-verteilen.ch">info@flyer-verteilen.ch</a> · <a href="tel:+41782480448">078 248 04 48</a><br><br>
                <span>Handelsregister: CHE-266.456.900</span><br>
                <a href="https://www.flyer-verteilen.ch">www.flyer-verteilen.ch</a><br><br>
              </td>
            </tr>
          </table>
        </div>
      </div>
    </td>
    <td>&nbsp;</td>
  </tr>
</table>
</body>
</html>
