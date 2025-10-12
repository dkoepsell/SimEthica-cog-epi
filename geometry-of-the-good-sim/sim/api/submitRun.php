<?php
// sim/api/submitRun.php
// Saves run data to sim/data/runs/ as CSV (and optional meta.json)

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');      // keep errors out of response
ini_set('log_errors', '1');          // send to PHP error log

header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
  exit;
}

// Resolve target dir: sim/api/ -> sim/data/runs/
$baseDir = realpath(__DIR__ . '/../data');
if ($baseDir === false) {
  // try to create sim/data when absent
  $parent = realpath(__DIR__ . '/..');
  if ($parent === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot resolve sim/ directory']);
    exit;
  }
  $baseDir = $parent . '/data';
  @mkdir($baseDir, 0775, true);
}
$runsDir = $baseDir . '/runs';
if (!is_dir($runsDir)) {
  @mkdir($runsDir, 0775, true);
}
if (!is_dir($runsDir) || !is_writable($runsDir)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'runs/ is not writable']);
  exit;
}

// Helpers
function clean($s) { return preg_replace('/[^A-Za-z0-9_\-\.:T]/', '-', (string)$s); }
function now_iso() {
  $dt = new DateTime('now', new DateTimeZone('UTC'));
  return $dt->format('Y-m-d\TH-i-s-u\Z');
}

// Decide payload type
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$isMultipart = stripos($contentType, 'multipart/form-data') !== false;
$isJSON      = stripos($contentType, 'application/json') !== false;

// Common meta fields (scenario / timestamp if provided)
$scenario = 'unknown';
$ts = now_iso();

if ($isMultipart) {
  // ---- Multipart path: expect files agent_csv & obligation_csv, optional meta JSON string ----
  $meta = null;
  if (isset($_POST['meta'])) {
    $meta = json_decode($_POST['meta'], true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($meta)) {
      if (isset($meta['scenario'])) $scenario = clean($meta['scenario']);
      if (isset($meta['timestamp'])) $ts = clean((string)$meta['timestamp']);
    }
  }

  // Validate uploads
  if (empty($_FILES['agent_csv']) || empty($_FILES['obligation_csv'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing agent_csv or obligation_csv']);
    exit;
  }

  $a = $_FILES['agent_csv'];
  $o = $_FILES['obligation_csv'];

  if ($a['error'] !== UPLOAD_ERR_OK || $o['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Upload error', 'agent_err' => $a['error'], 'obl_err' => $o['error']]);
    exit;
  }

  // Write files
  $agentName = sprintf('agentLog_%s_%s.csv', $scenario, $ts);
  $oblName   = sprintf('obligationLog_%s_%s.csv', $scenario, $ts);
  $pathA = $runsDir . '/' . $agentName;
  $pathO = $runsDir . '/' . $oblName;

  $okA = move_uploaded_file($a['tmp_name'], $pathA);
  $okO = move_uploaded_file($o['tmp_name'], $pathO);

  if (!$okA || !$okO) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Failed to save uploads', 'agent_path' => $pathA, 'obl_path' => $pathO]);
    exit;
  }

  // Optional meta.json for context
  if ($meta) {
    $metaPath = $runsDir . '/' . sprintf('meta_%s_%s.json', $scenario, $ts);
    @file_put_contents($metaPath, json_encode($meta, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
  }

  echo json_encode(['ok' => true, 'agent' => basename($pathA), 'obligation' => basename($pathO), 'mode' => 'multipart']);
  exit;

} elseif ($isJSON) {
  // ---- JSON path: expect { meta, agentLog, obligationLog } ----
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
  }

  $meta = $data['meta'] ?? null;
  if (is_array($meta)) {
    if (isset($meta['scenario'])) $scenario = clean($meta['scenario']);
    if (isset($meta['timestamp'])) $ts = clean((string)$meta['timestamp']);
  }

  $agentLog = $data['agentLog'] ?? null;
  $oblLog   = $data['obligationLog'] ?? null;

  if (!is_array($agentLog) || !is_array($oblLog)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'JSON must include agentLog and obligationLog arrays']);
    exit;
  }

  // Convert arrays-of-objects to CSV strings
  $toCsv = function(array $rows): string {
    if (empty($rows)) return "";
    $headers = array_keys((array)$rows[0]);
    $out = fopen('php://temp', 'r+');
    fputcsv($out, $headers);
    foreach ($rows as $r) {
      $line = [];
      foreach ($headers as $h) { $line[] = is_scalar($r[$h] ?? null) ? $r[$h] : json_encode($r[$h] ?? null); }
      fputcsv($out, $line);
    }
    rewind($out);
    return stream_get_contents($out);
  };

  $agentCsv = $toCsv($agentLog);
  $oblCsv   = $toCsv($oblLog);

  $pathA = $runsDir . '/' . sprintf('agentLog_%s_%s.csv', $scenario, $ts);
  $pathO = $runsDir . '/' . sprintf('obligationLog_%s_%s.csv', $scenario, $ts);

  $okA = @file_put_contents($pathA, $agentCsv) !== false;
  $okO = @file_put_contents($pathO, $oblCsv) !== false;

  if (!$okA || !$okO) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to write CSV files']);
    exit;
  }

  if ($meta) {
    $metaPath = $runsDir . '/' . sprintf('meta_%s_%s.json', $scenario, $ts);
    @file_put_contents($metaPath, json_encode($meta, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
  }

  echo json_encode(['ok' => true, 'agent' => basename($pathA), 'obligation' => basename($pathO), 'mode' => 'json']);
  exit;

} else {
  http_response_code(415);
  echo json_encode(['ok' => false, 'error' => 'Unsupported Content-Type']);
  exit;
}
