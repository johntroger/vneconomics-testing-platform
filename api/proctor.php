<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Live Proctoring, Anti-Cheat Telemetry & Unlock Arbitration API
 * Student endpoints: ?action=log, ?action=poll (<150B), ?action=unlock_note, ?action=rescue_pin
 * Admin endpoints (Bearer HMAC required): ?action=live, ?action=decision, ?action=reset_device, ?action=bonus_time
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';
require_once __DIR__ . '/attempts.php';

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $pdo = getDb();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $body = $method === 'GET' ? [] : readJsonBody();

    if ($action === 'poll') {
        $attemptId = trim((string) ($_GET['attemptId'] ?? ''));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }

        $stmt = $pdo->prepare(
            'SELECT a.status, a.bonus_seconds, a.extra_leave_allowance, a.locked_wait_seconds, e.status AS exam_status
             FROM exam_attempts a LEFT JOIN exams e ON e.id = a.exam_id WHERE a.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $attemptId]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonError('Not found', 404);
        }

        // Ultra-lightweight JSON (< 150 bytes)
        jsonResponse([
            'ok' => true,
            's' => $row['status'],
            'b' => (int) $row['bonus_seconds'],
            'x' => (int) $row['extra_leave_allowance'],
            'w' => (int) $row['locked_wait_seconds'],
            'e' => $row['exam_status'] ?? 'OPEN',
        ]);
    }

    if ($action === 'log') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $severity = strtoupper(trim((string) ($body['severity'] ?? 'MAJOR_LEAVE')));
        $eventType = trim((string) ($body['eventType'] ?? 'UNKNOWN'));
        $duration = max(0, (int) ($body['durationSeconds'] ?? 0));
        $detail = trim((string) ($body['detail'] ?? ''));

        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }

        $attStmt = $pdo->prepare('SELECT a.*, e.max_leave_count, e.max_away_seconds FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = :id LIMIT 1');
        $attStmt->execute([':id' => $attemptId]);
        $att = $attStmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy bài thi.', 404);
        }
        if (in_array($att['status'], ['SUBMITTED', 'AUTO_SUBMITTED'], true)) {
            jsonResponse(['ok' => true, 'locked' => false, 'status' => $att['status']]);
        }

        $pdo->prepare('INSERT INTO violation_logs (id, attempt_id, severity, event_type, duration_seconds, detail, occurred_at) VALUES (:id, :aid, :sev, :et, :dur, :det, :occ)')
            ->execute([
                ':id' => generateId('vio'),
                ':aid' => $attemptId,
                ':sev' => $severity,
                ':et' => $eventType,
                ':dur' => $duration,
                ':det' => $detail,
                ':occ' => nowIso(),
            ]);

        $isMinor = $severity === 'MINOR_BLUR';
        $isMajor = in_array($severity, ['MAJOR_LEAVE', 'SPLIT_SCREEN', 'DEVTOOLS'], true);

        $nextLeave = (int) $att['leave_count'] + ($isMajor ? 1 : 0);
        $nextMinor = (int) $att['minor_blur_count'] + ($isMinor ? 1 : 0);
        $nextAway = (int) $att['total_away_seconds'] + $duration;
        $maxLeaves = (int) $att['max_leave_count'] + (int) $att['extra_leave_allowance'];
        $maxAway = (int) $att['max_away_seconds'];

        $shouldLock = ($severity === 'SPLIT_SCREEN') || ($nextLeave >= $maxLeaves) || ($nextAway >= $maxAway);
        $integrity = max(0, min(100, 100 - ($nextLeave * 12) - ((int) floor($nextAway / 5) * 3) - ($nextMinor * 2) - ($severity === 'HONEYPOT' ? 40 : 0)));

        $newStatus = $shouldLock ? 'LOCKED' : $att['status'];
        $lockedAt = ($shouldLock && empty($att['locked_at'])) ? nowIso() : $att['locked_at'];

        $pdo->prepare(
            'UPDATE exam_attempts SET leave_count=:lc, minor_blur_count=:mb, total_away_seconds=:tas, integrity_score=:intg, ai_flag=CASE WHEN ai_flag=1 OR :hp=1 THEN 1 ELSE 0 END, ai_flag_reason=CASE WHEN :hp2=1 THEN :hpr ELSE ai_flag_reason END, status=:st, locked_at=:la WHERE id=:id'
        )->execute([
            ':lc' => $nextLeave,
            ':mb' => $nextMinor,
            ':tas' => $nextAway,
            ':intg' => $integrity,
            ':hp' => $severity === 'HONEYPOT' ? 1 : 0,
            ':hp2' => $severity === 'HONEYPOT' ? 1 : 0,
            ':hpr' => 'Phát hiện từ khóa / đáp án Bẫy AI Honeypot',
            ':st' => $newStatus,
            ':la' => $lockedAt,
            ':id' => $attemptId,
        ]);

        jsonResponse([
            'ok' => true,
            'locked' => $shouldLock,
            'status' => $newStatus,
            'leaveCount' => $nextLeave,
            'totalAwaySeconds' => $nextAway,
            'integrityScore' => $integrity,
        ]);
    }

    if ($action === 'unlock_note') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $note = trim((string) ($body['note'] ?? ''));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }
        $pdo->prepare('UPDATE exam_attempts SET unlock_request_note = :note WHERE id = :id')
            ->execute([':note' => mb_substr($note, 0, 500, 'UTF-8'), ':id' => $attemptId]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'rescue_pin') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $pin = trim((string) ($body['pin'] ?? ''));
        if ($attemptId === '' || $pin === '') {
            jsonError('Thiếu attemptId hoặc mã PIN giải cứu.', 400);
        }

        $stmt = $pdo->prepare('SELECT a.*, e.unlock_pin, e.max_leave_count FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = :id LIMIT 1');
        $stmt->execute([':id' => $attemptId]);
        $att = $stmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy bài thi.', 404);
        }
        if (!hash_equals((string) $att['unlock_pin'], $pin)) {
            usleep(250000);
            jsonError('Sai mã PIN giám thị tại chỗ.', 403);
        }

        $waitDelta = !empty($att['locked_at']) ? max(0, time() - strtotime((string) $att['locked_at'])) : 0;
        $newAllow = max(((int) $att['extra_leave_allowance']) + 1, ((int) $att['leave_count']) - ((int) $att['max_leave_count'] - 1));

        $pdo->prepare("UPDATE exam_attempts SET status='IN_PROGRESS', locked_at=NULL, locked_wait_seconds=locked_wait_seconds+:wd, extra_leave_allowance=:ea WHERE id=:id")
            ->execute([':wd' => $waitDelta, ':ea' => $newAllow, ':id' => $attemptId]);

        jsonResponse(['ok' => true, 'status' => 'IN_PROGRESS', 'extraLeaveAllowance' => $newAllow]);
    }

    // Admin proctoring actions below require Bearer HMAC
    requireAdminAuth();

    if ($action === 'live') {
        $examId = trim((string) ($_GET['examId'] ?? ''));
        if ($examId !== '') {
            $stmt = $pdo->prepare('SELECT * FROM exam_attempts WHERE exam_id = :eid ORDER BY started_at DESC');
            $stmt->execute([':eid' => $examId]);
        } else {
            $stmt = $pdo->query('SELECT * FROM exam_attempts ORDER BY started_at DESC LIMIT 200');
        }
        $rows = $stmt->fetchAll();

        $attOut = [];
        $vStmt = $pdo->prepare('SELECT * FROM violation_logs WHERE attempt_id = :aid ORDER BY occurred_at ASC');
        foreach ($rows as $r) {
            $vStmt->execute([':aid' => $r['id']]);
            $vios = array_map(static fn ($v) => [
                'id' => $v['id'],
                'severity' => $v['severity'],
                'eventType' => $v['event_type'],
                'durationSeconds' => (int) $v['duration_seconds'],
                'detail' => $v['detail'],
                'occurredAt' => $v['occurred_at'],
            ], $vStmt->fetchAll());

            $attOut[] = [
                'id' => $r['id'],
                'examId' => $r['exam_id'],
                'studentCode' => $r['student_code'],
                'studentName' => $r['student_name'],
                'studentEmail' => $r['student_email'],
                'className' => $r['class_name'],
                'status' => $r['status'],
                'currentQuestionIndex' => (int) $r['current_question_index'],
                'leaveCount' => (int) $r['leave_count'],
                'extraLeaveAllowance' => (int) $r['extra_leave_allowance'],
                'minorBlurCount' => (int) $r['minor_blur_count'],
                'totalAwaySeconds' => (int) $r['total_away_seconds'],
                'lockedAt' => $r['locked_at'],
                'lockedWaitSeconds' => (int) $r['locked_wait_seconds'],
                'bonusSeconds' => (int) $r['bonus_seconds'],
                'unlockRequestNote' => $r['unlock_request_note'],
                'integrityScore' => (int) $r['integrity_score'],
                'aiFlag' => (bool) $r['ai_flag'],
                'aiFlagReason' => $r['ai_flag_reason'],
                'autoScore' => (float) $r['auto_score'],
                'essayScore' => (float) $r['essay_score'],
                'totalScore' => (float) $r['total_score'],
                'maxTotalScore' => (float) $r['max_total_score'],
                'scale10Score' => (float) $r['scale10_score'],
                'emailSentStatus' => $r['email_sent_status'],
                'startedAt' => $r['started_at'],
                'submittedAt' => $r['submitted_at'],
                'violations' => $vios,
            ];
        }

        jsonResponse(['ok' => true, 'attempts' => $attOut]);
    }

    if ($action === 'decision') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $decision = strtoupper(trim((string) ($body['decision'] ?? '')));
        $extraSeconds = max(0, (int) ($body['extraSeconds'] ?? 0));

        if (!in_array($decision, ['ACCEPT_KEEP', 'ACCEPT_COMPENSATE', 'REJECT'], true)) {
            jsonError('Quyết định không hợp lệ.', 400);
        }

        $stmt = $pdo->prepare('SELECT a.*, e.max_leave_count FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = :id LIMIT 1');
        $stmt->execute([':id' => $attemptId]);
        $att = $stmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy bài thi.', 404);
        }

        if ($decision === 'REJECT') {
            $res = finalizeAndGradeAttempt($pdo, $attemptId, true);
            jsonResponse(['ok' => true, 'decision' => 'REJECT', 'attempt' => $res['attempt']]);
        }

        $waitDelta = !empty($att['locked_at']) ? max(0, time() - strtotime((string) $att['locked_at'])) : 0;
        $bonusDelta = $decision === 'ACCEPT_COMPENSATE' ? ($waitDelta + $extraSeconds) : 0;
        $newAllow = max(((int) $att['extra_leave_allowance']) + 1, ((int) $att['leave_count']) - ((int) $att['max_leave_count'] - 1));

        $pdo->prepare("UPDATE exam_attempts SET status='IN_PROGRESS', locked_at=NULL, locked_wait_seconds=locked_wait_seconds+:wd, bonus_seconds=bonus_seconds+:bd, extra_leave_allowance=:ea WHERE id=:id")
            ->execute([':wd' => $waitDelta, ':bd' => $bonusDelta, ':ea' => $newAllow, ':id' => $attemptId]);

        jsonResponse(['ok' => true, 'decision' => $decision, 'bonusAdded' => $bonusDelta, 'extraLeaveAllowance' => $newAllow]);
    }

    if ($action === 'reset_device') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }
        $pdo->prepare("UPDATE exam_attempts SET device_token = '' WHERE id = :id")->execute([':id' => $attemptId]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'bonus_time') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $extraSeconds = max(1, (int) ($body['extraSeconds'] ?? 60));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }
        $pdo->prepare('UPDATE exam_attempts SET bonus_seconds = bonus_seconds + :bs WHERE id = :id')
            ->execute([':bs' => $extraSeconds, ':id' => $attemptId]);
        jsonResponse(['ok' => true, 'addedSeconds' => $extraSeconds]);
    }

    jsonError('Action proctor không hợp lệ.', 400);
}
