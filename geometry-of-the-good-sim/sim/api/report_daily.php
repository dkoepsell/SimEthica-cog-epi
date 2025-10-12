<?php
// =====================
// SimEthica Daily Report (cron-safe + optional AI Interpretation)
// =====================

// diagnostics (errors go to server log, not browser)
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// ---------- CONFIG ----------
$TZ = 'America/Chicago';
date_default_timezone_set($TZ);

// Paths (this file: /public_html/geometry-of-the-good-sim/sim/api/report_daily.php)
$BASE_DIR    = realpath(__DIR__ . '/..');     // /.../sim
$DATA_DIR    = $BASE_DIR . '/data';           // /.../sim/data
$RUNS_DIR    = $DATA_DIR . '/runs';           // /.../sim/data/runs
$OUT_DIR     = $DATA_DIR . '/summaries';      // /.../sim/data/summaries
$REPORT_HTML = $DATA_DIR . '/daily_report.html';

// Public archive
$PUBLIC_DIR  = $BASE_DIR . '/reports';        // /.../sim/reports

$ADMIN_EMAIL = 'drkoepsell@tamu.edu';
$FROM_EMAIL  = 'no-reply@davidkoepsell.com';
$SITE_TITLE  = 'SimEthica Daily Report';

// ---------- OPENAI ----------
 $OPENAI_API_KEY = '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';
$OPENAI_MODEL = 'gpt-4o-mini';

// ---------- Feature flag (cron-safe) ----------
$ENABLE_AI = !(
  (isset($_GET['noai']) && $_GET['noai'] == '1') ||
  getenv('AI_ENABLED') === '0'
);

// ---------- Ensure directories ----------
foreach ([$DATA_DIR, $OUT_DIR, $PUBLIC_DIR] as $dir) {
  if (!is_dir($dir)) {
    if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
      header("HTTP/1.1 500 Internal Server Error");
      echo "ERROR: Cannot create directory: $dir\n";
      exit;
    }
  }
}

// ---------- UTIL ----------
function csv_rows($path) {
  $rows=[]; if (($h=fopen($path,'r'))!==false){
    $header=fgetcsv($h);
    if(!$header){ fclose($h); return $rows; }
    while(($r=fgetcsv($h))!==false){
      if (count($r)!==count($header)) continue;
      $rows[] = array_combine($header,$r);
    }
    fclose($h);
  } return $rows;
}
function glob_today($dir,$prefix,$ext,$dateYmd){
  $pat = sprintf('%s/%s*_%s*%s', rtrim($dir,'/'), $prefix, $dateYmd, $ext);
  return glob($pat) ?: [];
}
function scenario_key_from_name($path,$prefix){
  $b = basename($path);
  if (preg_match('/^'.preg_quote($prefix,'/').'([^_]+)_\d{4}-\d{2}-\d{2}T/',$b,$m)) return $m[1];
  return 'unknown';
}
function safe_float($row,$k){ return isset($row[$k]) && $row[$k]!=='' ? floatval($row[$k]) : 0.0; }
function safe_int($row,$k){ return isset($row[$k]) && $row[$k]!=='' ? intval($row[$k]) : 0; }
function group_stats($rows,$groupKey){
  $acc=[];
  foreach ($rows as $r){
    $g = isset($r[$groupKey]) && $r[$groupKey]!=='' ? $r[$groupKey] : '—';
    if (!isset($acc[$g])) $acc[$g] = ['n'=>0,'conflict'=>0,'debt'=>0,'attempts'=>0,'successes'=>0];
    $acc[$g]['n']++;
    $acc[$g]['conflict'] += safe_float($r,'conflict');
    $acc[$g]['debt']     += safe_float($r,'debt');
    $acc[$g]['attempts'] += safe_int($r,'attempts');
    $acc[$g]['successes']+= safe_int($r,'successes');
  }
  $out=[];
  foreach ($acc as $g=>$a){
    $sr = ($a['attempts']>0) ? ($a['successes']/$a['attempts']) : null;
    $out[$g] = [
      'n' => $a['n'],
      'avgConflict' => $a['n']? $a['conflict']/$a['n'] : null,
      'avgDebt'     => $a['n']? $a['debt']/$a['n'] : null,
      'successRate' => $sr
    ];
  }
  ksort($out);
  return $out;
}

