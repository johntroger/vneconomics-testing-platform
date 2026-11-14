<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Database & Core HTTP Utilities
 * Supports Multi-Level Config Loading (outside webroot on Plesk) and Dual PDO (SQLite WAL / MySQL).
 */

@ini_set('display_errors', '0');
@ini_set('html_errors', '0');

require_once __DIR__ . '/schema.php';

/**
 * Resolve application config using Multi-Level Config Loader:
 * checks ./config.php -> ../config.php -> ../../config.php -> ../../../config.php
 * (keeping secrets safe outside httpdocs on Plesk shared hosting).
 */
function getAppConfig(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $defaults = [
        'db_driver' => 'sqlite',
        'sqlite_path' => '',
        'mysql' => [
            'host' => 'localhost',
            'port' => 3306,
            'dbname' => 'vne35060_wp_udx1z',
            'charset' => 'utf8mb4',
            'username' => '',
            'password' => '',
        ],
        'admin_passcodes' => ['vne2026', '8888'],
        'hmac_secret' => hash('sha256', __DIR__ . '|vneconomics-testing-platform-default-secret'),
        'cors_origins' => [
            'https://staging-store.vneconomics.com',
            'https://vneconomics.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
        'default_instructor_email' => 'giangvien@vneconomics.com',
        'smtp' => [
            'enabled' => false,
            'host' => '',
            'port' => 465,
            'encryption' => 'ssl',
            'username' => '',
            'password' => '',
            'from_email' => 'noreply@vneconomics.com',
            'from_name' => 'VNEconomics Testing Platform',
            'timeout' => 12,
        ],
    ];

    $candidates = [
        __DIR__ . '/config.php',
        dirname(__DIR__) . '/config.php',
        dirname(__DIR__, 2) . '/config.php',
        dirname(__DIR__, 3) . '/config.php',
        dirname(__DIR__, 2) . '/.exam_config.php',
    ];

    $loaded = [];
    foreach ($candidates as $file) {
        if (is_file($file) && is_readable($file)) {
            $data = require $file;
            if (is_array($data)) {
                $loaded = $data;
                break;
            }
        }
    }

    $merged = array_replace_recursive($defaults, $loaded);
    if (isset($loaded['admin_passcodes']) && is_array($loaded['admin_passcodes'])) {
        $merged['admin_passcodes'] = array_values($loaded['admin_passcodes']);
    }

    $cached = $merged;
    return $cached;
}

function applyCorsHeaders(): void
{
    $cfg = getAppConfig();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = $cfg['cors_origins'] ?? [];

    if ($origin !== '' && (in_array($origin, $allowed, true) || str_starts_with($origin, 'http://localhost:') || str_starts_with($origin, 'http://127.0.0.1:'))) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    } else {
        header('Access-Control-Allow-Origin: *');
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Token, X-Requested-With');
    header('Access-Control-Max-Age: 3600');

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function jsonResponse(mixed $data, int $status = 200): never
{
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
    }
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonError(string $message, int $status = 400, array $extra = []): never
{
    jsonResponse(array_merge(['ok' => false, 'error' => $message], $extra), $status);
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        jsonError('Payload JSON không hợp lệ.', 400);
    }
    return $decoded;
}

function nowIso(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function generateId(string $prefix = 'id'): string
{
    return $prefix . '_' . bin2hex(random_bytes(8));
}

/**
 * Resolve SQLite storage path outside webroot when writable, falling back to protected ./data/.
 */
function resolveSqlitePath(array $cfg): string
{
    $custom = trim((string) ($cfg['sqlite_path'] ?? ''));
    if ($custom !== '') {
        $dir = dirname($custom);
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        return $custom;
    }

    // Outside webroot on Plesk: <domain_root>/.exam_data/vne_testing.sqlite
    $outsideDir = dirname(__DIR__, 2) . '/.exam_data';
    if (!is_dir($outsideDir)) {
        @mkdir($outsideDir, 0750, true);
    }
    if (is_dir($outsideDir) && is_writable($outsideDir)) {
        return $outsideDir . '/vne_testing.sqlite';
    }

    // Local fallback inside api/.data protected by .htaccess
    $localDir = __DIR__ . '/.data';
    if (!is_dir($localDir)) {
        @mkdir($localDir, 0750, true);
    }
    $htaccess = $localDir . '/.htaccess';
    if (!is_file($htaccess)) {
        @file_put_contents($htaccess, "Order deny,allow\nDeny from all\n");
    }
    return $localDir . '/vne_testing.sqlite';
}

function getDbDriver(): string
{
    $cfg = getAppConfig();
    $driver = strtolower((string) ($cfg['db_driver'] ?? 'sqlite'));
    return $driver === 'mysql' ? 'mysql' : 'sqlite';
}

function getDb(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = getAppConfig();
    $driver = getDbDriver();

    try {
        if ($driver === 'mysql') {
            $m = $cfg['mysql'];
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                $m['host'] ?? 'localhost',
                (int) ($m['port'] ?? 3306),
                $m['dbname'] ?? 'vne35060_wp_udx1z',
                $m['charset'] ?? 'utf8mb4'
            );
            $pdo = new PDO($dsn, (string) ($m['username'] ?? ''), (string) ($m['password'] ?? ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } else {
            $path = resolveSqlitePath($cfg);
            $pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec('PRAGMA journal_mode = WAL;');
            $pdo->exec('PRAGMA synchronous = NORMAL;');
            $pdo->exec('PRAGMA foreign_keys = ON;');
            $pdo->exec('PRAGMA busy_timeout = 5000;');
        }
    } catch (Throwable $e) {
        error_log('[VNE_TESTING_DB_ERROR] ' . $e->getMessage());
        jsonError('Không thể kết nối cơ sở dữ liệu hệ thống thi.', 500);
    }

    ensureExamSchema($pdo, $driver);
    return $pdo;
}
