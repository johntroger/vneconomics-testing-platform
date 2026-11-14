<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Admin Passcode Authentication (HMAC-SHA256 Bearer Token)
 */

require_once __DIR__ . '/db.php';

function base64UrlEncode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string|false
{
    $padded = str_pad(strtr($data, '-_', '+/'), strlen($data) % 4 === 0 ? strlen($data) : strlen($data) + 4 - (strlen($data) % 4), '=', STR_PAD_RIGHT);
    return base64_decode($padded, true);
}

function issueAdminToken(int $ttlSeconds = 43200): string
{
    $cfg = getAppConfig();
    $secret = (string) $cfg['hmac_secret'];
    $now = time();

    $payload = [
        'sub' => 'vne_admin',
        'role' => 'INSTRUCTOR',
        'iat' => $now,
        'exp' => $now + $ttlSeconds,
    ];

    $payloadB64 = base64UrlEncode((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = hash_hmac('sha256', $payloadB64, $secret, true);
    return $payloadB64 . '.' . base64UrlEncode($sig);
}

function verifyAdminToken(?string $token): bool
{
    if ($token === null || $token === '' || !str_contains($token, '.')) {
        return false;
    }

    [$payloadB64, $sigB64] = explode('.', $token, 2);
    $cfg = getAppConfig();
    $secret = (string) $cfg['hmac_secret'];

    $expectedSig = base64UrlEncode(hash_hmac('sha256', $payloadB64, $secret, true));
    if (!hash_equals($expectedSig, $sigB64)) {
        return false;
    }

    $payloadJson = base64UrlDecode($payloadB64);
    if ($payloadJson === false) {
        return false;
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload) || ($payload['sub'] ?? '') !== 'vne_admin') {
        return false;
    }

    return (int) ($payload['exp'] ?? 0) >= time();
}

function extractBearerToken(): ?string
{
    $headers = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? null,
    ];

    if (function_exists('apache_request_headers')) {
        $reqHeaders = apache_request_headers();
        if (is_array($reqHeaders)) {
            foreach ($reqHeaders as $k => $v) {
                $lk = strtolower((string) $k);
                if ($lk === 'authorization' || $lk === 'x-admin-token') {
                    $headers[] = $v;
                }
            }
        }
    }

    foreach ($headers as $raw) {
        if (!is_string($raw) || trim($raw) === '') {
            continue;
        }
        $val = trim($raw);
        if (stripos($val, 'Bearer ') === 0) {
            return trim(substr($val, 7));
        }
        return $val;
    }

    return null;
}

function requireAdminAuth(): void
{
    $token = extractBearerToken();
    if (!verifyAdminToken($token)) {
        jsonError('Phiên giảng viên không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
}

// Direct HTTP endpoint handling
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $valid = verifyAdminToken(extractBearerToken());
        jsonResponse(['ok' => $valid]);
    }

    if ($method === 'POST') {
        $body = readJsonBody();
        $passcode = trim((string) ($body['passcode'] ?? ''));
        if ($passcode === '') {
            jsonError('Vui lòng nhập mật mã giảng viên.', 400);
        }

        $cfg = getAppConfig();
        $validPasscodes = $cfg['admin_passcodes'] ?? ['vne2026'];
        $matched = false;
        foreach ($validPasscodes as $candidate) {
            if (hash_equals((string) $candidate, $passcode)) {
                $matched = true;
                break;
            }
        }

        if (!$matched) {
            usleep(250000); // Mild anti-bruteforce delay
            jsonError('Sai mật mã quản trị giảng viên.', 401);
        }

        $token = issueAdminToken();
        jsonResponse([
            'ok' => true,
            'token' => $token,
            'expiresIn' => 43200,
        ]);
    }

    jsonError('Method not allowed.', 405);
}