// ---------- WHICH DAY ----------
$now = new DateTimeImmutable('now');
$cutoffHour = 6; // summarize “yesterday” if before 6am local
$targetDate = ($now->format('G') < $cutoffHour)
  ? $now->sub(new DateInterval('P1D'))->format('Y-m-d')
  : $now->format('Y-m-d');

// ---------- FIND FILES ----------
$agentFiles = glob_today($RUNS_DIR,'agentLog_','.csv',$targetDate);
$oblFiles   = glob_today($RUNS_DIR,'obligationLog_','.csv',$targetDate);
$metaFiles  = glob_today($RUNS_DIR,'meta_','.json',$targetDate);

// ---------- AGGREGATE BY SCENARIO ----------
$byScenario = [];
foreach ($agentFiles as $p){ $k=scenario_key_from_name($p,'agentLog_'); $byScenario[$k]['agent'][]=$p; }
foreach ($oblFiles as $p){   $k=scenario_key_from_name($p,'obligationLog_'); $byScenario[$k]['obligation'][]=$p; }
foreach ($metaFiles as $p){  $k=scenario_key_from_name($p,'meta_'); $byScenario[$k]['meta'][]=$p; }

$report = ['date'=>$targetDate,'tz'=>$TZ,'scenarios'=>[]];

