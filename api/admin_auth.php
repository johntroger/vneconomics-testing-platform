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

function issueAdminToken(array $claims = [], int $ttlSeconds = 43200): string
{
    $cfg = getAppConfig();
    $secret = (string) $cfg['hmac_secret'];
    $now = time();

    $payload = [
        'sub' => 'vne_admin',
        'role' => (string) ($claims['role'] ?? 'DEMO'),
        'instructorId' => (string) ($claims['instructorId'] ?? 'DEMO_INSTRUCTOR'),
        'email' => (string) ($claims['email'] ?? 'demo@vneconomics.com'),
        'name' => (string) ($claims['name'] ?? 'Giảng viên Demo'),
        'authProvider' => (string) ($claims['authProvider'] ?? 'DEMO'),
        'avatarUrl' => (string) ($claims['avatarUrl'] ?? ''),
        'iat' => $now,
        'exp' => $now + $ttlSeconds,
    ];

    $payloadB64 = base64UrlEncode((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = hash_hmac('sha256', $payloadB64, $secret, true);
    return $payloadB64 . '.' . base64UrlEncode($sig);
}

function verifyAdminTokenPayload(?string $token): ?array
{
    if ($token === null || $token === '' || !str_contains($token, '.')) {
        return null;
    }

    [$payloadB64, $sigB64] = explode('.', $token, 2);
    $cfg = getAppConfig();
    $secret = (string) $cfg['hmac_secret'];

    $expectedSig = base64UrlEncode(hash_hmac('sha256', $payloadB64, $secret, true));
    if (!hash_equals($expectedSig, $sigB64)) {
        return null;
    }

    $payloadJson = base64UrlDecode($payloadB64);
    if ($payloadJson === false) {
        return null;
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload) || ($payload['sub'] ?? '') !== 'vne_admin') {
        return null;
    }

    if ((int) ($payload['exp'] ?? 0) < time()) {
        return null;
    }

    return [
        'id' => (string) ($payload['instructorId'] ?? 'DEMO_INSTRUCTOR'),
        'instructorId' => (string) ($payload['instructorId'] ?? 'DEMO_INSTRUCTOR'),
        'role' => (($payload['role'] ?? 'DEMO') === 'OFFICIAL') ? 'OFFICIAL' : 'DEMO',
        'email' => (string) ($payload['email'] ?? 'demo@vneconomics.com'),
        'name' => (string) ($payload['name'] ?? 'Giảng viên Demo'),
        'authProvider' => (string) ($payload['authProvider'] ?? 'DEMO'),
        'avatarUrl' => (string) ($payload['avatarUrl'] ?? ''),
    ];
}

function verifyAdminToken(?string $token): bool
{
    return verifyAdminTokenPayload($token) !== null;
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

function requireAdminAuth(): array
{
    $token = extractBearerToken();
    $payload = verifyAdminTokenPayload($token);
    if ($payload === null) {
        jsonError('Phiên giảng viên không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
    return $payload;
}

function requireOfficialInstructor(): array
{
    $auth = requireAdminAuth();
    if (($auth['role'] ?? 'DEMO') !== 'OFFICIAL') {
        jsonError('Tài khoản Demo chỉ dùng để trải nghiệm đề mẫu. Vui lòng đăng ký hoặc đăng nhập bằng Email / Google để tạo và quản lý đề thi chính thức.', 403);
    }
    return $auth;
}

function verifyGoogleIdToken(string $idToken, string $expectedClientId): array
{
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken);
    $raw = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($raw) || $httpCode !== 200) {
            throw new RuntimeException('Token Google không hợp lệ hoặc đã hết hạn.');
        }
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]);
        $raw = @file_get_contents($url, false, $ctx);
        if (!is_string($raw) || $raw === '') {
            throw new RuntimeException('Không thể kết nối máy chủ xác thực Google.');
        }
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data['sub']) || empty($data['email'])) {
        throw new RuntimeException('Dữ liệu xác thực từ Google không hợp lệ.');
    }

    if ($expectedClientId !== '' && (string) ($data['aud'] ?? '') !== $expectedClientId) {
        throw new RuntimeException('Google Client ID không khớp với cấu hình hệ thống.');
    }

    $verified = $data['email_verified'] ?? false;
    if ($verified !== true && $verified !== 'true' && $verified !== 1 && $verified !== '1') {
        throw new RuntimeException('Email Google chưa được xác minh.');
    }

    if ((int) ($data['exp'] ?? 0) < time()) {
        throw new RuntimeException('Phiên đăng nhập Google đã hết hạn, vui lòng thử lại.');
    }

    return [
        'sub' => (string) $data['sub'],
        'email' => strtolower(trim((string) $data['email'])),
        'name' => trim((string) ($data['name'] ?? explode('@', (string) $data['email'])[0])),
        'picture' => (string) ($data['picture'] ?? ''),
    ];
}

