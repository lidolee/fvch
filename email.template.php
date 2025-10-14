<?php
// Template Helper Functions, co-located with the template for maintainability.

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
  if ($printOption !== 'service' || empty($produktion['printServiceDetails']['format'])) {
    echo '<p class="headline">Flyer Druck</p><p>Kein Druck bestellt.</p>';
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

function render_distribution_block(array $verteilgebiet, array $kosten): void {
  ?>
  <p class="headline">Flyer Verteilung</p>
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
    
    <!-- Surcharges Section -->
    <?php
    $surchargesExist = !empty($kosten['expressZuschlagPrice']) || !empty($kosten['fahrzeugGpsPrice']) || !empty($kosten['zuschlagFormatPrice']) || !empty($kosten['flyerAbholungPrice']) || !empty($kosten['ausgleichKleinauftragPrice']);
    ?>
    <?php if ($surchargesExist): ?>
      <tr><td colspan="3">&nbsp;</td></tr>
      <tr><td class="tdlabel" colspan="3">Zuschläge &amp; Pauschalen</td></tr>
      <?php if (!empty($kosten['expressZuschlagPrice'])): ?>
        <tr>
          <td class="tdvalue border" colspan="2">Express Zuschlag 50%</td>
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
      <td class="tdvalue border" colspan="2">Zwischensumme Verteilung</td>
      <td class="tdvalue border align-right"><?= number_format($kosten['subTotalDistribution'] ?? 0, 2, '.', "'") ?></td>
    </tr>
    <tr>
      <td class="tdvalue border" colspan="2">MwSt.</td>
      <td class="tdvalue border align-right"><?= number_format($kosten['taxAmount'] ?? 0, 2, '.', "'") ?></td>
    </tr>
    <tr>
      <td class="tdvalue border text-bold" colspan="2">Summe Total in CHF</td>
      <td class="tdvalue border align-right text-bold"><?= number_format($kosten['grandTotalCalculated'] ?? 0, 2, '.', "'") ?></td>
    </tr>
  </table>
  <?php
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Anfrage</title>
  <style>
    body { font-family: sans-serif; -webkit-font-smoothing: antialiased; font-size: 16px; line-height: 100%; color: #333333; }
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
    .title { font-weight: bold; font-size: 24px; }
    .headline { font-size: 16px !important; font-weight: bold; margin-bottom: 8px; }
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
              <p>Guten Tag <?= htmlspecialchars($kontakt['salutation'] ?? '') ?> <?= htmlspecialchars($kontakt['lastName'] ?? '') ?>,</p>
              <p>Wir haben Ihre Anfrage erhalten. Diese wird von unseren Mitarbeitern so rasch als möglich bearbeitet. Sie erhalten dann eine verbindliche Offerte via E-Mail.</p>
              
              <?php if (!empty($qr_code_html)): ?>
                <p class="headline">QR-Code & Link</p>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="tdlabel">QR-Code</td>
                    <td class="tdlabel">Link zur Anfrage</td>
                  </tr>
                  <tr>
                    <td class="tdvalue border"><?= $qr_code_html ?></td>
                    <td class="tdvalue border align-top"><a href="<?= htmlspecialchars($view_url) ?>"><?= htmlspecialchars($view_url) ?></a></td>
                  </tr>
                </table>
                <br>
              <?php endif; ?>
              
              <?php render_contact_block($kontakt); ?>
              <br>
              <p class="title">Dienstleistungen</p>
              
              <?php render_design_block($produktion, $kosten); ?>
              <br>
              <?php render_print_block($produktion); ?>
              <br>
              <?php render_distribution_block($verteilgebiet, $kosten); ?>
              
              <br><br>
              <p>Herzlichen Dank für Ihr Vertrauen.<br>Freundliche Grüsse.</p>
              <p>Ihr Team von Flyer Verteilen</p>
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