foreach ($byScenario as $scenario=>$files) {
  $m = [
    'runs' => count($files['meta'] ?? []),
    'agent_snapshot_rows' => 0,
    'agents' => [
      'avg_conflict'=>null,'max_conflict'=>null,
      'avg_debt'=>null,'max_debt'=>null,
      'avg_trustCount'=>null,'avg_trustMax'=>null,
      'avg_momentum'=>null,
      'attempts'=>0,'successes'=>0,'success_rate'=>null
    ],
    'breakdowns' => [
      'normPref'=>[],
      'moralStance'=>[],
      'role'=>[]
    ],
    'obligations'=>[
      'rows'=>0,
      'issued'=>0,'fulfilled'=>0,'denied'=>0,'expired'=>0,'repaired'=>0,
      'avg_strength'=>null,
      'completion_rate'=>null,'denial_rate'=>null,'expiry_rate'=>null,'repair_rate'=>null
    ],
    'params'=>[]
  ];

  // merge meta
  if (!empty($files['meta'])) {
    foreach ($files['meta'] as $mp) {
      $j = json_decode(@file_get_contents($mp), true);
      if (is_array($j)) $m['params'] = array_merge($m['params'], $j);
    }
  }

  // agent snapshot: last generation rows only
  $snapRows = [];
  foreach ($files['agent'] ?? [] as $ap) {
    $rows = csv_rows($ap);
    if (!$rows) continue;
    $maxGen = 0;
    foreach ($rows as $r){ $g = safe_int($r,'generation'); if ($g>$maxGen) $maxGen=$g; }
    foreach ($rows as $r){ if (safe_int($r,'generation') === $maxGen) $snapRows[] = $r; }
  }
  $m['agent_snapshot_rows'] = count($snapRows);

  if ($snapRows){
    $sumC=$sumD=$sumTC=$sumTM=$sumMom=0; $maxC=null; $maxD=null; $sumAtt=0; $sumSuc=0;
    foreach ($snapRows as $r){
      $c  = safe_float($r,'conflict');   $sumC += $c;  $maxC = is_null($maxC)?$c:max($maxC,$c);
      $d  = safe_float($r,'debt');       $sumD += $d;  $maxD = is_null($maxD)?$d:max($maxD,$d);
      $tc = safe_float($r,'trustCount'); $sumTC += $tc;
      $tm = safe_float($r,'trustMax');   $sumTM += $tm;
      $mo = safe_float($r,'momentum');   $sumMom+= $mo;
      $att= safe_int($r,'attempts');     $sumAtt+= $att;
      $suc= safe_int($r,'successes');    $sumSuc+= $suc;
    }
    $n = count($snapRows);
    $m['agents']['avg_conflict']   = $n? $sumC/$n : null;
    $m['agents']['max_conflict']   = $maxC;
    $m['agents']['avg_debt']       = $n? $sumD/$n : null;
    $m['agents']['max_debt']       = $maxD;
    $m['agents']['avg_trustCount'] = $n? $sumTC/$n : null;
    $m['agents']['avg_trustMax']   = $n? $sumTM/$n : null;
    $m['agents']['avg_momentum']   = $n? $sumMom/$n : null;
    $m['agents']['attempts']       = $sumAtt;
    $m['agents']['successes']      = $sumSuc;
    $m['agents']['success_rate']   = ($sumAtt>0)? ($sumSuc/$sumAtt) : null;

    $m['breakdowns']['normPref']    = group_stats($snapRows,'normPref');
    $m['breakdowns']['moralStance'] = group_stats($snapRows,'moralStance');

    $roleCounts=[];
    foreach ($snapRows as $r){ $role = $r['role'] ?? '—'; $roleCounts[$role] = ($roleCounts[$role] ?? 0) + 1; }
    ksort($roleCounts);
    $m['breakdowns']['role'] = $roleCounts;
  }

  // obligations: per-row totals
  $oblRows=0; $strengthSum=0; $issued=0; $fulfilled=0; $denied=0; $expired=0; $repaired=0;
  foreach ($files['obligation'] ?? [] as $op) {
    $rows = csv_rows($op);
    $oblRows += count($rows);
    foreach ($rows as $r){
      $status = isset($r['status']) ? strtolower(trim($r['status'])) : '';
      $strength = isset($r['strength']) ? floatval($r['strength']) : null;
      if ($strength !== null) $strengthSum += $strength;
      $issued++;
      if ($status==='fulfilled') $fulfilled++;
      elseif ($status==='denied') $denied++;
      elseif ($status==='expired') $expired++;
      elseif ($status==='repaired') $repaired++;
    }
  }
  $m['obligations']['rows']        = $oblRows;
  $m['obligations']['issued']      = $issued;
  $m['obligations']['fulfilled']   = $fulfilled;
  $m['obligations']['denied']      = $denied;
  $m['obligations']['expired']     = $expired;
  $m['obligations']['repaired']    = $repaired;
  $m['obligations']['avg_strength']= $oblRows ? ($strengthSum/$oblRows) : null;
  if ($issued>0){
    $m['obligations']['completion_rate'] = $fulfilled/$issued;
    $m['obligations']['denial_rate']     = $denied/$issued;
    $m['obligations']['expiry_rate']     = $expired/$issued;
    $m['obligations']['repair_rate']     = $repaired/$issued;
  }

  $report['scenarios'][$scenario] = $m;
}

// ---------- WRITE JSON SNAPSHOT ----------
$summaryPath = sprintf('%s/summary_%s.json', $OUT_DIR, $targetDate);
file_put_contents($summaryPath, json_encode($report, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));