// Direct HTTP endpoint handling
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string) ($_GET['action'] ?? '');

    if ($method === 'GET' && $action === 'config') {
        $cfg = getAppConfig();
        $clientId = trim((string) ($cfg['google_client_id'] ?? ''));
        jsonResponse([
            'ok' => true,
            'googleClientId' => $clientId,
            'googleEnabled' => $clientId !== '',
        ]);
    }

    if ($method === 'GET') {
        $payload = verifyAdminTokenPayload(extractBearerToken());
        jsonResponse([
            'ok' => $payload !== null,
            'user' => $payload,
        ]);
    }

    if ($method === 'POST') {
        $body = readJsonBody();
        $cfg = getAppConfig();

        if ($action === 'register') {
            $fullName = trim((string) ($body['fullName'] ?? ''));
            $email = strtolower(trim((string) ($body['email'] ?? '')));
            $password = (string) ($body['password'] ?? '');

            if (mb_strlen($fullName) < 2) {
                jsonError('Vui lòng nhập họ và tên giảng viên (tối thiểu 2 ký tự).', 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonError('Địa chỉ Email không hợp lệ.', 400);
            }
            if (strlen($password) < 6) {
                jsonError('Mật khẩu cần tối thiểu 6 ký tự.', 400);
            }

            $pdo = getDb();
            $chk = $pdo->prepare('SELECT id FROM instructors WHERE LOWER(email) = :email LIMIT 1');
            $chk->execute([':email' => $email]);
            if ($chk->fetch()) {
                jsonError('Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng Google.', 409);
            }

            $id = generateId('inst');
            $now = nowIso();
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $pdo->prepare(
                'INSERT INTO instructors (id, email, full_name, password_hash, auth_provider, status, created_at, last_login_at)
                 VALUES (:id, :email, :full_name, :password_hash, :auth_provider, :status, :created_at, :last_login_at)'
            )->execute([
                ':id' => $id,
                ':email' => $email,
                ':full_name' => $fullName,
                ':password_hash' => $hash,
                ':auth_provider' => 'LOCAL',
                ':status' => 'ACTIVE',
                ':created_at' => $now,
                ':last_login_at' => $now,
            ]);

            $claims = [
                'role' => 'OFFICIAL',
                'instructorId' => $id,
                'email' => $email,
                'name' => $fullName,
                'authProvider' => 'LOCAL',
                'avatarUrl' => '',
            ];
            $token = issueAdminToken($claims);
            jsonResponse([
                'ok' => true,
                'token' => $token,
                'expiresIn' => 43200,
                'user' => array_merge(['id' => $id], $claims),
            ]);
        }

        if ($action === 'login') {
            $email = strtolower(trim((string) ($body['email'] ?? '')));
            $password = (string) ($body['password'] ?? '');

            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
                jsonError('Vui lòng nhập đầy đủ Email và Mật khẩu.', 400);
            }

            $pdo = getDb();
            $stmt = $pdo->prepare('SELECT * FROM instructors WHERE LOWER(email) = :email LIMIT 1');
            $stmt->execute([':email' => $email]);
            $row = $stmt->fetch();

            if (!$row) {
                usleep(250000);
                jsonError('Email hoặc mật khẩu chưa đúng.', 401);
            }
            if (empty($row['password_hash'])) {
                jsonError('Tài khoản này đăng ký qua Google. Vui lòng bấm "Đăng nhập bằng Google".', 401);
            }
            if (!password_verify($password, (string) $row['password_hash'])) {
                usleep(250000);
                jsonError('Email hoặc mật khẩu chưa đúng.', 401);
            }

            $pdo->prepare('UPDATE instructors SET last_login_at = :now WHERE id = :id')
                ->execute([':now' => nowIso(), ':id' => $row['id']]);

            $claims = [
                'role' => 'OFFICIAL',
                'instructorId' => (string) $row['id'],
                'email' => (string) $row['email'],
                'name' => (string) $row['full_name'],
                'authProvider' => (string) ($row['auth_provider'] ?? 'LOCAL'),
                'avatarUrl' => (string) ($row['avatar_url'] ?? ''),
            ];
            $token = issueAdminToken($claims);
            jsonResponse([
                'ok' => true,
                'token' => $token,
                'expiresIn' => 43200,
                'user' => array_merge(['id' => (string) $row['id']], $claims),
            ]);
        }

        if ($action === 'google') {
            $credential = trim((string) ($body['credential'] ?? ''));
            if ($credential === '') {
                jsonError('Thiếu mã xác thực từ Google.', 400);
            }

            $clientId = trim((string) ($cfg['google_client_id'] ?? ''));
            if ($clientId === '') {
                jsonError('Máy chủ chưa cấu hình Google OAuth Client ID (google_client_id trong .exam_config.php).', 400);
            }

            try {
                $gUser = verifyGoogleIdToken($credential, $clientId);
            } catch (Throwable $e) {
                jsonError($e->getMessage(), 401);
            }

            $pdo = getDb();
            $stmt = $pdo->prepare('SELECT * FROM instructors WHERE google_sub = :sub OR LOWER(email) = :email LIMIT 1');
            $stmt->execute([':sub' => $gUser['sub'], ':email' => $gUser['email']]);
            $row = $stmt->fetch();
            $now = nowIso();

            if ($row) {
                $provider = (string) ($row['auth_provider'] ?? 'LOCAL');
                if ($provider === 'LOCAL') {
                    $provider = 'LOCAL+GOOGLE';
                } elseif ($provider === '') {
                    $provider = 'GOOGLE';
                }
                $pdo->prepare(
                    'UPDATE instructors SET google_sub = :sub, avatar_url = :av, auth_provider = :ap, last_login_at = :now WHERE id = :id'
                )->execute([
                    ':sub' => $gUser['sub'],
                    ':av' => $gUser['picture'],
                    ':ap' => $provider,
                    ':now' => $now,
                    ':id' => $row['id'],
                ]);
                $id = (string) $row['id'];
                $fullName = (string) ($row['full_name'] ?: $gUser['name']);
            } else {
                $id = generateId('inst');
                $fullName = $gUser['name'];
                $provider = 'GOOGLE';
                $pdo->prepare(
                    'INSERT INTO instructors (id, email, full_name, password_hash, google_sub, avatar_url, auth_provider, status, created_at, last_login_at)
                     VALUES (:id, :email, :full_name, NULL, :sub, :av, :ap, :status, :created_at, :last_login_at)'
                )->execute([
                    ':id' => $id,
                    ':email' => $gUser['email'],
                    ':full_name' => $fullName,
                    ':sub' => $gUser['sub'],
                    ':av' => $gUser['picture'],
                    ':ap' => $provider,
                    ':status' => 'ACTIVE',
                    ':created_at' => $now,
                    ':last_login_at' => $now,
                ]);
            }

            $claims = [
                'role' => 'OFFICIAL',
                'instructorId' => $id,
                'email' => $gUser['email'],
                'name' => $fullName,
                'authProvider' => $provider,
                'avatarUrl' => $gUser['picture'],
            ];
            $token = issueAdminToken($claims);
            jsonResponse([
                'ok' => true,
                'token' => $token,
                'expiresIn' => 43200,
                'user' => array_merge(['id' => $id], $claims),
            ]);
        }

        // Default: Passcode login (Demo 'vne2026' or configured master passcodes)
        $passcode = trim((string) ($body['passcode'] ?? ''));
        if ($passcode === '') {
            jsonError('Vui lòng nhập mật mã giảng viên hoặc đăng nhập bằng Email / Google.', 400);
        }

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

        $isDemoPasscode = ($passcode === 'vne2026');
        $claims = $isDemoPasscode
            ? [
                'role' => 'DEMO',
                'instructorId' => 'DEMO_INSTRUCTOR',
                'email' => 'demo@vneconomics.com',
                'name' => 'Giảng viên Demo',
                'authProvider' => 'DEMO',
                'avatarUrl' => '',
            ]
            : [
                'role' => 'OFFICIAL',
                'instructorId' => 'MASTER_ADMIN',
                'email' => (string) ($cfg['default_instructor_email'] ?? 'giangvien@vneconomics.com'),
                'name' => 'Quản trị viên Hệ thống',
                'authProvider' => 'PASSCODE',
                'avatarUrl' => '',
            ];

        $token = issueAdminToken($claims);
        jsonResponse([
            'ok' => true,
            'token' => $token,
            'expiresIn' => 43200,
            'user' => array_merge(['id' => $claims['instructorId']], $claims),
        ]);
    }

    jsonError('Method not allowed.', 405);
}
