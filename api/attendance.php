<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Smart QR Attendance API
 * Public endpoints: ?action=lookup_pin, ?action=checkin
 * Admin endpoints (Bearer HMAC): ?action=list_classes, save_class, delete_class,
 *   list_sessions, create_session, session_detail, toggle_session_status,
 *   delete_session, save_records_bulk, class_summary_matrix
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';

applyCorsHeaders();

function attResolveOwnerId(array $auth): string
{
    if (($auth['role'] ?? 'DEMO') !== 'OFFICIAL') {
        return 'SYSTEM_DEMO';
    }
    return (string) ($auth['instructorId'] ?? 'SYSTEM_DEMO');
}

function attClientIp(): string
{
    $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if (is_string($forwarded) && trim($forwarded) !== '') {
        $parts = explode(',', $forwarded);
        return substr(trim($parts[0]), 0, 64);
    }
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

function attComputeQrToken(string $secret, int $slot): string
{
    return substr(hash_hmac('sha256', (string) $slot, $secret), 0, 12);
}

function attCurrentQrInfo(array $sessionRow): array
{
    $rot = (int) ($sessionRow['rotate_qr_seconds'] ?? 0);
    $secret = (string) ($sessionRow['qr_secret'] ?? '');
    if ($rot <= 0 || $secret === '') {
        return ['qrToken' => '', 'qrExpiresInSec' => 0];
    }
    $now = time();
    $slot = intdiv($now, $rot);
    $expiresIn = $rot - ($now % $rot);
    return [
        'qrToken' => attComputeQrToken($secret, $slot),
        'qrExpiresInSec' => $expiresIn,
    ];
}

function attVerifyQrToken(array $sessionRow, string $providedToken): bool
{
    $rot = (int) ($sessionRow['rotate_qr_seconds'] ?? 0);
    $secret = (string) ($sessionRow['qr_secret'] ?? '');
    if ($rot <= 0 || $secret === '') {
        return true;
    }
    $clean = trim($providedToken);
    if ($clean === '') {
        return false;
    }
    $slot = intdiv(time(), $rot);
    // Sliding window: accept current slot T and previous slot T-1
    $t0 = attComputeQrToken($secret, $slot);
    $tPrev = attComputeQrToken($secret, $slot - 1);
    return hash_equals($t0, $clean) || hash_equals($tPrev, $clean);
}

function attHaversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): int
{
    $r = 6371000.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * (sin($dLng / 2) ** 2);
    return (int) round($r * 2 * atan2(sqrt($a), sqrt(max(0.0, 1.0 - $a))));
}

function attRecalculateSessionDistances(PDO $pdo, array $sessionRow): void
{
    $sid = (string) $sessionRow['id'];
    $maxDist = max(20, (int) ($sessionRow['max_distance_meters'] ?? 200));
    $instLat = $sessionRow['instructor_lat'] !== null ? (float) $sessionRow['instructor_lat'] : null;
    $instLng = $sessionRow['instructor_lng'] !== null ? (float) $sessionRow['instructor_lng'] : null;

    $stmt = $pdo->prepare('SELECT id, location_lat, location_lng, location_accuracy, check_in_source, attendance_status FROM attendance_records WHERE session_id = :sid');
    $stmt->execute([':sid' => $sid]);
    $rows = $stmt->fetchAll();

    $centerLat = $instLat;
    $centerLng = $instLng;

    if ($centerLat === null || $centerLng === null) {
        $lats = [];
        $lngs = [];
        foreach ($rows as $r) {
            if ($r['location_lat'] !== null && $r['location_lng'] !== null) {
                $lats[] = (float) $r['location_lat'];
                $lngs[] = (float) $r['location_lng'];
            }
        }
        if (count($lats) >= 3) {
            sort($lats);
            sort($lngs);
            $mid = intdiv(count($lats), 2);
            $centerLat = $lats[$mid];
            $centerLng = $lngs[$mid];
        }
    }

    $upd = $pdo->prepare('UPDATE attendance_records SET distance_meters = :dm, location_flag = :lf WHERE id = :id');
    foreach ($rows as $r) {
        $hasGps = $r['location_lat'] !== null && $r['location_lng'] !== null;
        if (!$hasGps) {
            $flag = ($r['check_in_source'] === 'QR_SCAN') ? 'NO_GPS' : null;
            $upd->execute([':dm' => null, ':lf' => $flag, ':id' => $r['id']]);
            continue;
        }
        if ($centerLat === null || $centerLng === null) {
            $upd->execute([':dm' => 0, ':lf' => null, ':id' => $r['id']]);
            continue;
        }
        $dist = attHaversineMeters($centerLat, $centerLng, (float) $r['location_lat'], (float) $r['location_lng']);
        $acc = $r['location_accuracy'] !== null ? (float) $r['location_accuracy'] : 0.0;
        $effectiveDist = max(0, $dist - min((int) round($acc), 150));
        $flag = $effectiveDist > $maxDist ? 'FAR_LOCATION' : null;
        $upd->execute([':dm' => $dist, ':lf' => $flag, ':id' => $r['id']]);
    }
}