// ---------- HTML (base; AI appended later) ----------
ob_start(); ?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title><?=htmlspecialchars($SITE_TITLE)?> — <?=$targetDate?></title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root{--ink:#222;--muted:#666;--line:#eee;--bg:#fafafa;--brand:#222;}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif;margin:0;color:var(--ink);background:var(--bg)}
    header{display:flex;align-items:center;gap:12px;padding:12px 20px;background:var(--brand);color:#fff;position:sticky;top:0;z-index:10}
    header .logo{font-weight:800;letter-spacing:.3px}
    header .right{margin-left:auto;opacity:.85}
    main{padding:24px}
    h1{margin:0 0 4px} .sub{color:var(--muted);margin:0 0 16px}
    .card{border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,0.04);background:#fff}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    table{border-collapse:collapse;width:100%;margin:8px 0} th,td{border-bottom:1px solid #f1f1f1;padding:8px;text-align:left}
    th{background:#fbfbfb}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#f5f5f5;color:#333}
    .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
    .ai{background:#fbfbfb;border:1px dashed #ddd}
  </style>
</head>
<body>
  <header>
    <div class="logo">SimEthica</div>
    <div style="font-weight:600">Daily Reports</div>
    <div class="right">© David Koepsell</div>
  </header>

  <main>
    <h1><?=$SITE_TITLE?></h1>
    <p class="sub">Date: <strong><?=$targetDate?></strong> <span class="pill"><?=$TZ?></span></p>

    <?php if (empty($report['scenarios'])): ?>
      <div class="card">No files found for <?=$targetDate?> in <span class="mono"><?=htmlspecialchars($RUNS_DIR)?></span>.</div>
    <?php endif; ?>

    <?php foreach ($report['scenarios'] as $name=>$m): ?>
    <div class="card">
      <h2>Scenario: <?=htmlspecialchars($name)?></h2>

      <div class="grid">
        <div><strong>Runs</strong><br><?=number_format($m['runs'])?></div>
        <div><strong>Agent snapshot rows</strong><br><?=number_format($m['agent_snapshot_rows'])?></div>
        <div><strong>Obligation rows</strong><br><?=number_format($m['obligations']['rows'])?></div>
      </div>

      <h3>Agent snapshot (last generation of each file)</h3>
      <table>
        <tr>
          <th>Avg Conflict</th><th>Max Conflict</th>
          <th>Avg Debt</th><th>Max Debt</th>
          <th>Avg TrustCount</th><th>Avg TrustMax</th>
          <th>Avg Momentum</th><th>Success Rate</th>
        </tr>
        <tr>
          <td><?=isset($m['agents']['avg_conflict'])?number_format($m['agents']['avg_conflict'],3):'—'?></td>
          <td><?=isset($m['agents']['max_conflict'])?number_format($m['agents']['max_conflict'],3):'—'?></td>
          <td><?=isset($m['agents']['avg_debt'])?number_format($m['agents']['avg_debt'],3):'—'?></td>
          <td><?=isset($m['agents']['max_debt'])?number_format($m['agents']['max_debt'],3):'—'?></td>
          <td><?=isset($m['agents']['avg_trustCount'])?number_format($m['agents']['avg_trustCount'],2):'—'?></td>
          <td><?=isset($m['agents']['avg_trustMax'])?number_format($m['agents']['avg_trustMax'],2):'—'?></td>
          <td><?=isset($m['agents']['avg_momentum'])?number_format($m['agents']['avg_momentum'],3):'—'?></td>
          <td><?php echo isset($m['agents']['success_rate']) && $m['agents']['success_rate']!==null
            ? number_format(100*$m['agents']['success_rate'],1).'%' : '—'; ?></td>
        </tr>
      </table>

      <h3>Breakdown by <code>normPref</code></h3>
      <table>
        <tr><th>normPref</th><th>n</th><th>Avg Conflict</th><th>Avg Debt</th><th>Success Rate</th></tr>
        <?php foreach ($m['breakdowns']['normPref'] as $k=>$v): ?>
        <tr>
          <td><?=htmlspecialchars($k)?></td>
          <td><?=number_format($v['n'])?></td>
          <td><?=isset($v['avgConflict'])?number_format($v['avgConflict'],3):'—'?></td>
          <td><?=isset($v['avgDebt'])?number_format($v['avgDebt'],3):'—'?></td>
          <td><?=isset($v['successRate']) && $v['successRate']!==null?number_format(100*$v['successRate'],1).'%' :'—'?></td>
        </tr>
        <?php endforeach; ?>
      </table>

      <h3>Breakdown by <code>moralStance</code></h3>
      <table>
        <tr><th>moralStance</th><th>n</th><th>Avg Conflict</th><th>Avg Debt</th><th>Success Rate</th></tr>
        <?php foreach ($m['breakdowns']['moralStance'] as $k=>$v): ?>
        <tr>
          <td><?=htmlspecialchars($k)?></td>
          <td><?=number_format($v['n'])?></td>
          <td><?=isset($v['avgConflict'])?number_format($v['avgConflict'],3):'—'?></td>
          <td><?=isset($v['avgDebt'])?number_format($v['avgDebt'],3):'—'?></td>
          <td><?=isset($v['successRate']) && $v['successRate']!==null?number_format(100*$v['successRate'],1).'%' :'—'?></td>
        </tr>
        <?php endforeach; ?>
      </table>

      <h3>Role mix</h3>
      <table>
        <tr><th>Role</th><th>Count</th></tr>
        <?php foreach ($m['breakdowns']['role'] as $k=>$v): ?>
        <tr><td><?=htmlspecialchars($k)?></td><td><?=number_format($v)?></td></tr>
        <?php endforeach; ?>
      </table>

      <h3>Obligations (day totals)</h3>
      <table>
        <tr><th>Issued</th><th>Fulfilled</th><th>Denied</th><th>Expired</th><th>Repaired</th><th>Avg Strength</th></tr>
        <tr>
          <td><?=number_format($m['obligations']['issued'])?></td>
          <td><?=number_format($m['obligations']['fulfilled'])?></td>
          <td><?=number_format($m['obligations']['denied'])?></td>
          <td><?=number_format($m['obligations']['expired'])?></td>
          <td><?=number_format($m['obligations']['repaired'])?></td>
          <td><?=isset($m['obligations']['avg_strength'])?number_format($m['obligations']['avg_strength'],3):'—'?></td>
        </tr>
      </table>
      <table>
        <tr><th>Completion</th><th>Denial</th><th>Expiry</th><th>Repair</th></tr>
        <tr>
          <td><?=isset($m['obligations']['completion_rate'])?number_format(100*$m['obligations']['completion_rate'],1).'%' :'—'?></td>
          <td><?=isset($m['obligations']['denial_rate'])?number_format(100*$m['obligations']['denial_rate'],1).'%' :'—'?></td>
          <td><?=isset($m['obligations']['expiry_rate'])?number_format(100*$m['obligations']['expiry_rate'],1).'%' :'—'?></td>
          <td><?=isset($m['obligations']['repair_rate'])?number_format(100*$m['obligations']['repair_rate'],1).'%' :'—'?></td>
        </tr>
      </table>

      <?php if (!empty($m['params'])): ?>
      <h3>Run parameters (merged)</h3>
      <div class="grid">
        <?php foreach ($m['params'] as $k=>$v): ?>
          <div><strong><?=htmlspecialchars($k)?></strong><br><?=is_scalar($v)?htmlspecialchars((string)$v):'[obj]'?></div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </div>
    <?php endforeach; ?>

<?php
// ===================== AI INTERPRETATION (optional, fail-soft) =====================
$ai_block_html = '';
$hasCurl = function_exists('curl_init');
// accept both classic and project-scoped keys; just make sure it's not a placeholder
$keyLooksValid = is_string($OPENAI_API_KEY)
  && preg_match('/^sk-/', $OPENAI_API_KEY)
  && stripos($OPENAI_API_KEY, 'PASTE_YOUR_OPENAI_API_KEY_HERE') === false;

if ($ENABLE_AI && $hasCurl && $keyLooksValid && !empty($report['scenarios'])) {
  $payload_json = json_encode($report, JSON_UNESCAPED_SLASHES);

  $prompt = "You are an expert simulation analyst for SimEthica.\n"
          . "Interpret the DAILY REPORT JSON across scenarios. Return:\n"
          . "1) 3–5 bullet takeaways (compare scenarios, call out standout metrics)\n"
          . "2) One-sentence diagnosis of system dynamics\n"
          . "3) 'what does this imply about obligation recognition and agent success' (max 3 short items)\n"
          . "Keep it under 180 words. Be concrete and avoid hedging.\n\n"
          . "DAILY REPORT JSON:\n" . $payload_json;

  $ch = curl_init("https://api.openai.com/v1/chat/completions");
  $post = [
    "model" => $OPENAI_MODEL,
    "temperature" => 0.2,
    "messages" => [
      ["role" => "system", "content" => "You are an expert in computational social science and experimental philosophy. Write crisp, technical insights."],
      ["role" => "user",   "content" => $prompt]
    ],
    "max_tokens" => 600
  ];
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
      "Content-Type: application/json",
      "Authorization: Bearer " . $OPENAI_API_KEY
    ],
    CURLOPT_POSTFIELDS => json_encode($post),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 15
  ]);
  $raw  = curl_exec($ch);
  $http = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $err  = curl_error($ch);
  curl_close($ch);

  if ($raw !== false && $http >= 200 && $http < 300) {
    $resp = json_decode($raw, true);
    $aiText = $resp['choices'][0]['message']['content'] ?? '';
    if ($aiText) {
      $ai_block_html = '<div class="card ai">'
        . '<h2>AI Interpretation (SimEthica)</h2>'
        . '<div style="white-space:pre-wrap;">' . nl2br(htmlspecialchars($aiText)) . '</div>'
        . '<small>Generated ' . htmlspecialchars($report['date']) . ' via OpenAI (' . htmlspecialchars($OPENAI_MODEL) . ')</small>'
        . '</div>';
    } else {
      $ai_block_html = "<!-- AI skipped: empty content -->";
    }
  } else {
    $ai_block_html = "<!-- AI skipped (HTTP $http; $err) -->";
  }
} else {
  $reason = !$ENABLE_AI ? 'disabled' : (!$hasCurl ? 'no-curl' : (!$keyLooksValid ? 'invalid-key' : 'no-scenarios'));
  $ai_block_html = "<!-- AI disabled or unavailable ($reason) -->";
}
echo $ai_block_html;
?>

  </main>
</body>
</html>
<?php
$html = ob_get_clean();

// ---------- Write “latest” report ----------
file_put_contents($REPORT_HTML, $html);

// ---------- Publish to public archive ----------
$PUBLIC_DAY = $PUBLIC_DIR . '/report_' . $targetDate . '.html';
file_put_contents($PUBLIC_DAY, $html);

// Rebuild archive index
$items = glob($PUBLIC_DIR . '/report_*.html');
rsort($items); // newest first

ob_start(); ?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>SimEthica Reports — Archive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif;margin:24px;color:#222}
    header{display:flex;align-items:baseline;gap:12px;margin-bottom:16px}
    .brand{background:#222;color:#fff;padding:6px 10px;border-radius:8px;font-weight:700}
    .list a{display:block;padding:8px 10px;border:1px solid #eee;border-radius:10px;margin:8px 0;text-decoration:none;color:#111}
    .list a:hover{background:#fafafa}
    iframe{width:100%; height:70vh; border:1px solid #eee; border-radius:12px}
    .hint{color:#666; margin:8px 0 16px}
  </style>
</head>
<body>
  <header>
    <div class="brand">SimEthica</div>
    <h1>Daily Reports</h1>
    <div style="margin-left:auto">© David Koepsell</div>
  </header>

  <p class="hint">Latest report embedded below. Browse previous reports from the list.</p>

  <?php if (!empty($items)): 
    $latest = basename($items[0]); ?>
    <iframe src="<?=htmlspecialchars($latest)?>"></iframe>
  <?php else: ?>
    <p>No reports yet.</p>
  <?php endif; ?>

  <h2>Archive</h2>
  <div class="list">
    <?php foreach ($items as $p): $b = basename($p); ?>
      <a href="<?=htmlspecialchars($b)?>"><?=htmlspecialchars(str_replace(['report_','.html'],'',$b))?></a>
    <?php endforeach; ?>
  </div>
</body>
</html>
<?php
$INDEX_HTML = ob_get_clean();
file_put_contents($PUBLIC_DIR . '/index.html', $INDEX_HTML);

// ---------- EMAIL ----------
$subject = "$SITE_TITLE — $targetDate";
$headers  = "MIME-Version: 1.0\r\n";
$headers .= "Content-type: text/html; charset=UTF-8\r\n";
$headers .= "From: $FROM_EMAIL\r\n";
@mail($ADMIN_EMAIL, $subject, $html, $headers);

// Final OK so cron-job.org sees success
echo "OK: $summaryPath\n";
