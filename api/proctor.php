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
            'SELECT a.exam_id, a.shift_id, a.login_devices_json,
                    a.status, a.bonus_seconds, a.extra_leave_allowance, a.locked_wait_seconds, a.started_at,
                    COALESCE(s.status, e.status) AS exam_status
             FROM exam_attempts a
             LEFT JOIN exams e ON e.id = a.exam_id
             LEFT JOIN exam_shifts s ON s.id = a.shift_id
             WHERE a.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $attemptId]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonError('Not found', 404);
        }

        $examStatus = (string) ($row['exam_status'] ?? 'OPEN');
        $out = [
            'ok' => true,
            's' => $row['status'],
            'b' => (int) $row['bonus_seconds'],
            'x' => (int) $row['extra_leave_allowance'],
            'w' => (int) $row['locked_wait_seconds'],
            'e' => $examStatus,
            'sa' => $row['started_at'],
        ];

        $includeLobbyPeers = (($_GET['lobby'] ?? '') === '1') || $examStatus === 'WAITING';
        if ($includeLobbyPeers) {
            $eid = (string) $row['exam_id'];
            $sid = !empty($row['shift_id']) ? (string) $row['shift_id'] : null;
            if ($sid !== null) {
                $pStmt = $pdo->prepare(
                    "SELECT id, student_code, student_name, class_name, login_devices_json
                     FROM exam_attempts
                     WHERE exam_id = :eid AND (shift_id = :sid OR shift_id IS NULL)
                       AND status IN ('IN_PROGRESS', 'PAUSED', 'LOCKED')
                     ORDER BY started_at DESC
                     LIMIT 120"
                );
                $pStmt->execute([':eid' => $eid, ':sid' => $sid]);
            } else {
                $pStmt = $pdo->prepare(
                    "SELECT id, student_code, student_name, class_name, login_devices_json
                     FROM exam_attempts
                     WHERE exam_id = :eid
                       AND status IN ('IN_PROGRESS', 'PAUSED', 'LOCKED')
                     ORDER BY started_at DESC
                     LIMIT 120"
                );
                $pStmt->execute([':eid' => $eid]);
            }
            $peersOut = [];
            foreach ($pStmt->fetchAll() as $pr) {
                $devs = decodeJsonSafe($pr['login_devices_json'] ?? null, []);
                $av = '';
                if (is_array($devs) && isset($devs[0]['avatarId'])) {
                    $av = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $devs[0]['avatarId']);
                }
                $peersOut[] = [
                    'id' => (string) $pr['id'],
                    'code' => (string) $pr['student_code'],
                    'name' => (string) $pr['student_name'],
                    'cls' => (string) ($pr['class_name'] ?? ''),
                    'av' => $av,
                ];
            }
            $out['peers'] = $peersOut;
        }

        jsonResponse($out);
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

        $stmt = $pdo->prepare(
            'SELECT a.*, e.unlock_pin AS exam_unlock_pin, s.unlock_pin AS shift_unlock_pin, e.max_leave_count
             FROM exam_attempts a
             JOIN exams e ON e.id = a.exam_id
             LEFT JOIN exam_shifts s ON s.id = a.shift_id
             WHERE a.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $attemptId]);
        $att = $stmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy bài thi.', 404);
        }
        $shiftPin = trim((string) ($att['shift_unlock_pin'] ?? ''));
        $examPin = trim((string) ($att['exam_unlock_pin'] ?? ''));
        $matchesShift = ($shiftPin !== '' && hash_equals($shiftPin, $pin));
        $matchesExam = ($examPin !== '' && hash_equals($examPin, $pin));
        if (!$matchesShift && !$matchesExam) {
            usleep(250000);
            jsonError('Sai mã PIN giám thị tại chỗ.', 403);
        }

        $waitDelta = !empty($att['locked_at']) ? max(0, time() - strtotime((string) $att['locked_at'])) : 0;
        $newAllow = max(((int) $att['extra_leave_allowance']) + 1, ((int) $att['leave_count']) - ((int) $att['max_leave_count'] - 1));

        $pdo->prepare("UPDATE exam_attempts SET status='IN_PROGRESS', locked_at=NULL, locked_wait_seconds=locked_wait_seconds+:wd, extra_leave_allowance=:ea WHERE id=:id")
            ->execute([':wd' => $waitDelta, ':ea' => $newAllow, ':id' => $attemptId]);

        jsonResponse(['ok' => true, 'status' => 'IN_PROGRESS', 'extraLeaveAllowance' => $newAllow]);
    }

    if ($action === 'set_avatar') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $avatarId = preg_replace('/[^a-zA-Z0-9_-]/', '', trim((string) ($body['avatarId'] ?? '')));
        if ($attemptId === '' || $avatarId === '' || strlen($avatarId) > 24) {
            jsonError('Thiếu attemptId hoặc avatarId không hợp lệ.', 400);
        }

        $stmt = $pdo->prepare('SELECT login_devices_json FROM exam_attempts WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $attemptId]);
        $att = $stmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy phiên thi.', 404);
        }

        $devices = decodeJsonSafe($att['login_devices_json'] ?? null, []);
        if (!is_array($devices) || count($devices) === 0) {
            $devices = [[
                'deviceToken' => '',
                'deviceLabel' => 'Student Lobby',
                'at' => nowIso(),
                'avatarId' => $avatarId,
            ]];
        } else {
            $devices[0]['avatarId'] = $avatarId;
        }

        $pdo->prepare('UPDATE exam_attempts SET login_devices_json = :ld WHERE id = :id')
            ->execute([
                ':ld' => json_encode($devices, JSON_UNESCAPED_UNICODE),
                ':id' => $attemptId,
            ]);

        jsonResponse(['ok' => true, 'avatarId' => $avatarId]);
    }

    // Admin proctoring actions below require Bearer HMAC
    $auth = requireAdminAuth();
    $authRole = (string) ($auth['role'] ?? 'DEMO');
    $authActorId = (string) ($auth['instructorId'] ?? 'DEMO_INSTRUCTOR');

    if ($action === 'live') {
        $examId = trim((string) ($_GET['examId'] ?? ''));
        $scopeWhere = $authRole !== 'OFFICIAL'
            ? "e.owner_id = 'SYSTEM_DEMO'"
            : ($authActorId === 'MASTER_ADMIN' ? '1=1' : 'e.owner_id = :uid');

        if ($examId !== '') {
            $stmt = $pdo->prepare("SELECT a.* FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.exam_id = :eid AND ($scopeWhere) ORDER BY a.started_at DESC");
            $params = [':eid' => $examId];
            if ($authRole === 'OFFICIAL' && $authActorId !== 'MASTER_ADMIN') {
                $params[':uid'] = $authActorId;
            }
            $stmt->execute($params);
        } else {
            $stmt = $pdo->prepare("SELECT a.* FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE ($scopeWhere) ORDER BY a.started_at DESC LIMIT 1000");
            $params = [];
            if ($authRole === 'OFFICIAL' && $authActorId !== 'MASTER_ADMIN') {
                $params[':uid'] = $authActorId;
            }
            $stmt->execute($params);
        }
        $rows = $stmt->fetchAll();

        $attemptIds = array_map(static fn (array $r): string => (string) $r['id'], $rows);
        $viosByAttempt = [];
        if (count($attemptIds) > 0) {
            foreach (array_chunk($attemptIds, 200) as $chunk) {
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                $vStmt = $pdo->prepare("SELECT * FROM violation_logs WHERE attempt_id IN ($ph) ORDER BY occurred_at ASC");
                $vStmt->execute($chunk);
                foreach ($vStmt->fetchAll() as $v) {
                    $viosByAttempt[(string) $v['attempt_id']][] = [
                        'id' => $v['id'],
                        'severity' => $v['severity'],
                        'eventType' => $v['event_type'],
                        'durationSeconds' => (int) $v['duration_seconds'],
                        'detail' => $v['detail'],
                        'occurredAt' => $v['occurred_at'],
                    ];
                }
            }
        }
        $answersByAttempt = fetchAttemptAnswersBatchPhp($pdo, $attemptIds, true);

        $attOut = [];
        foreach ($rows as $r) {
            $aid = (string) $r['id'];
            $vios = $viosByAttempt[$aid] ?? [];
            $ansMap = $answersByAttempt[$aid] ?? [];

            $attOut[] = [
                'id' => $r['id'],
                'examId' => $r['exam_id'],
                'shiftId' => !empty($r['shift_id']) ? (string) $r['shift_id'] : null,
                'studentCode' => $r['student_code'],
                'studentName' => $r['student_name'],
                'studentEmail' => $r['student_email'],
                'className' => $r['class_name'],
                'deviceToken' => $r['device_token'] ?? '',
                'deviceLabel' => $r['device_label'] ?? '',
                'locationLat' => isset($r['location_lat']) && $r['location_lat'] !== null ? (float) $r['location_lat'] : null,
                'locationLng' => isset($r['location_lng']) && $r['location_lng'] !== null ? (float) $r['location_lng'] : null,
                'locationAccuracy' => isset($r['location_accuracy']) && $r['location_accuracy'] !== null ? (float) $r['location_accuracy'] : null,
                'loginDevices' => decodeJsonSafe($r['login_devices_json'] ?? null, []),
                'assignedQuestions' => decodeJsonSafe($r['assigned_questions_json'] ?? null, []),
                'answers' => count($ansMap) > 0 ? $ansMap : new stdClass(),
                'status' => $r['status'],
                'currentQuestionIndex' => (int) $r['current_question_index'],
                'flaggedQuestionIds' => decodeJsonSafe($r['flagged_question_ids_json'] ?? null, []),
                'leaveCount' => (int) $r['leave_count'],
                'extraLeaveAllowance' => (int) $r['extra_leave_allowance'],
                'minorBlurCount' => (int) $r['minor_blur_count'],
                'totalAwaySeconds' => (int) $r['total_away_seconds'],
                'lockedAt' => $r['locked_at'] ?: null,
                'lockedWaitSeconds' => (int) $r['locked_wait_seconds'],
                'bonusSeconds' => (int) $r['bonus_seconds'],
                'unlockRequestNote' => $r['unlock_request_note'] ?: null,
                'integrityScore' => (int) $r['integrity_score'],
                'aiFlag' => (bool) $r['ai_flag'],
                'aiFlagReason' => $r['ai_flag_reason'] ?: null,
                'autoScore' => (float) $r['auto_score'],
                'essayScore' => (float) $r['essay_score'],
                'totalScore' => (float) $r['total_score'],
                'maxTotalScore' => (float) $r['max_total_score'],
                'scale10Score' => (float) $r['scale10_score'],
                'emailSentStatus' => $r['email_sent_status'],
                'emailSentAt' => $r['email_sent_at'] ?: null,
                'emailEditCount' => (int) ($r['email_edit_count'] ?? 0),
                'startedAt' => $r['started_at'],
                'submittedAt' => $r['submitted_at'] ?: null,
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

    if ($action === 'override_essay') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $questionId = trim((string) ($body['questionId'] ?? ''));
        $newScore = (float) ($body['newScore'] ?? 0);
        $note = trim((string) ($body['note'] ?? ''));
        if ($attemptId === '' || $questionId === '') {
            jsonError('Thiếu attemptId hoặc questionId.', 400);
        }

        $ansStmt = $pdo->prepare('SELECT id, max_points FROM attempt_answers WHERE attempt_id = :aid AND question_id = :qid LIMIT 1');
        $ansStmt->execute([':aid' => $attemptId, ':qid' => $questionId]);
        $ansRow = $ansStmt->fetch();
        if (!$ansRow) {
            jsonError('Không tìm thấy câu trả lời cần chấm lại.', 404);
        }
        $maxPts = (float) ($ansRow['max_points'] ?? 1);
        $clamped = max(0.0, min($maxPts, round($newScore, 2)));
        $isCorr = ($maxPts > 0 && $clamped >= $maxPts * 0.5) ? 1 : 0;
        $fb = $note !== ''
            ? ($note . ' (Giảng viên chấm ' . $clamped . '/' . $maxPts . 'đ)')
            : ('Giảng viên điều chỉnh trực tiếp: ' . $clamped . '/' . $maxPts . 'đ');

        $pdo->prepare("UPDATE attempt_answers SET earned_points=:ep, grading_status='MANUAL_OVERRIDE', is_correct=:ic, grading_feedback=:fb WHERE id=:id")
            ->execute([
                ':ep' => $clamped,
                ':ic' => $isCorr,
                ':fb' => $fb,
                ':id' => $ansRow['id'],
            ]);

        $sumStmt = $pdo->prepare('SELECT grading_status, max_points, earned_points FROM attempt_answers WHERE attempt_id = :aid');
        $sumStmt->execute([':aid' => $attemptId]);
        $autoSum = 0.0;
        $essaySum = 0.0;
        $maxSum = 0.0;
        foreach ($sumStmt->fetchAll() as $s) {
            $gs = (string) ($s['grading_status'] ?? 'AUTO');
            $ep = (float) ($s['earned_points'] ?? 0);
            $mp = (float) ($s['max_points'] ?? 0);
            $maxSum += $mp;
            if ($gs === 'AUTO') {
                $autoSum += $ep;
            } else {
                $essaySum += $ep;
            }
        }
        $tot = round($autoSum + $essaySum, 2);
        $s10 = $maxSum > 0 ? round(($tot / $maxSum) * 10, 2) : 0.0;
        $pdo->prepare('UPDATE exam_attempts SET auto_score=:as, essay_score=:es, total_score=:ts, scale10_score=:s10 WHERE id=:id')
            ->execute([':as' => round($autoSum, 2), ':es' => round($essaySum, 2), ':ts' => $tot, ':s10' => $s10, ':id' => $attemptId]);

        jsonResponse([
            'ok' => true,
            'earnedPoints' => $clamped,
            'autoScore' => round($autoSum, 2),
            'essayScore' => round($essaySum, 2),
            'totalScore' => $tot,
            'scale10Score' => $s10,
        ]);
    }

    if ($action === 'resend_email') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $editedEmail = strtolower(trim((string) ($body['editedEmail'] ?? '')));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }

        $stmt = $pdo->prepare('SELECT * FROM exam_attempts WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $attemptId]);
        $att = $stmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy bài thi.', 404);
        }

        $targetEmail = $editedEmail !== '' ? $editedEmail : strtolower(trim((string) ($att['student_email'] ?? '')));
        if (!filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
            jsonError('Địa chỉ email không hợp lệ.', 400);
        }

        $res = finalizeAndGradeAttempt($pdo, $attemptId, ($att['status'] ?? '') === 'AUTO_SUBMITTED');
        $isDemoContext = ($authRole !== 'OFFICIAL') || isDemoExamRecord($res['exam']);

        $pdo->prepare("UPDATE exam_attempts SET student_email = :em, email_sent_status = :ess, email_sent_at = :now WHERE id = :id")
            ->execute([
                ':em' => $targetEmail,
                ':ess' => $isDemoContext ? 'DEMO_SKIPPED' : 'SENT',
                ':now' => nowIso(),
                ':id' => $attemptId,
            ]);

        $subj = '[VNEconomics] (Giảng viên gửi lại) Kết quả bài thi: ' . ($res['exam']['title'] ?? '');
        $html = buildStudentScoreEmailHtml($res['exam'], $res['attempt'], $res['answers']);
        enqueueAndSendEmail($pdo, $targetEmail, $subj, $html, 'STUDENT_SCORE', 'Giảng viên cập nhật & gửi lại điểm', null, null, true, $isDemoContext);

        jsonResponse(['ok' => true, 'email' => $targetEmail, 'demoSkipped' => $isDemoContext]);
    }

    jsonError('Action proctor không hợp lệ.', 400);
}
