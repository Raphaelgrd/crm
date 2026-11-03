<?php
// Stockage des fichiers de la Data Room du CRM Netforce, sur l'hébergement o2switch.
// Seul le serveur du CRM peut l'utiliser : chaque demande est signée avec le secret partagé
// (FILES_SECRET dans Vercel = 'secret' dans config.php) et expire après quelques minutes.
// Les fichiers sont rangés en morceaux de 900 Ko, hors du dossier web (jamais accessibles par une URL).
//
// Opérations (paramètres dans l'URL) : op=ping | put | get | has | del, id, i, exp, sig.

declare(strict_types=1);

const MAX_CHUNK = 1048576; // 1 Mo (les morceaux du CRM font 900 Ko)
const MAX_INDEX = 1000;

function reply(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) reply(500, ['error' => 'config.php manquant à côté de index.php']);
$config = require $configFile;
$secret = is_array($config) ? (string)($config['secret'] ?? '') : '';
if (strlen($secret) < 32) reply(500, ['error' => 'Secret absent ou trop court dans config.php (32 caractères minimum)']);
$dataDir = rtrim((string)($config['data_dir'] ?? (dirname(__DIR__) . '/netforce-dataroom')), '/');

$op = (string)($_GET['op'] ?? '');
$id = (string)($_GET['id'] ?? '');
$i = (string)($_GET['i'] ?? '0');
$exp = (string)($_GET['exp'] ?? '');
$sig = (string)($_GET['sig'] ?? '');

// Signature : HMAC-SHA256(secret, "op\nid\ni\nexp"), valable jusqu'à exp (secondes), 1 h maximum.
$now = time();
if (!ctype_digit($exp) || (int)$exp < $now || (int)$exp > $now + 3600) reply(401, ['error' => 'Lien expiré']);
$expected = hash_hmac('sha256', "$op\n$id\n$i\n$exp", $secret);
if (!hash_equals($expected, $sig)) reply(401, ['error' => 'Signature invalide']);

if ($op === 'ping') {
    if (!is_dir($dataDir) && !@mkdir($dataDir, 0700, true)) reply(500, ['error' => 'Impossible de créer le dossier de stockage']);
    if (!is_writable($dataDir)) reply(500, ['error' => 'Dossier de stockage non accessible en écriture']);
    $free = @disk_free_space($dataDir);
    reply(200, ['ok' => true, 'free' => $free === false ? null : (int)$free, 'php' => PHP_VERSION]);
}

if (!preg_match('/^f_[a-z0-9_]{4,60}$/', $id)) reply(400, ['error' => 'Identifiant invalide']);
if (!ctype_digit($i) || (int)$i >= MAX_INDEX) reply(400, ['error' => 'Numéro de morceau invalide']);
$dir = $dataDir . '/' . $id;
$path = $dir . '/' . (int)$i . '.bin';

switch ($op) {
    case 'put':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['error' => 'POST attendu']);
        $body = file_get_contents('php://input', false, null, 0, MAX_CHUNK + 1);
        if ($body === false || $body === '') reply(400, ['error' => 'Morceau vide']);
        if (strlen($body) > MAX_CHUNK) reply(413, ['error' => 'Morceau trop gros']);
        if (!is_dir($dir) && !@mkdir($dir, 0700, true)) reply(500, ['error' => 'Impossible de créer le dossier']);
        $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (file_put_contents($tmp, $body, LOCK_EX) !== strlen($body) || !rename($tmp, $path)) {
            @unlink($tmp);
            reply(500, ['error' => 'Écriture impossible (disque plein ?)']);
        }
        reply(200, ['ok' => true, 'size' => strlen($body), 'sha256' => hash('sha256', $body)]);

    case 'get':
        if (!is_file($path)) reply(404, ['error' => 'Morceau introuvable']);
        http_response_code(200);
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: no-store');
        readfile($path);
        exit;

    case 'has':
        reply(200, ['exists' => is_file($path), 'size' => is_file($path) ? filesize($path) : 0]);

    case 'del':
        if (is_dir($dir)) {
            foreach (glob($dir . '/*') ?: [] as $f) @unlink($f);
            @rmdir($dir);
        }
        reply(200, ['ok' => true]);

    default:
        reply(400, ['error' => 'Opération inconnue']);
}