function attFormatClass(array $row, int $sessionCount = 0): array
{
    $roster = json_decode((string) ($row['roster_entries_json'] ?? '[]'), true);
    return [
        'id' => (string) $row['id'],
        'ownerId' => (string) $row['owner_id'],
        'courseId' => $row['course_id'] !== null ? (string) $row['course_id'] : null,
        'classCode' => (string) ($row['class_code'] ?? ''),
        'title' => (string) ($row['title'] ?? ''),
        'semester' => (string) ($row['semester'] ?? ''),
        'credits' => (int) ($row['credits'] ?? 3),
        'instructorName' => (string) ($row['instructor_name'] ?? ''),
        'rosterEntries' => is_array($roster) ? $roster : [],
        'sessionCount' => $sessionCount,
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}

function attFormatSession(array $row, ?array $stats = null, bool $includeQr = false): array
{
    $out = [
        'id' => (string) $row['id'],
        'classId' => (string) $row['class_id'],
        'ownerId' => (string) $row['owner_id'],
        'title' => (string) $row['title'],
        'sessionDate' => (string) ($row['session_date'] ?? ''),
        'periodsCount' => (int) ($row['periods_count'] ?? 3),
        'checkinPin' => (string) $row['checkin_pin'],
        'sessionPasscode' => (string) ($row['session_passcode'] ?? ''),
        'rotateQrSeconds' => (int) ($row['rotate_qr_seconds'] ?? 0),
        'status' => (string) ($row['status'] ?? 'OPEN'),
        'requireRosterMatch' => (bool) ((int) ($row['require_roster_match'] ?? 1)),
        'requireGps' => (bool) ((int) ($row['require_gps'] ?? 1)),
        'blockDuplicateDevice' => (bool) ((int) ($row['block_duplicate_device'] ?? 1)),
        'instructorLat' => $row['instructor_lat'] !== null ? (float) $row['instructor_lat'] : null,
        'instructorLng' => $row['instructor_lng'] !== null ? (float) $row['instructor_lng'] : null,
        'maxDistanceMeters' => (int) ($row['max_distance_meters'] ?? 200),
        'lateAfterMinutes' => (int) ($row['late_after_minutes'] ?? 15),
        'openedAt' => (string) ($row['opened_at'] ?? ''),
        'closedAt' => $row['closed_at'] !== null ? (string) $row['closed_at'] : null,
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
    if ($includeQr) {
        $qr = attCurrentQrInfo($row);
        $out['qrToken'] = $qr['qrToken'];
        $out['qrExpiresInSec'] = $qr['qrExpiresInSec'];
    }
    if ($stats !== null) {
        $out['stats'] = $stats;
    }
    return $out;
}

function attFormatRecord(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'sessionId' => (string) $row['session_id'],
        'studentCode' => (string) $row['student_code'],
        'studentName' => (string) $row['student_name'],
        'lastName' => (string) ($row['last_name'] ?? ''),
        'firstName' => (string) ($row['first_name'] ?? ''),
        'gender' => (string) ($row['gender'] ?? ''),
        'dob' => (string) ($row['dob'] ?? ''),
        'className' => (string) ($row['class_name'] ?? ''),
        'attendanceStatus' => (string) ($row['attendance_status'] ?? 'ABSENT_UNEXCUSED'),
        'note' => (string) ($row['note'] ?? ''),
        'checkInSource' => (string) ($row['check_in_source'] ?? 'MANUAL_ADMIN'),
        'deviceToken' => $row['device_token'] !== null ? (string) $row['device_token'] : null,
        'browserId' => $row['browser_id'] !== null ? (string) $row['browser_id'] : null,
        'hardwareFingerprint' => $row['hardware_fingerprint'] !== null ? (string) $row['hardware_fingerprint'] : null,
        'deviceLabel' => $row['device_label'] !== null ? (string) $row['device_label'] : null,
        'ipAddress' => $row['ip_address'] !== null ? (string) $row['ip_address'] : null,
        'locationLat' => $row['location_lat'] !== null ? (float) $row['location_lat'] : null,
        'locationLng' => $row['location_lng'] !== null ? (float) $row['location_lng'] : null,
        'locationAccuracy' => $row['location_accuracy'] !== null ? (float) $row['location_accuracy'] : null,
        'distanceMeters' => $row['distance_meters'] !== null ? (int) $row['distance_meters'] : null,
        'deviceFlag' => $row['device_flag'] !== null ? (string) $row['device_flag'] : null,
        'locationFlag' => $row['location_flag'] !== null ? (string) $row['location_flag'] : null,
        'checkedInAt' => $row['checked_in_at'] !== null ? (string) $row['checked_in_at'] : null,
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function attComputeSessionStats(PDO $pdo, string $sessionId): array
{
    $stmt = $pdo->prepare('SELECT attendance_status, device_flag, location_flag FROM attendance_records WHERE session_id = :sid');
    $stmt->execute([':sid' => $sessionId]);
    $rows = $stmt->fetchAll();
    $stats = [
        'total' => count($rows),
        'present' => 0,
        'late' => 0,
        'excused' => 0,
        'unexcused' => 0,
        'alerts' => 0,
    ];
    foreach ($rows as $r) {
        $st = (string) $r['attendance_status'];
        if ($st === 'PRESENT') {
            $stats['present']++;
        } elseif ($st === 'LATE') {
            $stats['late']++;
        } elseif ($st === 'ABSENT_EXCUSED') {
            $stats['excused']++;
        } else {
            $stats['unexcused']++;
        }
        if (!empty($r['device_flag']) || !empty($r['location_flag'])) {
            $stats['alerts']++;
        }
    }
    return $stats;
}

function attEnsureDemoSeeded(PDO $pdo): void
{
    try {
        // Migrate/replace any prior un-anonymized demo seed cleanly
        $old = (bool) $pdo->query("SELECT 1 FROM attendance_classes WHERE id = 'acls_demo_emkt' AND class_code = '23DLG1B' LIMIT 1")->fetchColumn();
        if ($old) {
            $pdo->exec("DELETE FROM attendance_records WHERE session_id = 'ases_demo_1'");
            $pdo->exec("DELETE FROM attendance_sessions WHERE id = 'ases_demo_1'");
            $pdo->exec("DELETE FROM attendance_classes WHERE id = 'acls_demo_emkt'");
        }
        $exists = (bool) $pdo->query("SELECT 1 FROM attendance_classes WHERE id = 'acls_demo_emkt' LIMIT 1")->fetchColumn();
        if ($exists) {
            return;
        }
        $now = nowIso();
        $today = date('Y-m-d');
        $roster = [
            ['studentCode' => '2026000001', 'lastName' => 'Nguyễn Văn', 'firstName' => 'An', 'className' => 'DEMO101'],
            ['studentCode' => '2026000002', 'lastName' => 'Trần Thị', 'firstName' => 'Bình', 'className' => 'DEMO101'],
            ['studentCode' => '2026000003', 'lastName' => 'Lê Hoàng', 'firstName' => 'Cường', 'className' => 'DEMO101'],
            ['studentCode' => '2026000004', 'lastName' => 'Phạm Minh', 'firstName' => 'Dung', 'className' => 'DEMO101'],
            ['studentCode' => '2026000005', 'lastName' => 'Hoàng Quốc', 'firstName' => 'Dũng', 'className' => 'DEMO101'],
            ['studentCode' => '2026000006', 'lastName' => 'Vũ Thị Hồng', 'firstName' => 'Hạnh', 'className' => 'DEMO101'],
            ['studentCode' => '2026000007', 'lastName' => 'Đỗ Quang', 'firstName' => 'Huy', 'className' => 'DEMO101'],
            ['studentCode' => '2026000008', 'lastName' => 'Bùi Ngọc', 'firstName' => 'Lan', 'className' => 'DEMO101'],
            ['studentCode' => '2026000009', 'lastName' => 'Ngô Thanh', 'firstName' => 'Minh', 'className' => 'DEMO102.GHEP'],
            ['studentCode' => '2026000010', 'lastName' => 'Dương Thảo', 'firstName' => 'Nhi', 'className' => 'DEMO102.GHEP'],
        ];
        $pdo->prepare(
            "INSERT INTO attendance_classes (id, owner_id, class_code, title, semester, credits, instructor_name, roster_entries_json, created_at)
             VALUES ('acls_demo_emkt', 'SYSTEM_DEMO', 'DEMO101', 'ECO101 - DEMO101 - Kinh tế Vi mô 1 (Lớp Demo)', 'HK 1 NH 2026-2027', 3, 'Giảng viên Demo', :rej, :ca)"
        )->execute([':rej' => json_encode($roster, JSON_UNESCAPED_UNICODE), ':ca' => $now]);

        $pdo->prepare(
            "INSERT INTO attendance_sessions (id, class_id, owner_id, title, session_date, periods_count, checkin_pin, session_passcode, qr_secret, rotate_qr_seconds, status, require_roster_match, require_gps, block_duplicate_device, max_distance_meters, late_after_minutes, opened_at, created_at)
             VALUES ('ases_demo_1', 'acls_demo_emkt', 'SYSTEM_DEMO', 'Buổi 1 - Điểm danh Demo', :sd, 3, '888999', '2026', 'demo_qr_secret', 0, 'OPEN', 1, 1, 1, 200, 15, :oa, :ca)"
        )->execute([':sd' => $today, ':oa' => $now, ':ca' => $now]);

        $statuses = [
            '2026000001' => ['PRESENT', 'QR_SCAN', 'Safari / iPhone', 12, ''],
            '2026000002' => ['PRESENT', 'QR_SCAN', 'Chrome / Android', 18, ''],
            '2026000003' => ['PRESENT', 'QR_SCAN', 'Safari / iPhone', 9, ''],
            '2026000004' => ['LATE', 'QR_SCAN', 'Chrome / Android', 24, 'Kẹt xe 15 phút'],
            '2026000005' => ['ABSENT_EXCUSED', 'MANUAL_ADMIN', null, null, 'Xin phép nghỉ ốm (có giấy xác nhận)'],
        ];
        $ins = $pdo->prepare(
            "INSERT INTO attendance_records (id, session_id, student_code, student_name, last_name, first_name, class_name, attendance_status, note, check_in_source, device_label, distance_meters, checked_in_at, updated_at)
             VALUES (:id, 'ases_demo_1', :code, :name, :ln, :fn, :cn, :st, :note, :src, :dl, :dm, :cia, :ua)"
        );
        foreach ($roster as $idx => $stu) {
            $code = $stu['studentCode'];
            $meta = $statuses[$code] ?? ['ABSENT_UNEXCUSED', 'MANUAL_ADMIN', null, null, ''];
            $ins->execute([
                ':id' => 'arec_demo_' . ($idx + 1),
                ':code' => $code,
                ':name' => $stu['lastName'] . ' ' . $stu['firstName'],
                ':ln' => $stu['lastName'],
                ':fn' => $stu['firstName'],
                ':cn' => $stu['className'],
                ':st' => $meta[0],
                ':note' => $meta[4],
                ':src' => $meta[1],
                ':dl' => $meta[2],
                ':dm' => $meta[3],
                ':cia' => $meta[1] === 'QR_SCAN' ? $now : null,
                ':ua' => $now,
            ]);
        }
    } catch (Throwable) {
        // Non-fatal
    }
}

$action = (string) ($_GET['action'] ?? '');
$pdo = getDb();

if ($action === 'lookup_pin') {
    $pin = preg_replace('/\D/', '', (string) ($_GET['pin'] ?? ''));
    if ($pin === '888999') {
        attEnsureDemoSeeded($pdo);
    }
    if (strlen($pin) < 4) {
        jsonError('Mã PIN điểm danh không hợp lệ.', 400);
    }
    $stmt = $pdo->prepare('SELECT s.*, c.title AS class_title, c.class_code, c.semester, c.instructor_name FROM attendance_sessions s JOIN attendance_classes c ON c.id = s.class_id WHERE s.checkin_pin = :pin ORDER BY s.created_at DESC LIMIT 1');
    $stmt->execute([':pin' => $pin]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Không tìm thấy buổi điểm danh với mã PIN này.', 404);
    }
    jsonResponse([
        'ok' => true,
        'lookup' => [
            'sessionId' => (string) $row['id'],
            'classTitle' => (string) $row['class_title'],
            'classCode' => (string) ($row['class_code'] ?? ''),
            'semester' => (string) ($row['semester'] ?? ''),
            'instructorName' => (string) ($row['instructor_name'] ?? ''),
            'sessionTitle' => (string) $row['title'],
            'sessionDate' => (string) ($row['session_date'] ?? ''),
            'checkinPin' => (string) $row['checkin_pin'],
            'status' => (string) $row['status'],
            'requirePasscode' => trim((string) ($row['session_passcode'] ?? '')) !== '',
            'requireRosterMatch' => (bool) ((int) ($row['require_roster_match'] ?? 1)),
            'requireGps' => (bool) ((int) ($row['require_gps'] ?? 1)),
            'rotateQrSeconds' => (int) ($row['rotate_qr_seconds'] ?? 0),
            'maxDistanceMeters' => (int) ($row['max_distance_meters'] ?? 200),
            'lateAfterMinutes' => (int) ($row['late_after_minutes'] ?? 15),
        ],
    ]);
}

if ($action === 'checkin') {
    $body = readJsonBody();
    $pin = preg_replace('/\D/', '', (string) ($body['pin'] ?? ''));
    $passcode = trim((string) ($body['passcode'] ?? ''));
    $qrToken = trim((string) ($body['qrToken'] ?? ''));
    $studentCode = strtoupper(trim((string) ($body['studentCode'] ?? '')));
    $lastNameInput = trim((string) ($body['lastName'] ?? ''));
    $firstNameInput = trim((string) ($body['firstName'] ?? ''));
    $classNameInput = trim((string) ($body['className'] ?? ''));
    $fullNameInput = trim((string) ($body['fullName'] ?? ''));
    $deviceToken = substr(trim((string) ($body['deviceToken'] ?? '')), 0, 128);
    $browserId = substr(trim((string) ($body['browserId'] ?? '')), 0, 128);
    $hwFp = substr(trim((string) ($body['hardwareFingerprint'] ?? '')), 0, 128);
    $deviceLabel = substr(trim((string) ($body['deviceLabel'] ?? '')), 0, 160);
    $locLat = isset($body['locationLat']) && is_numeric($body['locationLat']) ? (float) $body['locationLat'] : null;
    $locLng = isset($body['locationLng']) && is_numeric($body['locationLng']) ? (float) $body['locationLng'] : null;
    $locAcc = isset($body['locationAccuracy']) && is_numeric($body['locationAccuracy']) ? (float) $body['locationAccuracy'] : null;

    if ($pin === '' || $studentCode === '') {
        jsonError('Vui lòng nhập đầy đủ Mã PIN buổi học và Mã số sinh viên.', 400);
    }

    $stmt = $pdo->prepare('SELECT s.*, c.title AS class_title, c.roster_entries_json FROM attendance_sessions s JOIN attendance_classes c ON c.id = s.class_id WHERE s.checkin_pin = :pin ORDER BY s.created_at DESC LIMIT 1');
    $stmt->execute([':pin' => $pin]);
    $session = $stmt->fetch();
    if (!$session) {
        jsonError('Không tìm thấy buổi điểm danh hợp lệ.', 404);
    }
    if ((string) $session['status'] !== 'OPEN') {
        jsonError('Buổi điểm danh này đã đóng. Vui lòng liên hệ giảng viên trực tiếp tại lớp.', 403);
    }

    $expectedPass = trim((string) ($session['session_passcode'] ?? ''));
    if ($expectedPass !== '' && strcasecmp($expectedPass, $passcode) !== 0) {
        jsonError('Mật khẩu điểm danh (Passcode) chưa đúng. Vui lòng kiểm tra lại với giảng viên.', 403);
    }

    if (!attVerifyQrToken($session, $qrToken)) {
        jsonError('Mã QR đã hết hạn (quá chu kỳ làm mới). Vui lòng quét lại mã QR mới nhất trên màn chiếu.', 403);
    }

    if ((int) ($session['require_gps'] ?? 1) === 1 && ($locLat === null || $locLng === null)) {
        jsonError('Buổi học yêu cầu bật Định vị (GPS) trên điện thoại để xác nhận đang có mặt tại lớp.', 400);
    }

    $sid = (string) $session['id'];

    // Check existing record for this student
    $recStmt = $pdo->prepare('SELECT * FROM attendance_records WHERE session_id = :sid AND student_code = :code LIMIT 1');
    $recStmt->execute([':sid' => $sid, ':code' => $studentCode]);
    $existingRec = $recStmt->fetch();

    if ((int) ($session['require_roster_match'] ?? 1) === 1 && !$existingRec) {
        jsonError("Không tìm thấy MSSV {$studentCode} trong danh sách lớp học phần này.", 404);
    }

    // Anti-proxy: check if same deviceToken or browserId was already used by ANOTHER student in this session
    $deviceFlag = null;
    if ($deviceToken !== '' || $browserId !== '') {
        $dupStmt = $pdo->prepare('SELECT student_code, student_name FROM attendance_records WHERE session_id = :sid AND student_code != :code AND check_in_source = \'QR_SCAN\' AND ((:dt != \'\' AND device_token = :dt2) OR (:bid != \'\' AND browser_id = :bid2)) LIMIT 1');
        $dupStmt->execute([
            ':sid' => $sid,
            ':code' => $studentCode,
            ':dt' => $deviceToken,
            ':dt2' => $deviceToken,
            ':bid' => $browserId,
            ':bid2' => $browserId,
        ]);
        $dupRow = $dupStmt->fetch();
        if ($dupRow) {
            if ((int) ($session['block_duplicate_device'] ?? 1) === 1) {
                jsonError("Thiết bị này đã được dùng để điểm danh cho sinh viên {$dupRow['student_code']} ({$dupRow['student_name']}). Mỗi điện thoại chỉ được điểm danh cho 1 sinh viên!", 409);
            }
            $deviceFlag = 'DUPLICATE_DEVICE:' . $dupRow['student_code'];
        }
    }

    $ip = attClientIp();
    if ($deviceFlag === null && $hwFp !== '' && $ip !== '') {
        $fpStmt = $pdo->prepare('SELECT student_code FROM attendance_records WHERE session_id = :sid AND student_code != :code AND check_in_source = \'QR_SCAN\' AND hardware_fingerprint = :fp AND ip_address = :ip LIMIT 1');
        $fpStmt->execute([':sid' => $sid, ':code' => $studentCode, ':fp' => $hwFp, ':ip' => $ip]);
        $fpRow = $fpStmt->fetch();
        if ($fpRow) {
            $deviceFlag = 'SUSPECTED_SAME_DEVICE:' . $fpRow['student_code'];
        }
    }

    // Determine PRESENT vs LATE
    $nowIso = nowIso();
    $lateMinutes = (int) ($session['late_after_minutes'] ?? 15);
    $status = 'PRESENT';
    if ($lateMinutes > 0 && !empty($session['opened_at'])) {
        $openedTs = strtotime((string) $session['opened_at']);
        if ($openedTs !== false && time() > ($openedTs + $lateMinutes * 60)) {
            $status = 'LATE';
        }
    }

    if ($existingRec) {
        $upd = $pdo->prepare(
            'UPDATE attendance_records SET
                attendance_status = :st,
                check_in_source = \'QR_SCAN\',
                device_token = :dt,
                browser_id = :bid,
                hardware_fingerprint = :fp,
                device_label = :dl,
                ip_address = :ip,
                location_lat = :lat,
                location_lng = :lng,
                location_accuracy = :acc,
                device_flag = :df,
                checked_in_at = COALESCE(checked_in_at, :now),
                updated_at = :now2
             WHERE id = :id'
        );
        $upd->execute([
            ':st' => $status,
            ':dt' => $deviceToken ?: null,
            ':bid' => $browserId ?: null,
            ':fp' => $hwFp ?: null,
            ':dl' => $deviceLabel ?: null,
            ':ip' => $ip ?: null,
            ':lat' => $locLat,
            ':lng' => $locLng,
            ':acc' => $locAcc,
            ':df' => $deviceFlag,
            ':now' => $nowIso,
            ':now2' => $nowIso,
            ':id' => $existingRec['id'],
        ]);
        $recordId = (string) $existingRec['id'];
    } else {
        $recordId = generateId('arec');
        if ($lastNameInput !== '' || $firstNameInput !== '') {
            $lastName = $lastNameInput;
            $firstName = $firstNameInput;
            $displayName = trim($lastName . ' ' . $firstName);
        } else {
            $displayName = $fullNameInput !== '' ? $fullNameInput : $studentCode;
            $parts = preg_split('/\s+/', $displayName);
            $firstName = count($parts) > 1 ? array_pop($parts) : $displayName;
            $lastName = count($parts) > 0 ? implode(' ', $parts) : '';
        }
        if ((int) ($session['require_roster_match'] ?? 1) === 0 && ($firstName === '' || $classNameInput === '')) {
            jsonError('Vui lòng nhập đầy đủ MSSV, Họ đệm, Tên và Lớp học.', 400);
        }
        $ins = $pdo->prepare(
            'INSERT INTO attendance_records (id, session_id, student_code, student_name, last_name, first_name, class_name, attendance_status, check_in_source, device_token, browser_id, hardware_fingerprint, device_label, ip_address, location_lat, location_lng, location_accuracy, device_flag, checked_in_at, updated_at)
             VALUES (:id, :sid, :code, :name, :ln, :fn, :cn, :st, \'QR_SCAN\', :dt, :bid, :fp, :dl, :ip, :lat, :lng, :acc, :df, :now, :now2)'
        );
        $ins->execute([
            ':id' => $recordId,
            ':sid' => $sid,
            ':code' => $studentCode,
            ':name' => $displayName,
            ':ln' => $lastName,
            ':fn' => $firstName,
            ':cn' => $classNameInput,
            ':st' => $status,
            ':dt' => $deviceToken ?: null,
            ':bid' => $browserId ?: null,
            ':fp' => $hwFp ?: null,
            ':dl' => $deviceLabel ?: null,
            ':ip' => $ip ?: null,
            ':lat' => $locLat,
            ':lng' => $locLng,
            ':acc' => $locAcc,
            ':df' => $deviceFlag,
            ':now' => $nowIso,
            ':now2' => $nowIso,
        ]);
    }

    attRecalculateSessionDistances($pdo, $session);

    $finalStmt = $pdo->prepare('SELECT * FROM attendance_records WHERE id = :id LIMIT 1');
    $finalStmt->execute([':id' => $recordId]);
    $finalRow = $finalStmt->fetch();

    jsonResponse([
        'ok' => true,
        'record' => $finalRow ? attFormatRecord($finalRow) : null,
        'sessionTitle' => (string) $session['title'],
        'classTitle' => (string) $session['class_title'],
    ]);
}

// All actions below require Instructor / Admin Bearer Auth
$auth = requireAdminAuth();
$ownerId = attResolveOwnerId($auth);

if ($action === 'list_classes') {
    if ($ownerId === 'SYSTEM_DEMO') {
        attEnsureDemoSeeded($pdo);
    }
    $stmt = $pdo->prepare('SELECT c.*, (SELECT COUNT(*) FROM attendance_sessions s WHERE s.class_id = c.id) AS session_count FROM attendance_classes c WHERE c.owner_id = :oid ORDER BY c.created_at DESC');
    $stmt->execute([':oid' => $ownerId]);
    $classes = array_map(
        static fn (array $r): array => attFormatClass($r, (int) ($r['session_count'] ?? 0)),
        $stmt->fetchAll()
    );
    jsonResponse(['ok' => true, 'classes' => $classes]);
}

if ($action === 'save_class') {
    $body = readJsonBody();
    $id = trim((string) ($body['id'] ?? ''));
    $title = trim((string) ($body['title'] ?? ''));
    if ($title === '') {
        jsonError('Vui lòng nhập Tên lớp điểm danh.', 400);
    }
    $classCode = trim((string) ($body['classCode'] ?? ''));
    $semester = trim((string) ($body['semester'] ?? ''));
    $credits = max(1, (int) ($body['credits'] ?? 3));
    $instructorName = trim((string) ($body['instructorName'] ?? ($auth['name'] ?? '')));
    $courseId = trim((string) ($body['courseId'] ?? '')) ?: null;
    $roster = is_array($body['rosterEntries'] ?? null) ? $body['rosterEntries'] : [];
    $rosterJson = json_encode($roster, JSON_UNESCAPED_UNICODE);

    if ($id !== '') {
        $chk = $pdo->prepare('SELECT id FROM attendance_classes WHERE id = :id AND owner_id = :oid LIMIT 1');
        $chk->execute([':id' => $id, ':oid' => $ownerId]);
        if ($chk->fetch()) {
            $pdo->prepare('UPDATE attendance_classes SET course_id = :cid, class_code = :cc, title = :t, semester = :sem, credits = :cr, instructor_name = :inst, roster_entries_json = :rej WHERE id = :id AND owner_id = :oid')
                ->execute([
                    ':cid' => $courseId,
                    ':cc' => $classCode,
                    ':t' => $title,
                    ':sem' => $semester,
                    ':cr' => $credits,
                    ':inst' => $instructorName,
                    ':rej' => $rosterJson,
                    ':id' => $id,
                    ':oid' => $ownerId,
                ]);
        } else {
            $id = '';
        }
    }

    if ($id === '') {
        $id = generateId('acls');
        $pdo->prepare('INSERT INTO attendance_classes (id, owner_id, course_id, class_code, title, semester, credits, instructor_name, roster_entries_json, created_at) VALUES (:id, :oid, :cid, :cc, :t, :sem, :cr, :inst, :rej, :ca)')
            ->execute([
                ':id' => $id,
                ':oid' => $ownerId,
                ':cid' => $courseId,
                ':cc' => $classCode,
                ':t' => $title,
                ':sem' => $semester,
                ':cr' => $credits,
                ':inst' => $instructorName,
                ':rej' => $rosterJson,
                ':ca' => nowIso(),
            ]);
    }

    $rowStmt = $pdo->prepare('SELECT c.*, (SELECT COUNT(*) FROM attendance_sessions s WHERE s.class_id = c.id) AS session_count FROM attendance_classes c WHERE c.id = :id LIMIT 1');
    $rowStmt->execute([':id' => $id]);
    $saved = $rowStmt->fetch();
    jsonResponse(['ok' => true, 'classItem' => $saved ? attFormatClass($saved, (int) ($saved['session_count'] ?? 0)) : null]);
}

if ($action === 'delete_class') {
    $body = readJsonBody();
    $classId = trim((string) ($body['classId'] ?? ''));
    if ($classId === '') {
        jsonError('Thiếu classId.', 400);
    }
    $sStmt = $pdo->prepare('SELECT id FROM attendance_sessions WHERE class_id = :cid AND owner_id = :oid');
    $sStmt->execute([':cid' => $classId, ':oid' => $ownerId]);
    $sIds = $sStmt->fetchAll(PDO::FETCH_COLUMN);
    foreach ($sIds as $sid) {
        $pdo->prepare('DELETE FROM attendance_records WHERE session_id = :sid')->execute([':sid' => $sid]);
    }
    $pdo->prepare('DELETE FROM attendance_sessions WHERE class_id = :cid AND owner_id = :oid')->execute([':cid' => $classId, ':oid' => $ownerId]);
    $pdo->prepare('DELETE FROM attendance_classes WHERE id = :cid AND owner_id = :oid')->execute([':cid' => $classId, ':oid' => $ownerId]);
    jsonResponse(['ok' => true]);
}

if ($action === 'list_sessions') {
    $classId = trim((string) ($_GET['classId'] ?? ''));
    $stmt = $pdo->prepare('SELECT * FROM attendance_sessions WHERE class_id = :cid AND owner_id = :oid ORDER BY created_at DESC');
    $stmt->execute([':cid' => $classId, ':oid' => $ownerId]);
    $sessions = [];
    foreach ($stmt->fetchAll() as $row) {
        $stats = attComputeSessionStats($pdo, (string) $row['id']);
        $sessions[] = attFormatSession($row, $stats, true);
    }
    jsonResponse(['ok' => true, 'sessions' => $sessions]);
}

if ($action === 'create_session') {
    $body = readJsonBody();
    $classId = trim((string) ($body['classId'] ?? ''));
    $clsStmt = $pdo->prepare('SELECT * FROM attendance_classes WHERE id = :id AND owner_id = :oid LIMIT 1');
    $clsStmt->execute([':id' => $classId, ':oid' => $ownerId]);
    $cls = $clsStmt->fetch();
    if (!$cls) {
        jsonError('Không tìm thấy lớp điểm danh.', 404);
    }

    $title = trim((string) ($body['title'] ?? ''));
    if ($title === '') {
        $title = 'Buổi điểm danh ' . date('d/m/Y');
    }
    $sessionDate = trim((string) ($body['sessionDate'] ?? date('Y-m-d')));
    $periodsCount = max(1, min(15, (int) ($body['periodsCount'] ?? 3)));
    $pin = preg_replace('/\D/', '', (string) ($body['checkinPin'] ?? ''));
    if (strlen($pin) < 6) {
        $pin = (string) random_int(100000, 999999);
    }
    $passcode = trim((string) ($body['sessionPasscode'] ?? ''));
    $rotateSec = max(0, (int) ($body['rotateQrSeconds'] ?? 0));
    $requireRoster = !isset($body['requireRosterMatch']) || (bool) $body['requireRosterMatch'] ? 1 : 0;
    $requireGps = !isset($body['requireGps']) || (bool) $body['requireGps'] ? 1 : 0;
    $blockDup = !isset($body['blockDuplicateDevice']) || (bool) $body['blockDuplicateDevice'] ? 1 : 0;
    $instLat = isset($body['instructorLat']) && is_numeric($body['instructorLat']) ? (float) $body['instructorLat'] : null;
    $instLng = isset($body['instructorLng']) && is_numeric($body['instructorLng']) ? (float) $body['instructorLng'] : null;
    $maxDist = max(20, (int) ($body['maxDistanceMeters'] ?? 200));
    $lateMin = max(0, (int) ($body['lateAfterMinutes'] ?? 15));

    $sid = generateId('ases');
    $qrSecret = bin2hex(random_bytes(16));
    $now = nowIso();

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO attendance_sessions (id, class_id, owner_id, title, session_date, periods_count, checkin_pin, session_passcode, qr_secret, rotate_qr_seconds, status, require_roster_match, require_gps, block_duplicate_device, instructor_lat, instructor_lng, max_distance_meters, late_after_minutes, opened_at, created_at)
             VALUES (:id, :cid, :oid, :t, :sd, :pc, :pin, :pass, :qs, :rot, \'OPEN\', :rrm, :rg, :bd, :ilat, :ilng, :md, :lm, :oa, :ca)'
        )->execute([
            ':id' => $sid,
            ':cid' => $classId,
            ':oid' => $ownerId,
            ':t' => $title,
            ':sd' => $sessionDate,
            ':pc' => $periodsCount,
            ':pin' => $pin,
            ':pass' => $passcode !== '' ? $passcode : null,
            ':qs' => $qrSecret,
            ':rot' => $rotateSec,
            ':rrm' => $requireRoster,
            ':rg' => $requireGps,
            ':bd' => $blockDup,
            ':ilat' => $instLat,
            ':ilng' => $instLng,
            ':md' => $maxDist,
            ':lm' => $lateMin,
            ':oa' => $now,
            ':ca' => $now,
        ]);

        $roster = json_decode((string) ($cls['roster_entries_json'] ?? '[]'), true);
        if (is_array($roster)) {
            $insRec = $pdo->prepare(
                'INSERT INTO attendance_records (id, session_id, student_code, student_name, last_name, first_name, gender, dob, class_name, attendance_status, check_in_source, updated_at)
                 VALUES (:id, :sid, :code, :name, :ln, :fn, :g, :dob, :cn, \'ABSENT_UNEXCUSED\', \'MANUAL_ADMIN\', :ua)'
            );
            foreach ($roster as $stu) {
                $code = strtoupper(trim((string) ($stu['studentCode'] ?? '')));
                if ($code === '') {
                    continue;
                }
                $ln = trim((string) ($stu['lastName'] ?? ''));
                $fn = trim((string) ($stu['firstName'] ?? ''));
                $full = trim($ln . ' ' . $fn) ?: $code;
                $insRec->execute([
                    ':id' => generateId('arec'),
                    ':sid' => $sid,
                    ':code' => $code,
                    ':name' => $full,
                    ':ln' => $ln,
                    ':fn' => $fn,
                    ':g' => trim((string) ($stu['gender'] ?? '')),
                    ':dob' => trim((string) ($stu['dob'] ?? '')),
                    ':cn' => trim((string) ($stu['className'] ?? '')),
                    ':ua' => $now,
                ]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        jsonError('Không thể tạo buổi điểm danh: ' . $e->getMessage(), 500);
    }

    $sRow = $pdo->prepare('SELECT * FROM attendance_sessions WHERE id = :id LIMIT 1');
    $sRow->execute([':id' => $sid]);
    $created = $sRow->fetch();
    $stats = attComputeSessionStats($pdo, $sid);
    jsonResponse(['ok' => true, 'session' => $created ? attFormatSession($created, $stats, true) : null]);
}

if ($action === 'session_detail') {
    $sid = trim((string) ($_GET['sessionId'] ?? ''));
    $sStmt = $pdo->prepare('SELECT * FROM attendance_sessions WHERE id = :id AND owner_id = :oid LIMIT 1');
    $sStmt->execute([':id' => $sid, ':oid' => $ownerId]);
    $session = $sStmt->fetch();
    if (!$session) {
        jsonError('Không tìm thấy buổi điểm danh.', 404);
    }
    $rStmt = $pdo->prepare('SELECT * FROM attendance_records WHERE session_id = :sid ORDER BY first_name ASC, last_name ASC, student_code ASC');
    $rStmt->execute([':sid' => $sid]);
    $records = array_map('attFormatRecord', $rStmt->fetchAll());
    $stats = attComputeSessionStats($pdo, $sid);
    jsonResponse([
        'ok' => true,
        'session' => attFormatSession($session, $stats, true),
        'records' => $records,
    ]);
}

if ($action === 'toggle_session_status') {
    $body = readJsonBody();
    $sid = trim((string) ($body['sessionId'] ?? ''));
    $nextStatus = ((string) ($body['status'] ?? 'CLOSED')) === 'OPEN' ? 'OPEN' : 'CLOSED';
    $closedAt = $nextStatus === 'CLOSED' ? nowIso() : null;
    $pdo->prepare('UPDATE attendance_sessions SET status = :st, closed_at = :ca WHERE id = :id AND owner_id = :oid')
        ->execute([':st' => $nextStatus, ':ca' => $closedAt, ':id' => $sid, ':oid' => $ownerId]);
    $sStmt = $pdo->prepare('SELECT * FROM attendance_sessions WHERE id = :id AND owner_id = :oid LIMIT 1');
    $sStmt->execute([':id' => $sid, ':oid' => $ownerId]);
    $session = $sStmt->fetch();
    jsonResponse([
        'ok' => true,
        'session' => $session ? attFormatSession($session, attComputeSessionStats($pdo, $sid), true) : null,
    ]);
}

if ($action === 'delete_session') {
    $body = readJsonBody();
    $sid = trim((string) ($body['sessionId'] ?? ''));
    $pdo->prepare('DELETE FROM attendance_records WHERE session_id = :sid')->execute([':sid' => $sid]);
    $pdo->prepare('DELETE FROM attendance_sessions WHERE id = :id AND owner_id = :oid')->execute([':id' => $sid, ':oid' => $ownerId]);
    jsonResponse(['ok' => true]);
}

if ($action === 'save_records_bulk') {
    $body = readJsonBody();
    $sid = trim((string) ($body['sessionId'] ?? ''));
    $sStmt = $pdo->prepare('SELECT * FROM attendance_sessions WHERE id = :id AND owner_id = :oid LIMIT 1');
    $sStmt->execute([':id' => $sid, ':oid' => $ownerId]);
    if (!$sStmt->fetch()) {
        jsonError('Không tìm thấy buổi điểm danh.', 404);
    }

    $updates = is_array($body['updates'] ?? null) ? $body['updates'] : [];
    $allowed = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'];
    $now = nowIso();
    $upd = $pdo->prepare('UPDATE attendance_records SET attendance_status = :st, note = :note, updated_at = :ua WHERE id = :id AND session_id = :sid');
    foreach ($updates as $u) {
        $rid = trim((string) ($u['id'] ?? ''));
        $st = (string) ($u['attendanceStatus'] ?? '');
        if ($rid === '' || !in_array($st, $allowed, true)) {
            continue;
        }
        $note = trim((string) ($u['note'] ?? ''));
        $upd->execute([':st' => $st, ':note' => $note, ':ua' => $now, ':id' => $rid, ':sid' => $sid]);
    }

    $rStmt = $pdo->prepare('SELECT * FROM attendance_records WHERE session_id = :sid ORDER BY first_name ASC, last_name ASC, student_code ASC');
    $rStmt->execute([':sid' => $sid]);
    $records = array_map('attFormatRecord', $rStmt->fetchAll());
    $stats = attComputeSessionStats($pdo, $sid);
    jsonResponse(['ok' => true, 'records' => $records, 'stats' => $stats]);
}

if ($action === 'class_summary_matrix') {
    $classId = trim((string) ($_GET['classId'] ?? ''));
    $cStmt = $pdo->prepare('SELECT * FROM attendance_classes WHERE id = :id AND owner_id = :oid LIMIT 1');
    $cStmt->execute([':id' => $classId, ':oid' => $ownerId]);
    $cls = $cStmt->fetch();
    if (!$cls) {
        jsonError('Không tìm thấy lớp điểm danh.', 404);
    }
    $sStmt = $pdo->prepare('SELECT * FROM attendance_sessions WHERE class_id = :cid AND owner_id = :oid ORDER BY session_date ASC, created_at ASC');
    $sStmt->execute([':cid' => $classId, ':oid' => $ownerId]);
    $sessions = [];
    $recordsBySession = [];
    foreach ($sStmt->fetchAll() as $sRow) {
        $sid = (string) $sRow['id'];
        $sessions[] = attFormatSession($sRow, attComputeSessionStats($pdo, $sid), false);
        $rStmt = $pdo->prepare('SELECT * FROM attendance_records WHERE session_id = :sid');
        $rStmt->execute([':sid' => $sid]);
        $recordsBySession[$sid] = array_map('attFormatRecord', $rStmt->fetchAll());
    }
    jsonResponse([
        'ok' => true,
        'matrix' => [
            'classInfo' => attFormatClass($cls, count($sessions)),
            'sessions' => $sessions,
            'recordsBySession' => $recordsBySession,
        ],
    ]);
}

jsonError('Action điểm danh không hợp lệ.', 400);
