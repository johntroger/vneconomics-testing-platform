<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Courses, Questions & Exam Rooms API
 * Public: ?action=health, ?action=room&pin=XXXX (stripped of answers & unlock PIN)
 * Admin (Bearer HMAC required): ?action=bootstrap, save_course, delete_course, save_question,
 *   delete_question, save_exam, clone_exam, update_exam_status, regrade_rubric, delete_exam
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';
require_once __DIR__ . '/essay_grader.php';

function decodeJsonSafe(?string $raw, mixed $fallback): mixed
{
    if ($raw === null || $raw === '') {
        return $fallback;
    }
    $decoded = json_decode($raw, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function formatCourseRow(array $r): array
{
    return [
        'id' => (string) $r['id'],
        'code' => (string) $r['code'],
        'name' => (string) $r['name'],
        'semester' => (string) ($r['semester'] ?? ''),
        'credits' => (int) ($r['credits'] ?? 3),
        'ownerId' => (string) ($r['owner_id'] ?? 'SYSTEM_DEMO'),
    ];
}

function formatQuestionRow(array $r, bool $stripSecrets = false): array
{
    $options = decodeJsonSafe($r['options_json'] ?? null, null);
    $tfItems = decodeJsonSafe($r['true_false_items_json'] ?? null, null);
    if ($stripSecrets && is_array($tfItems)) {
        $tfItems = array_map(static fn (array $it): array => [
            'id' => (string) ($it['id'] ?? ''),
            'statement' => (string) ($it['statement'] ?? ''),
        ], $tfItems);
    }

    $blankSlots = decodeJsonSafe($r['blank_slots_json'] ?? null, null);
    if ($stripSecrets && is_array($blankSlots)) {
        $blankSlots = array_map(static fn (array $b): array => [
            'id' => (string) ($b['id'] ?? ''),
            'index' => (int) ($b['index'] ?? 1),
            'acceptedAnswers' => [],
            'caseSensitive' => (bool) ($b['caseSensitive'] ?? false),
        ], $blankSlots);
    }

    $q = [
        'id' => (string) $r['id'],
        'courseId' => (string) $r['course_id'],
        'ownerId' => (string) ($r['owner_id'] ?? 'SYSTEM_DEMO'),
        'chapterCategory' => (string) $r['chapter_category'],
        'difficulty' => (string) $r['difficulty'],
        'type' => (string) $r['type'],
        'content' => (string) $r['content'],
        'options' => $options,
        'trueFalseItems' => $tfItems,
        'blankSlots' => $blankSlots,
        'blankAllOrNothing' => (bool) ($r['blank_all_or_nothing'] ?? false),
        'variantGroup' => !empty($r['variant_group']) ? (string) $r['variant_group'] : null,
        'dynamicVars' => decodeJsonSafe($r['dynamic_vars_json'] ?? null, null),
        'numericalUnit' => $r['numerical_unit'] !== null ? (string) $r['numerical_unit'] : null,
        'tolerance' => (float) ($r['tolerance'] ?? 0.01),
        'maxChars' => $r['max_chars'] !== null ? (int) $r['max_chars'] : null,
        'aiHoneypotText' => $r['ai_honeypot_text'] !== null ? (string) $r['ai_honeypot_text'] : null,
        'points' => (float) ($r['points'] ?? 1.0),
    ];

    if (!$stripSecrets) {
        $q['correctOptionIds'] = decodeJsonSafe($r['correct_option_ids_json'] ?? null, null);
        $q['numericalFormula'] = $r['numerical_formula'] !== null ? (string) $r['numerical_formula'] : null;
        $q['sampleAnswer'] = $r['sample_answer'] !== null ? (string) $r['sample_answer'] : null;
        $q['gradingRubric'] = decodeJsonSafe($r['grading_rubric_json'] ?? null, null);
        $q['aiHoneypotOptionId'] = $r['ai_honeypot_option_id'] !== null ? (string) $r['ai_honeypot_option_id'] : null;
        $q['aiHoneypotKeyword'] = $r['ai_honeypot_keyword'] !== null ? (string) $r['ai_honeypot_keyword'] : null;
    }

    return $q;
}

function formatExamRow(array $r, bool $stripSecrets = false): array
{
    $whitelist = decodeJsonSafe($r['roster_whitelist_json'] ?? null, []);
    $rosterEntries = decodeJsonSafe($r['roster_entries_json'] ?? null, []);
    $exam = [
        'id' => (string) $r['id'],
        'courseId' => (string) $r['course_id'],
        'ownerId' => (string) ($r['owner_id'] ?? 'SYSTEM_DEMO'),
        'title' => (string) $r['title'],
        'roomPin' => (string) $r['room_pin'],
        'instructorEmail' => (string) ($r['instructor_email'] ?? ''),
        'durationMinutes' => (int) ($r['duration_minutes'] ?? 45),
        'chapterMatrix' => decodeJsonSafe($r['chapter_matrix_json'] ?? null, []),
        'pinnedQuestionIds' => decodeJsonSafe($r['pinned_question_ids_json'] ?? null, []),
        'shuffleQuestions' => (bool) ($r['shuffle_questions'] ?? true),
        'shuffleMode' => (string) ($r['shuffle_mode'] ?? 'BY_CHAPTER'),
        'shuffleOptions' => (bool) ($r['shuffle_options'] ?? true),
        'maxLeaveCount' => (int) ($r['max_leave_count'] ?? 3),
        'maxAwaySeconds' => (int) ($r['max_away_seconds'] ?? 25),
        'gracePeriodMs' => (int) ($r['grace_period_ms'] ?? 2000),
        'oneWayMode' => (bool) ($r['one_way_mode'] ?? false),
        'perQuestionSeconds' => (int) ($r['per_question_seconds'] ?? 0),
        'canvasAntiOcr' => (bool) ($r['canvas_anti_ocr'] ?? true),
        'requireFullscreen' => (bool) ($r['require_fullscreen'] ?? false),
        'allowReviewAfterSubmit' => (bool) ($r['allow_review_after_submit'] ?? false),
        'emailDeliveryMode' => (string) ($r['email_delivery_mode'] ?? 'IMMEDIATE'),
        'requiresWhitelist' => is_array($whitelist) && count($whitelist) > 0,
        'requiresRosterVerification' => is_array($rosterEntries) && count($rosterEntries) > 0,
        'status' => (string) ($r['status'] ?? 'DRAFT'),
        'lateEntryMinutes' => max(0, (int) ($r['late_entry_minutes'] ?? 0)),
        'scheduledStartAt' => !empty($r['scheduled_start_at']) ? (string) $r['scheduled_start_at'] : '',
        'scheduledEndAt' => !empty($r['scheduled_end_at']) ? (string) $r['scheduled_end_at'] : '',
        'reportSentStatus' => (string) ($r['report_sent_status'] ?? 'PENDING'),
        'reportSentAt' => $r['report_sent_at'] ?? null,
        'createdAt' => (string) $r['created_at'],
    ];

    if (!$stripSecrets) {
        $exam['unlockPin'] = (string) ($r['unlock_pin'] ?? '8888');
        $exam['rosterWhitelist'] = is_array($whitelist) ? $whitelist : [];
        $exam['rosterEntries'] = is_array($rosterEntries) ? $rosterEntries : [];
    }

    return $exam;
}

function formatShiftRow(array $r, bool $stripSecrets = false): array
{
    $whitelist = decodeJsonSafe($r['roster_whitelist_json'] ?? null, []);
    $rosterEntries = decodeJsonSafe($r['roster_entries_json'] ?? null, []);
    $shift = [
        'id' => (string) $r['id'],
        'examId' => (string) $r['exam_id'],
        'ownerId' => (string) ($r['owner_id'] ?? 'SYSTEM_DEMO'),
        'title' => (string) $r['title'],
        'roomPin' => (string) $r['room_pin'],
        'status' => (string) ($r['status'] ?? 'DRAFT'),
        'lateEntryMinutes' => max(0, (int) ($r['late_entry_minutes'] ?? 0)),
        'scheduledStartAt' => !empty($r['scheduled_start_at']) ? (string) $r['scheduled_start_at'] : '',
        'scheduledEndAt' => !empty($r['scheduled_end_at']) ? (string) $r['scheduled_end_at'] : '',
        'requiresWhitelist' => is_array($whitelist) && count($whitelist) > 0,
        'requiresRosterVerification' => is_array($rosterEntries) && count($rosterEntries) > 0,
        'reportSentStatus' => (string) ($r['report_sent_status'] ?? 'PENDING'),
        'reportSentAt' => $r['report_sent_at'] ?? null,
        'createdAt' => (string) $r['created_at'],
    ];

    if (!$stripSecrets) {
        $shift['unlockPin'] = (string) ($r['unlock_pin'] ?? '8888');
        $shift['rosterWhitelist'] = is_array($whitelist) ? $whitelist : [];
        $shift['rosterEntries'] = is_array($rosterEntries) ? $rosterEntries : [];
    }

    return $shift;
}

function upsertQuestionRow(PDO $pdo, array $body, string $actorId = 'SYSTEM_DEMO', bool $isMaster = false): array
{
    $id = trim((string) ($body['id'] ?? '')) ?: generateId('q');
    $courseId = trim((string) ($body['courseId'] ?? ''));
    $content = trim((string) ($body['content'] ?? ''));
    if ($courseId === '' || $content === '') {
        throw new InvalidArgumentException('Thiếu courseId hoặc nội dung câu hỏi.');
    }

    $params = [
        ':id' => $id,
        ':course_id' => $courseId,
        ':chapter_category' => trim((string) ($body['chapterCategory'] ?? 'Chương 1: Cơ bản')),
        ':difficulty' => strtoupper(trim((string) ($body['difficulty'] ?? 'MEDIUM'))),
        ':type' => strtoupper(trim((string) ($body['type'] ?? 'SINGLE_CHOICE'))),
        ':content' => $content,
        ':options_json' => isset($body['options']) ? json_encode($body['options'], JSON_UNESCAPED_UNICODE) : null,
        ':correct_option_ids_json' => isset($body['correctOptionIds']) ? json_encode($body['correctOptionIds'], JSON_UNESCAPED_UNICODE) : null,
        ':true_false_items_json' => isset($body['trueFalseItems']) ? json_encode($body['trueFalseItems'], JSON_UNESCAPED_UNICODE) : null,
        ':blank_slots_json' => isset($body['blankSlots']) ? json_encode($body['blankSlots'], JSON_UNESCAPED_UNICODE) : null,
        ':blank_all_or_nothing' => !empty($body['blankAllOrNothing']) ? 1 : 0,
        ':variant_group' => !empty($body['variantGroup']) ? trim((string) $body['variantGroup']) : null,
        ':dynamic_vars_json' => isset($body['dynamicVars']) ? json_encode($body['dynamicVars'], JSON_UNESCAPED_UNICODE) : null,
        ':numerical_formula' => $body['numericalFormula'] ?? null,
        ':numerical_unit' => $body['numericalUnit'] ?? null,
        ':tolerance' => (float) ($body['tolerance'] ?? 0.01),
        ':sample_answer' => $body['sampleAnswer'] ?? null,
        ':grading_rubric_json' => isset($body['gradingRubric']) ? json_encode($body['gradingRubric'], JSON_UNESCAPED_UNICODE) : null,
        ':max_chars' => isset($body['maxChars']) ? (int) $body['maxChars'] : null,
        ':ai_honeypot_text' => $body['aiHoneypotText'] ?? null,
        ':ai_honeypot_option_id' => $body['aiHoneypotOptionId'] ?? null,
        ':ai_honeypot_keyword' => $body['aiHoneypotKeyword'] ?? null,
        ':points' => (float) ($body['points'] ?? 1.0),
    ];

    $exists = $pdo->prepare('SELECT owner_id FROM questions WHERE id = :id LIMIT 1');
    $exists->execute([':id' => $id]);
    $existingOwner = $exists->fetchColumn();
    $isUpdate = ($existingOwner !== false);
    if ($isUpdate) {
        if (!$isMaster && (string) $existingOwner !== $actorId) {
            throw new InvalidArgumentException('Bạn chỉ được chỉnh sửa câu hỏi do tài khoản của mình tạo.');
        }
        $sql = 'UPDATE questions SET course_id=:course_id, chapter_category=:chapter_category, difficulty=:difficulty, type=:type, content=:content, options_json=:options_json, correct_option_ids_json=:correct_option_ids_json, true_false_items_json=:true_false_items_json, blank_slots_json=:blank_slots_json, blank_all_or_nothing=:blank_all_or_nothing, variant_group=:variant_group, dynamic_vars_json=:dynamic_vars_json, numerical_formula=:numerical_formula, numerical_unit=:numerical_unit, tolerance=:tolerance, sample_answer=:sample_answer, grading_rubric_json=:grading_rubric_json, max_chars=:max_chars, ai_honeypot_text=:ai_honeypot_text, ai_honeypot_option_id=:ai_honeypot_option_id, ai_honeypot_keyword=:ai_honeypot_keyword, points=:points WHERE id=:id';
    } else {
        $params[':owner_id'] = $actorId;
        $sql = 'INSERT INTO questions (id, course_id, owner_id, chapter_category, difficulty, type, content, options_json, correct_option_ids_json, true_false_items_json, blank_slots_json, blank_all_or_nothing, variant_group, dynamic_vars_json, numerical_formula, numerical_unit, tolerance, sample_answer, grading_rubric_json, max_chars, ai_honeypot_text, ai_honeypot_option_id, ai_honeypot_keyword, points)
                VALUES (:id, :course_id, :owner_id, :chapter_category, :difficulty, :type, :content, :options_json, :correct_option_ids_json, :true_false_items_json, :blank_slots_json, :blank_all_or_nothing, :variant_group, :dynamic_vars_json, :numerical_formula, :numerical_unit, :tolerance, :sample_answer, :grading_rubric_json, :max_chars, :ai_honeypot_text, :ai_honeypot_option_id, :ai_honeypot_keyword, :points)';
    }
    $pdo->prepare($sql)->execute($params);

    return ['id' => $id, 'op' => $isUpdate ? 'updated' : 'added'];
}

function fetchScopedData(PDO $pdo, array $auth): array
{
    $role = (string) ($auth['role'] ?? 'DEMO');
    $actorId = (string) ($auth['instructorId'] ?? 'DEMO_INSTRUCTOR');

    if ($role !== 'OFFICIAL') {
        $cRows = $pdo->query("SELECT * FROM courses WHERE owner_id = 'SYSTEM_DEMO' ORDER BY code ASC")->fetchAll();
        $qRows = $pdo->query("SELECT * FROM questions WHERE owner_id = 'SYSTEM_DEMO'")->fetchAll();
        $eRows = $pdo->query("SELECT * FROM exams WHERE owner_id = 'SYSTEM_DEMO' ORDER BY created_at DESC")->fetchAll();
        $sRows = $pdo->query("SELECT * FROM exam_shifts WHERE owner_id = 'SYSTEM_DEMO' ORDER BY created_at DESC")->fetchAll();
    } elseif ($actorId === 'MASTER_ADMIN') {
        $cRows = $pdo->query('SELECT * FROM courses ORDER BY code ASC')->fetchAll();
        $qRows = $pdo->query('SELECT * FROM questions')->fetchAll();
        $eRows = $pdo->query('SELECT * FROM exams ORDER BY created_at DESC')->fetchAll();
        $sRows = $pdo->query('SELECT * FROM exam_shifts ORDER BY created_at DESC')->fetchAll();
    } else {
        $cStmt = $pdo->prepare('SELECT * FROM courses WHERE owner_id = :uid ORDER BY code ASC');
        $cStmt->execute([':uid' => $actorId]);
        $cRows = $cStmt->fetchAll();

        $qStmt = $pdo->prepare('SELECT * FROM questions WHERE owner_id = :uid');
        $qStmt->execute([':uid' => $actorId]);
        $qRows = $qStmt->fetchAll();

        $eStmt = $pdo->prepare('SELECT * FROM exams WHERE owner_id = :uid ORDER BY created_at DESC');
        $eStmt->execute([':uid' => $actorId]);
        $eRows = $eStmt->fetchAll();

        $sStmt = $pdo->prepare('SELECT * FROM exam_shifts WHERE owner_id = :uid ORDER BY created_at DESC');
        $sStmt->execute([':uid' => $actorId]);
        $sRows = $sStmt->fetchAll();
    }

    return [
        'courses' => array_map('formatCourseRow', $cRows),
        'questions' => array_map(static fn ($r) => formatQuestionRow($r, false), $qRows),
        'exams' => array_map(static fn ($r) => formatExamRow($r, false), $eRows),
        'shifts' => array_map(static fn ($r) => formatShiftRow($r, false), $sRows),
    ];
}

/**
 * Resets started_at to the official release timestamp for waiting-room attempts
 * that have zero answers and zero violations when transitioning into OPEN.
 */
function resetUntouchedWaitingRoomClocks(PDO $pdo, string $scopeCol, string $scopeId): void
{
    if (!in_array($scopeCol, ['exam_id', 'shift_id'], true) || $scopeId === '') {
        return;
    }
    $pdo->prepare(
        "UPDATE exam_attempts SET started_at = :now
         WHERE {$scopeCol} = :sid
           AND status = 'IN_PROGRESS'
           AND leave_count = 0
           AND minor_blur_count = 0
           AND total_away_seconds = 0
           AND NOT EXISTS (SELECT 1 FROM attempt_answers aa WHERE aa.attempt_id = exam_attempts.id)"
    )->execute([':now' => nowIso(), ':sid' => $scopeId]);
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? 'health';

    if ($action === 'health') {
        jsonResponse([
            'ok' => true,
            'driver' => getDbDriver(),
            'time' => nowIso(),
            'counts' => [
                'courses' => (int) $pdo->query('SELECT COUNT(*) FROM courses')->fetchColumn(),
                'questions' => (int) $pdo->query('SELECT COUNT(*) FROM questions')->fetchColumn(),
                'exams' => (int) $pdo->query('SELECT COUNT(*) FROM exams')->fetchColumn(),
                'attempts' => (int) $pdo->query('SELECT COUNT(*) FROM exam_attempts')->fetchColumn(),
            ],
        ]);
    }

    if ($action === 'room') {
        $pin = strtoupper(trim((string) ($_GET['pin'] ?? '')));
        $requestedExamId = trim((string) ($_GET['examId'] ?? ''));
        if ($pin === '') {
            jsonError('Vui lòng nhập mã PIN phòng thi.', 400);
        }
        $demoPins = ['101202', '202303', '303404'];
        $shiftStmt = $requestedExamId !== ''
            ? $pdo->prepare('SELECT * FROM exam_shifts WHERE UPPER(room_pin) = :pin AND exam_id = :eid LIMIT 1')
            : $pdo->prepare("SELECT * FROM exam_shifts WHERE UPPER(room_pin) = :pin ORDER BY (CASE WHEN status IN ('OPEN', 'WAITING') THEN 0 ELSE 1 END), created_at DESC");
        $shiftStmt->execute($requestedExamId !== '' ? [':pin' => $pin, ':eid' => $requestedExamId] : [':pin' => $pin]);
        $shiftRows = $shiftStmt->fetchAll();
        $activeShift = $shiftRows[0] ?? null;

        if ($activeShift) {
            $exOne = $pdo->prepare('SELECT e.*, c.code AS course_code, c.name AS course_name FROM exams e LEFT JOIN courses c ON c.id = e.course_id WHERE e.id = :eid LIMIT 1');
            $exOne->execute([':eid' => $activeShift['exam_id']]);
            $row = $exOne->fetch();
            if ($row) {
                $row['room_pin'] = $activeShift['room_pin'];
                $row['status'] = $activeShift['status'];
                $row['late_entry_minutes'] = $activeShift['late_entry_minutes'] ?? ($row['late_entry_minutes'] ?? 0);
                $row['scheduled_start_at'] = !empty($activeShift['scheduled_start_at']) ? $activeShift['scheduled_start_at'] : ($row['scheduled_start_at'] ?? null);
                $row['scheduled_end_at'] = !empty($activeShift['scheduled_end_at']) ? $activeShift['scheduled_end_at'] : ($row['scheduled_end_at'] ?? null);
                $row['roster_whitelist_json'] = $activeShift['roster_whitelist_json'];
                $row['roster_entries_json'] = $activeShift['roster_entries_json'];
                $rows = [$row];
            } else {
                $rows = [];
            }
        } else {
            if ($requestedExamId !== '') {
                $stmt = $pdo->prepare('SELECT e.*, c.code AS course_code, c.name AS course_name FROM exams e LEFT JOIN courses c ON c.id = e.course_id WHERE UPPER(e.room_pin) = :pin AND e.id = :eid LIMIT 1');
                $stmt->execute([':pin' => $pin, ':eid' => $requestedExamId]);
            } else {
                $stmt = $pdo->prepare("SELECT e.*, c.code AS course_code, c.name AS course_name FROM exams e LEFT JOIN courses c ON c.id = e.course_id WHERE UPPER(e.room_pin) = :pin ORDER BY (CASE WHEN e.status IN ('OPEN', 'WAITING') THEN 0 ELSE 1 END), e.created_at DESC");
                $stmt->execute([':pin' => $pin]);
            }
            $rows = $stmt->fetchAll();
            $row = $rows[0] ?? false;
        }

        if (!$row && in_array($pin, $demoPins, true) && $requestedExamId === '') {
            seedDefaultEconomicsData($pdo, true);
            $stmt = $pdo->prepare("SELECT e.*, c.code AS course_code, c.name AS course_name FROM exams e LEFT JOIN courses c ON c.id = e.course_id WHERE UPPER(e.room_pin) = :pin ORDER BY (CASE WHEN e.status IN ('OPEN', 'WAITING') THEN 0 ELSE 1 END), e.created_at DESC");
            $stmt->execute([':pin' => $pin]);
            $rows = $stmt->fetchAll();
            $row = $rows[0] ?? false;
        } elseif ($row && in_array($pin, $demoPins, true) && (string) ($row['owner_id'] ?? '') === 'SYSTEM_DEMO' && !in_array((string) ($row['status'] ?? ''), ['OPEN', 'WAITING'], true)) {
            if ($activeShift) {
                $pdo->prepare("UPDATE exam_shifts SET status = 'OPEN', report_sent_status = 'PENDING', report_sent_at = NULL WHERE id = :id")
                    ->execute([':id' => $activeShift['id']]);
                $activeShift['status'] = 'OPEN';
            }
            $pdo->prepare("UPDATE exams SET status = 'OPEN', report_sent_status = 'PENDING', report_sent_at = NULL WHERE id = :id")
                ->execute([':id' => $row['id']]);
            $row['status'] = 'OPEN';
        }

        if (!$row) {
            jsonError('Không tìm thấy phòng thi với mã PIN này.', 404);
        }

        $nowTs = time();
        $schedStart = !empty($row['scheduled_start_at']) ? strtotime((string) $row['scheduled_start_at']) : false;
        $schedEnd = !empty($row['scheduled_end_at']) ? strtotime((string) $row['scheduled_end_at']) : false;
        if (($row['status'] ?? 'DRAFT') !== 'CLOSED') {
            if ($schedEnd !== false && $nowTs > $schedEnd) {
                $row['status'] = 'CLOSED';
                if ($activeShift) {
                    $activeShift['status'] = 'CLOSED';
                }
            } elseif ($schedStart !== false && $nowTs < $schedStart) {
                $row['status'] = 'DRAFT';
                if ($activeShift) {
                    $activeShift['status'] = 'DRAFT';
                }
            } elseif ($schedStart !== false && $nowTs >= $schedStart && ($row['status'] ?? 'DRAFT') === 'DRAFT') {
                $row['status'] = 'OPEN';
                if ($activeShift) {
                    $activeShift['status'] = 'OPEN';
                }
            }
        }

        $stmtC = $pdo->prepare('SELECT * FROM courses WHERE id = :cid LIMIT 1');
        $stmtC->execute([':cid' => $row['course_id']]);
        $courseRow = $stmtC->fetch();

        $stmtQ = $pdo->prepare('SELECT * FROM questions WHERE course_id = :cid');
        $stmtQ->execute([':cid' => $row['course_id']]);
        $qRows = $stmtQ->fetchAll();

        if (in_array($pin, $demoPins, true) && (string) ($row['owner_id'] ?? '') === 'SYSTEM_DEMO' && (!$courseRow || count($qRows) === 0)) {
            seedDefaultEconomicsData($pdo, true);
            $stmt->execute($requestedExamId !== '' ? [':pin' => $pin, ':eid' => $requestedExamId] : [':pin' => $pin]);
            $rows = $stmt->fetchAll();
            $row = $rows[0] ?: $row;
            $stmtC->execute([':cid' => $row['course_id']]);
            $courseRow = $stmtC->fetch();
            $stmtQ->execute([':cid' => $row['course_id']]);
            $qRows = $stmtQ->fetchAll();
        }

        $matches = count($rows) > 1
            ? array_map(static fn (array $r): array => [
                'examId' => (string) $r['id'],
                'examTitle' => (string) $r['title'],
                'status' => (string) ($r['status'] ?? 'DRAFT'),
                'durationMinutes' => (int) ($r['duration_minutes'] ?? 45),
                'courseId' => (string) $r['course_id'],
                'courseCode' => (string) ($r['course_code'] ?? ''),
                'courseName' => (string) ($r['course_name'] ?? ''),
            ], $rows)
            : [];

        jsonResponse([
            'ok' => true,
            'multipleMatches' => count($matches) > 1,
            'matches' => $matches,
            'exam' => formatExamRow($row, true),
            'shift' => $activeShift ? formatShiftRow($activeShift, true) : null,
            'course' => $courseRow ? formatCourseRow($courseRow) : null,
            'questions' => array_map(static fn ($qr) => formatQuestionRow($qr, true), $qRows),
        ]);
    }

    // All endpoints below require verified Admin HMAC Bearer token
    $auth = requireAdminAuth();

    if ($action === 'bootstrap') {
        $scoped = fetchScopedData($pdo, $auth);
        $role = (string) ($auth['role'] ?? 'DEMO');
        $actorId = (string) ($auth['instructorId'] ?? 'DEMO_INSTRUCTOR');
        $actorEmail = strtolower(trim((string) ($auth['email'] ?? '')));

        if ($role === 'OFFICIAL' && $actorId === 'MASTER_ADMIN') {
            $emails = $pdo->query('SELECT id, recipient, subject, kind, status, summary, csv_filename AS csvAttachmentName, sent_at AS sentAt, created_at FROM email_queue ORDER BY created_at DESC LIMIT 200')->fetchAll();
        } elseif ($role === 'OFFICIAL') {
            $eStmt = $pdo->prepare(
                "SELECT id, recipient, subject, kind, status, summary, csv_filename AS csvAttachmentName, sent_at AS sentAt, created_at
                 FROM email_queue
                 WHERE LOWER(recipient) = :em
                    OR LOWER(recipient) IN (SELECT DISTINCT LOWER(instructor_email) FROM exams WHERE owner_id = :uid1)
                    OR LOWER(recipient) IN (SELECT DISTINCT LOWER(a.student_email) FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE e.owner_id = :uid2)
                 ORDER BY created_at DESC LIMIT 200"
            );
            $eStmt->execute([':em' => $actorEmail, ':uid1' => $actorId, ':uid2' => $actorId]);
            $emails = $eStmt->fetchAll();
        } else {
            $emails = $pdo->query(
                "SELECT id, recipient, subject, kind, status, summary, csv_filename AS csvAttachmentName, sent_at AS sentAt, created_at
                 FROM email_queue
                 WHERE LOWER(recipient) = 'giangvien@vneconomics.com'
                    OR LOWER(recipient) IN (SELECT DISTINCT LOWER(a.student_email) FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE e.owner_id = 'SYSTEM_DEMO')
                 ORDER BY created_at DESC LIMIT 200"
            )->fetchAll();
        }

        jsonResponse([
            'ok' => true,
            'courses' => $scoped['courses'],
            'questions' => $scoped['questions'],
            'exams' => $scoped['exams'],
            'emailLogs' => $emails,
        ]);
    }

    if ($action === 'reset_demo') {
        seedDefaultEconomicsData($pdo, true);
        $scoped = fetchScopedData($pdo, $auth);

        jsonResponse([
            'ok' => true,
            'courses' => $scoped['courses'],
            'questions' => $scoped['questions'],
            'exams' => $scoped['exams'],
        ]);
    }

    $body = $method === 'GET' ? [] : readJsonBody();

    if ($action === 'save_course') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');

        $id = trim((string) ($body['id'] ?? '')) ?: generateId('crs');
        $code = strtoupper(trim((string) ($body['code'] ?? '')));
        $name = trim((string) ($body['name'] ?? ''));
        $semester = trim((string) ($body['semester'] ?? ''));
        $credits = max(1, (int) ($body['credits'] ?? 3));

        if ($code === '' || $name === '') {
            jsonError('Mã học phần và tên học phần không được để trống.', 400);
        }

        $exists = $pdo->prepare('SELECT owner_id FROM courses WHERE id = :id LIMIT 1');
        $exists->execute([':id' => $id]);
        $existingOwner = $exists->fetchColumn();
        if ($existingOwner !== false) {
            if (!$isMaster && (string) $existingOwner !== $actorId) {
                jsonError('Bạn chỉ được chỉnh sửa học phần do mình tạo.', 403);
            }
            $stmt = $pdo->prepare('UPDATE courses SET code = :code, name = :name, semester = :semester, credits = :credits WHERE id = :id');
            $stmt->execute([
                ':id' => $id,
                ':code' => $code,
                ':name' => $name,
                ':semester' => $semester,
                ':credits' => $credits,
            ]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO courses (id, code, name, semester, credits, owner_id) VALUES (:id, :code, :name, :semester, :credits, :owner_id)');
            $stmt->execute([
                ':id' => $id,
                ':code' => $code,
                ':name' => $name,
                ':semester' => $semester,
                ':credits' => $credits,
                ':owner_id' => $actorId,
            ]);
        }

        jsonResponse(['ok' => true, 'course' => ['id' => $id, 'code' => $code, 'name' => $name, 'semester' => $semester, 'credits' => $credits, 'ownerId' => $existingOwner !== false ? (string) $existingOwner : $actorId]]);
    }

    if ($action === 'delete_course') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $id = (string) ($_GET['id'] ?? ($body['id'] ?? ''));
        if ($id === '') {
            jsonError('Thiếu id học phần.', 400);
        }
        $chk = $pdo->prepare('SELECT owner_id FROM courses WHERE id = :id LIMIT 1');
        $chk->execute([':id' => $id]);
        $owner = $chk->fetchColumn();
        if ($owner !== false && !$isMaster && (string) $owner !== $actorId) {
            jsonError('Không thể xóa học phần mẫu hoặc học phần của giảng viên khác.', 403);
        }
        $pdo->prepare('DELETE FROM courses WHERE id = :id')->execute([':id' => $id]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'save_question') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        try {
            $res = upsertQuestionRow($pdo, $body, $actorId, $isMaster);
        } catch (InvalidArgumentException $e) {
            jsonError($e->getMessage(), 400);
        }

        $row = $pdo->prepare('SELECT * FROM questions WHERE id = :id');
        $row->execute([':id' => $res['id']]);
        jsonResponse(['ok' => true, 'question' => formatQuestionRow($row->fetch(), false)]);
    }

    if ($action === 'import_questions_bulk') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $items = $body['questions'] ?? [];
        $mode = strtoupper(trim((string) ($body['mode'] ?? 'UPSERT')));
        $courseId = trim((string) ($body['courseId'] ?? ''));
        if (!is_array($items) || count($items) === 0) {
            jsonError('Danh sách câu hỏi import đang rỗng.', 400);
        }

        $pdo->beginTransaction();
        try {
            if ($mode === 'REPLACE_COURSE' && $courseId !== '') {
                if ($isMaster) {
                    $pdo->prepare('DELETE FROM questions WHERE course_id = :cid')->execute([':cid' => $courseId]);
                } else {
                    $pdo->prepare('DELETE FROM questions WHERE course_id = :cid AND owner_id = :uid')->execute([':cid' => $courseId, ':uid' => $actorId]);
                }
            }

            $added = 0;
            $updated = 0;
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                if ($mode === 'APPEND') {
                    unset($item['id']);
                }
                if ($courseId !== '' && empty($item['courseId'])) {
                    $item['courseId'] = $courseId;
                }
                $res = upsertQuestionRow($pdo, $item, $actorId, $isMaster);
                if ($res['op'] === 'updated') {
                    $updated++;
                } else {
                    $added++;
                }
            }

            $pdo->commit();
            jsonResponse([
                'ok' => true,
                'addedCount' => $added,
                'updatedCount' => $updated,
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            jsonError('Lỗi import câu hỏi hàng loạt: ' . $e->getMessage(), 500);
        }
    }

    if ($action === 'delete_question') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $id = (string) ($_GET['id'] ?? ($body['id'] ?? ''));
        if ($id === '') {
            jsonError('Thiếu id câu hỏi.', 400);
        }
        $chk = $pdo->prepare('SELECT owner_id FROM questions WHERE id = :id LIMIT 1');
        $chk->execute([':id' => $id]);
        $owner = $chk->fetchColumn();
        if ($owner !== false && !$isMaster && (string) $owner !== $actorId) {
            jsonError('Không thể xóa câu hỏi mẫu hoặc câu hỏi của giảng viên khác.', 403);
        }
        $pdo->prepare('DELETE FROM questions WHERE id = :id')->execute([':id' => $id]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'save_exam') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $id = trim((string) ($body['id'] ?? '')) ?: generateId('exm');
        $courseId = trim((string) ($body['courseId'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        $roomPin = strtoupper(trim((string) ($body['roomPin'] ?? '')));
        if ($courseId === '' || $title === '' || $roomPin === '') {
            jsonError('Thiếu courseId, tiêu đề kỳ thi hoặc roomPin.', 400);
        }

        $exists = $pdo->prepare('SELECT owner_id, status FROM exams WHERE id = :id LIMIT 1');
        $exists->execute([':id' => $id]);
        $existingExamRow = $exists->fetch();
        $isUpdate = ($existingExamRow !== false);
        $existingOwner = $isUpdate ? (string) ($existingExamRow['owner_id'] ?? '') : '';
        $prevExamStatus = $isUpdate ? (string) ($existingExamRow['status'] ?? 'DRAFT') : 'DRAFT';

        if ($isUpdate && !$isMaster && $existingOwner !== $actorId) {
            jsonError('Bạn không thể chỉnh sửa trực tiếp đề thi mẫu hoặc đề của giảng viên khác. Hãy dùng "Nhân bản ca (Clone Ca)" hoặc "Tạo Đề thi mới".', 403);
        }

        $instEmail = trim((string) ($body['instructorEmail'] ?? ''));
        if ($instEmail === '') {
            $instEmail = (string) ($official['email'] ?? '');
        }

        $requestedStatus = strtoupper(trim((string) ($body['status'] ?? 'DRAFT')));
        if (!in_array($requestedStatus, ['DRAFT', 'WAITING', 'OPEN', 'CLOSED'], true)) {
            $requestedStatus = 'DRAFT';
        }

        $params = [
            ':id' => $id,
            ':course_id' => $courseId,
            ':title' => $title,
            ':room_pin' => $roomPin,
            ':unlock_pin' => trim((string) ($body['unlockPin'] ?? '8888')),
            ':instructor_email' => $instEmail,
            ':duration_minutes' => max(1, (int) ($body['durationMinutes'] ?? 45)),
            ':chapter_matrix_json' => json_encode($body['chapterMatrix'] ?? [], JSON_UNESCAPED_UNICODE),
            ':pinned_question_ids_json' => json_encode($body['pinnedQuestionIds'] ?? [], JSON_UNESCAPED_UNICODE),
            ':shuffle_questions' => !empty($body['shuffleQuestions']) ? 1 : 0,
            ':shuffle_mode' => (string) ($body['shuffleMode'] ?? 'BY_CHAPTER'),
            ':shuffle_options' => !empty($body['shuffleOptions']) ? 1 : 0,
            ':max_leave_count' => max(1, (int) ($body['maxLeaveCount'] ?? 3)),
            ':max_away_seconds' => max(5, (int) ($body['maxAwaySeconds'] ?? 25)),
            ':grace_period_ms' => max(0, (int) ($body['gracePeriodMs'] ?? 2000)),
            ':one_way_mode' => !empty($body['oneWayMode']) ? 1 : 0,
            ':per_question_seconds' => max(0, (int) ($body['perQuestionSeconds'] ?? 0)),
            ':canvas_anti_ocr' => !empty($body['canvasAntiOcr']) ? 1 : 0,
            ':require_fullscreen' => !empty($body['requireFullscreen']) ? 1 : 0,
            ':allow_review_after_submit' => !empty($body['allowReviewAfterSubmit']) ? 1 : 0,
            ':email_delivery_mode' => (string) ($body['emailDeliveryMode'] ?? 'IMMEDIATE'),
            ':roster_whitelist_json' => json_encode($body['rosterWhitelist'] ?? [], JSON_UNESCAPED_UNICODE),
            ':roster_entries_json' => json_encode($body['rosterEntries'] ?? [], JSON_UNESCAPED_UNICODE),
            ':status' => $requestedStatus,
            ':late_entry_minutes' => max(0, (int) ($body['lateEntryMinutes'] ?? 0)),
            ':scheduled_start_at' => trim((string) ($body['scheduledStartAt'] ?? '')) ?: null,
            ':scheduled_end_at' => trim((string) ($body['scheduledEndAt'] ?? '')) ?: null,
        ];

        if ($isUpdate) {
            $sql = 'UPDATE exams SET course_id=:course_id, title=:title, room_pin=:room_pin, unlock_pin=:unlock_pin, instructor_email=:instructor_email, duration_minutes=:duration_minutes, chapter_matrix_json=:chapter_matrix_json, pinned_question_ids_json=:pinned_question_ids_json, shuffle_questions=:shuffle_questions, shuffle_mode=:shuffle_mode, shuffle_options=:shuffle_options, max_leave_count=:max_leave_count, max_away_seconds=:max_away_seconds, grace_period_ms=:grace_period_ms, one_way_mode=:one_way_mode, per_question_seconds=:per_question_seconds, canvas_anti_ocr=:canvas_anti_ocr, require_fullscreen=:require_fullscreen, allow_review_after_submit=:allow_review_after_submit, email_delivery_mode=:email_delivery_mode, roster_whitelist_json=:roster_whitelist_json, roster_entries_json=:roster_entries_json, status=:status, late_entry_minutes=:late_entry_minutes, scheduled_start_at=:scheduled_start_at, scheduled_end_at=:scheduled_end_at WHERE id=:id';
        } else {
            $params[':owner_id'] = $actorId;
            $params[':report_sent_status'] = 'PENDING';
            $params[':created_at'] = nowIso();
            $sql = 'INSERT INTO exams (id, course_id, owner_id, title, room_pin, unlock_pin, instructor_email, duration_minutes, chapter_matrix_json, pinned_question_ids_json, shuffle_questions, shuffle_mode, shuffle_options, max_leave_count, max_away_seconds, grace_period_ms, one_way_mode, per_question_seconds, canvas_anti_ocr, require_fullscreen, allow_review_after_submit, email_delivery_mode, roster_whitelist_json, roster_entries_json, status, late_entry_minutes, scheduled_start_at, scheduled_end_at, report_sent_status, created_at)
                    VALUES (:id, :course_id, :owner_id, :title, :room_pin, :unlock_pin, :instructor_email, :duration_minutes, :chapter_matrix_json, :pinned_question_ids_json, :shuffle_questions, :shuffle_mode, :shuffle_options, :max_leave_count, :max_away_seconds, :grace_period_ms, :one_way_mode, :per_question_seconds, :canvas_anti_ocr, :require_fullscreen, :allow_review_after_submit, :email_delivery_mode, :roster_whitelist_json, :roster_entries_json, :status, :late_entry_minutes, :scheduled_start_at, :scheduled_end_at, :report_sent_status, :created_at)';
        }
        try {
            $pdo->prepare($sql)->execute($params);
        } catch (Throwable $e) {
            if (stripos($e->getMessage(), 'roster_entries_json') !== false) {
                try {
                    $colType = getDbDriver() === 'mysql' ? 'LONGTEXT NULL' : 'TEXT NULL';
                    $pdo->exec("ALTER TABLE exams ADD COLUMN roster_entries_json $colType");
                    $pdo->prepare($sql)->execute($params);
                } catch (Throwable $e2) {
                    jsonError('Lỗi lưu đề thi (DB): ' . $e2->getMessage(), 500);
                }
            } else {
                jsonError('Lỗi lưu đề thi (DB): ' . $e->getMessage(), 500);
            }
        }

        if ($isUpdate && $prevExamStatus !== $requestedStatus) {
            $pdo->prepare('UPDATE exam_shifts SET status = :st WHERE exam_id = :eid')
                ->execute([':st' => $requestedStatus, ':eid' => $id]);
        }

        if ($isUpdate && $prevExamStatus !== 'OPEN' && $requestedStatus === 'OPEN') {
            resetUntouchedWaitingRoomClocks($pdo, 'exam_id', $id);
        }

        $row = $pdo->prepare('SELECT * FROM exams WHERE id = :id');
        $row->execute([':id' => $id]);
        $savedRow = $row->fetch();
        if (!$savedRow) {
            jsonError('Không tìm thấy đề thi sau khi lưu.', 500);
        }
        jsonResponse(['ok' => true, 'exam' => formatExamRow($savedRow, false)]);
    }

    if ($action === 'clone_exam') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $sourceId = trim((string) ($body['examId'] ?? ''));
        $stmt = $pdo->prepare('SELECT * FROM exams WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $sourceId]);
        $src = $stmt->fetch();
        if (!$src) {
            jsonError('Không tìm thấy kỳ thi nguồn để nhân bản.', 404);
        }

        $newId = generateId('exm');
        $newPin = (string) random_int(100000, 999999);
        $newTitle = $src['title'] . ' (Bản sao)';
        $instEmail = (string) ($official['email'] ?: $src['instructor_email']);

        $ins = $pdo->prepare('INSERT INTO exams (id, course_id, owner_id, title, room_pin, unlock_pin, instructor_email, duration_minutes, chapter_matrix_json, pinned_question_ids_json, shuffle_questions, shuffle_mode, shuffle_options, max_leave_count, max_away_seconds, grace_period_ms, one_way_mode, per_question_seconds, canvas_anti_ocr, email_delivery_mode, roster_whitelist_json, roster_entries_json, status, report_sent_status, created_at)
            VALUES (:id, :course_id, :owner_id, :title, :room_pin, :unlock_pin, :instructor_email, :duration_minutes, :chapter_matrix_json, :pinned_question_ids_json, :shuffle_questions, :shuffle_mode, :shuffle_options, :max_leave_count, :max_away_seconds, :grace_period_ms, :one_way_mode, :per_question_seconds, :canvas_anti_ocr, :email_delivery_mode, :roster_whitelist_json, :roster_entries_json, :status, :report_sent_status, :created_at)');
        $ins->execute([
            ':id' => $newId,
            ':course_id' => $src['course_id'],
            ':owner_id' => $actorId,
            ':title' => $newTitle,
            ':room_pin' => $newPin,
            ':unlock_pin' => $src['unlock_pin'],
            ':instructor_email' => $instEmail,
            ':duration_minutes' => $src['duration_minutes'],
            ':chapter_matrix_json' => $src['chapter_matrix_json'],
            ':pinned_question_ids_json' => $src['pinned_question_ids_json'],
            ':shuffle_questions' => $src['shuffle_questions'],
            ':shuffle_mode' => $src['shuffle_mode'],
            ':shuffle_options' => $src['shuffle_options'],
            ':max_leave_count' => $src['max_leave_count'],
            ':max_away_seconds' => $src['max_away_seconds'],
            ':grace_period_ms' => $src['grace_period_ms'],
            ':one_way_mode' => $src['one_way_mode'],
            ':per_question_seconds' => $src['per_question_seconds'],
            ':canvas_anti_ocr' => $src['canvas_anti_ocr'],
            ':email_delivery_mode' => $src['email_delivery_mode'],
            ':roster_whitelist_json' => '[]',
            ':roster_entries_json' => '[]',
            ':status' => 'DRAFT',
            ':report_sent_status' => 'PENDING',
            ':created_at' => nowIso(),
        ]);

        $row = $pdo->prepare('SELECT * FROM exams WHERE id = :id');
        $row->execute([':id' => $newId]);
        jsonResponse(['ok' => true, 'exam' => formatExamRow($row->fetch(), false)]);
    }

    if ($action === 'update_exam_status') {
        $official = requireOfficialInstructor();
        $examId = trim((string) ($body['examId'] ?? ''));
        $status = strtoupper(trim((string) ($body['status'] ?? '')));
        if (!in_array($status, ['DRAFT', 'WAITING', 'OPEN', 'CLOSED'], true)) {
            jsonError('Trạng thái kỳ thi không hợp lệ.', 400);
        }
        $prevStmt = $pdo->prepare('SELECT owner_id, status FROM exams WHERE id = :id LIMIT 1');
        $prevStmt->execute([':id' => $examId]);
        $prevRow = $prevStmt->fetch();
        if (!$prevRow) {
            jsonError('Không tìm thấy đề thi.', 404);
        }
        $actorId = (string) $official['instructorId'];
        if ($actorId !== 'MASTER_ADMIN' && (string) ($prevRow['owner_id'] ?? '') !== $actorId) {
            jsonError('Không có quyền thay đổi trạng thái đề thi của giảng viên khác.', 403);
        }
        $prevStatus = (string) ($prevRow['status'] ?? 'DRAFT');
        $pdo->prepare('UPDATE exams SET status = :st WHERE id = :id')->execute([':st' => $status, ':id' => $examId]);
        $pdo->prepare('UPDATE exam_shifts SET status = :st WHERE exam_id = :eid')->execute([':st' => $status, ':eid' => $examId]);
        if ($prevStatus !== 'OPEN' && $status === 'OPEN') {
            resetUntouchedWaitingRoomClocks($pdo, 'exam_id', $examId);
        }
        jsonResponse(['ok' => true, 'examId' => $examId, 'status' => $status]);
    }

    if ($action === 'regrade_rubric') {
        $questionId = trim((string) ($body['questionId'] ?? ''));
        $rubric = $body['gradingRubric'] ?? null;
        $sampleAnswer = $body['sampleAnswer'] ?? null;
        if ($questionId === '' || !is_array($rubric)) {
            jsonError('Thiếu questionId hoặc gradingRubric.', 400);
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE questions SET grading_rubric_json = :rubric, sample_answer = :sample WHERE id = :id')
                ->execute([
                    ':rubric' => json_encode($rubric, JSON_UNESCAPED_UNICODE),
                    ':sample' => $sampleAnswer,
                    ':id' => $questionId,
                ]);

            $qStmt = $pdo->prepare('SELECT * FROM questions WHERE id = :id LIMIT 1');
            $qStmt->execute([':id' => $questionId]);
            $qRow = $qStmt->fetch();
            if (!$qRow) {
                throw new RuntimeException('Không tìm thấy câu hỏi.');
            }
            $question = formatQuestionRow($qRow, false);

            $ansStmt = $pdo->prepare('SELECT * FROM attempt_answers WHERE question_id = :qid');
            $ansStmt->execute([':qid' => $questionId]);
            $rows = $ansStmt->fetchAll();

            $updAns = $pdo->prepare(
                'UPDATE attempt_answers SET is_correct=:ic, earned_points=:ep, grading_feedback=:fb, grading_status=:gs, rubric_breakdown_json=:rb, matched_highlights_json=:mh, blocked_highlights_json=:bh, honeypot_triggered=:hp WHERE id=:id'
            );

            $affectedAttemptIds = [];
            $regradedCount = 0;
            foreach ($rows as $ar) {
                if (($ar['grading_status'] ?? '') === 'MANUAL_OVERRIDE') {
                    continue;
                }
                $seedVars = decodeJsonSafe($ar['rendered_seed_vars'] ?? null, []);
                $payload = decodeJsonSafe($ar['answer_payload'] ?? null, '');
                $maxPts = (float) ($ar['max_points'] ?? $question['points']);
                $res = gradeMicroEssayRubricPhp($question, is_string($payload) ? $payload : '', is_array($seedVars) ? $seedVars : [], $maxPts);
                $updAns->execute([
                    ':ic' => ($res['maxPoints'] > 0 && $res['earnedPoints'] >= $res['maxPoints'] - 0.01) ? 1 : 0,
                    ':ep' => $res['earnedPoints'],
                    ':fb' => $res['feedback'],
                    ':gs' => 'RUBRIC_GRADED',
                    ':rb' => json_encode($res['breakdown'], JSON_UNESCAPED_UNICODE),
                    ':mh' => json_encode($res['matchedHighlights'], JSON_UNESCAPED_UNICODE),
                    ':bh' => json_encode($res['blockedHighlights'], JSON_UNESCAPED_UNICODE),
                    ':hp' => $res['honeypotTriggered'] ? 1 : 0,
                    ':id' => $ar['id'],
                ]);
                $affectedAttemptIds[(string) $ar['attempt_id']] = true;
                $regradedCount++;
            }

            // Recalculate attempt totals for all impacted attempts
            foreach (array_keys($affectedAttemptIds) as $attId) {
                $sumStmt = $pdo->prepare('SELECT grading_status, max_points, earned_points FROM attempt_answers WHERE attempt_id = :aid');
                $sumStmt->execute([':aid' => $attId]);
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
                    ->execute([':as' => round($autoSum, 2), ':es' => round($essaySum, 2), ':ts' => $tot, ':s10' => $s10, ':id' => $attId]);
            }

            $pdo->commit();
            jsonResponse(['ok' => true, 'regradedCount' => $regradedCount, 'affectedAttempts' => count($affectedAttemptIds)]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            jsonError('Không thể cập nhật rubric và chấm lại: ' . $e->getMessage(), 500);
        }
    }

    if ($action === 'regrade_exam') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $examId = trim((string) ($body['examId'] ?? ''));
        $shiftId = trim((string) ($body['shiftId'] ?? ''));
        if ($examId === '') {
            jsonError('Thiếu examId cần chấm lại.', 400);
        }
        $exChk = $pdo->prepare('SELECT owner_id FROM exams WHERE id = :id LIMIT 1');
        $exChk->execute([':id' => $examId]);
        $exOwner = $exChk->fetchColumn();
        if ($exOwner === false) {
            jsonError('Không tìm thấy đề thi.', 404);
        }
        if (!$isMaster && (string) $exOwner !== $actorId) {
            jsonError('Không có quyền chấm lại đề thi của giảng viên khác.', 403);
        }

        require_once __DIR__ . '/attempts.php';
        if ($shiftId !== '') {
            $attStmt = $pdo->prepare("SELECT id, status FROM exam_attempts WHERE shift_id = :sid AND status IN ('SUBMITTED', 'AUTO_SUBMITTED')");
            $attStmt->execute([':sid' => $shiftId]);
        } else {
            $attStmt = $pdo->prepare("SELECT id, status FROM exam_attempts WHERE exam_id = :eid AND status IN ('SUBMITTED', 'AUTO_SUBMITTED')");
            $attStmt->execute([':eid' => $examId]);
        }
        $attRows = $attStmt->fetchAll();
        $regradedCount = 0;
        $updatedAttempts = [];
        foreach ($attRows as $ar) {
            $res = finalizeAndGradeAttempt(
                $pdo,
                (string) $ar['id'],
                ($ar['status'] ?? '') === 'AUTO_SUBMITTED'
            );
            if (!empty($res['attempt'])) {
                $updatedAttempts[] = $res['attempt'];
                $regradedCount++;
            }
        }
        jsonResponse([
            'ok' => true,
            'regradedCount' => $regradedCount,
            'attempts' => $updatedAttempts,
        ]);
    }

    if ($action === 'save_shift') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $body = readJsonBody();

        $id = trim((string) ($body['id'] ?? '')) ?: generateId('shift');
        $examId = trim((string) ($body['examId'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        $pin = trim((string) ($body['roomPin'] ?? ''));
        if ($examId === '' || $title === '' || $pin === '') {
            jsonError('Thiếu examId, tên ca thi hoặc mã PIN.', 400);
        }

        $exChk = $pdo->prepare('SELECT owner_id FROM exams WHERE id = :eid LIMIT 1');
        $exChk->execute([':eid' => $examId]);
        $exOwner = $exChk->fetchColumn();
        if ($exOwner === false) {
            jsonError('Không tìm thấy đề thi gốc.', 404);
        }
        if (!$isMaster && (string) $exOwner !== $actorId) {
            jsonError('Không có quyền tạo/sửa ca thi cho đề của giảng viên khác.', 403);
        }

        $chk = $pdo->prepare('SELECT owner_id, status FROM exam_shifts WHERE id = :id LIMIT 1');
        $chk->execute([':id' => $id]);
        $existingShiftRow = $chk->fetch();
        $isUpdate = ($existingShiftRow !== false);
        $existingOwner = $isUpdate ? (string) ($existingShiftRow['owner_id'] ?? '') : '';
        $prevShiftStatus = $isUpdate ? (string) ($existingShiftRow['status'] ?? 'DRAFT') : 'DRAFT';
        if ($isUpdate && !$isMaster && $existingOwner !== $actorId) {
            jsonError('Không có quyền sửa ca thi của giảng viên khác.', 403);
        }

        $shiftStatus = strtoupper(trim((string) ($body['status'] ?? 'DRAFT')));
        if (!in_array($shiftStatus, ['DRAFT', 'WAITING', 'OPEN', 'CLOSED'], true)) {
            $shiftStatus = 'DRAFT';
        }

        $params = [
            ':id' => $id,
            ':exam_id' => $examId,
            ':title' => $title,
            ':room_pin' => $pin,
            ':unlock_pin' => trim((string) ($body['unlockPin'] ?? '8888')),
            ':status' => $shiftStatus,
            ':late_entry_minutes' => max(0, (int) ($body['lateEntryMinutes'] ?? 0)),
            ':scheduled_start_at' => trim((string) ($body['scheduledStartAt'] ?? '')) ?: null,
            ':scheduled_end_at' => trim((string) ($body['scheduledEndAt'] ?? '')) ?: null,
            ':rw' => json_encode($body['rosterWhitelist'] ?? [], JSON_UNESCAPED_UNICODE),
            ':re' => json_encode($body['rosterEntries'] ?? [], JSON_UNESCAPED_UNICODE),
        ];

        if ($isUpdate) {
            $sql = 'UPDATE exam_shifts SET exam_id=:exam_id, title=:title, room_pin=:room_pin, unlock_pin=:unlock_pin, status=:status, late_entry_minutes=:late_entry_minutes, scheduled_start_at=:scheduled_start_at, scheduled_end_at=:scheduled_end_at, roster_whitelist_json=:rw, roster_entries_json=:re WHERE id=:id';
        } else {
            $params[':owner_id'] = $actorId;
            $params[':rss'] = 'PENDING';
            $params[':ca'] = nowIso();
            $sql = 'INSERT INTO exam_shifts (id, exam_id, owner_id, title, room_pin, unlock_pin, status, late_entry_minutes, scheduled_start_at, scheduled_end_at, roster_whitelist_json, roster_entries_json, report_sent_status, created_at)
                    VALUES (:id, :exam_id, :owner_id, :title, :room_pin, :unlock_pin, :status, :late_entry_minutes, :scheduled_start_at, :scheduled_end_at, :rw, :re, :rss, :ca)';
        }
        $pdo->prepare($sql)->execute($params);
        $pdo->prepare('UPDATE exams SET status = :st WHERE id = :eid')
            ->execute([':st' => $shiftStatus, ':eid' => $examId]);

        if ($isUpdate && $prevShiftStatus !== 'OPEN' && $shiftStatus === 'OPEN') {
            resetUntouchedWaitingRoomClocks($pdo, 'shift_id', $id);
        }

        $row = $pdo->prepare('SELECT * FROM exam_shifts WHERE id = :id LIMIT 1');
        $row->execute([':id' => $id]);
        jsonResponse(['ok' => true, 'shift' => formatShiftRow($row->fetch(), false)]);
    }

    if ($action === 'delete_shift') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $id = (string) ($_GET['id'] ?? ($body['id'] ?? ''));
        if ($id === '') {
            jsonError('Thiếu id ca thi.', 400);
        }
        $chk = $pdo->prepare('SELECT owner_id FROM exam_shifts WHERE id = :id LIMIT 1');
        $chk->execute([':id' => $id]);
        $owner = $chk->fetchColumn();
        if ($owner === false) {
            jsonError('Không tìm thấy ca thi.', 404);
        }
        if (!$isMaster && (string) $owner !== $actorId) {
            jsonError('Không thể xóa ca thi mẫu hoặc ca thi của giảng viên khác.', 403);
        }

        // Delete attempts belonging ONLY to this shift; parent exam in `exams` stays untouched
        $attStmt = $pdo->prepare('SELECT id FROM exam_attempts WHERE shift_id = :sid');
        $attStmt->execute([':sid' => $id]);
        $attIds = $attStmt->fetchAll(PDO::FETCH_COLUMN);
        if (count($attIds) > 0) {
            foreach (array_chunk($attIds, 200) as $chunk) {
                $in = implode(',', array_fill(0, count($chunk), '?'));
                $pdo->prepare("DELETE FROM attempt_answers WHERE attempt_id IN ($in)")->execute($chunk);
                $pdo->prepare("DELETE FROM violation_logs WHERE attempt_id IN ($in)")->execute($chunk);
                $pdo->prepare("DELETE FROM exam_attempts WHERE id IN ($in)")->execute($chunk);
            }
        }
        $pdo->prepare('DELETE FROM exam_shifts WHERE id = :id')->execute([':id' => $id]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'delete_exam') {
        $official = requireOfficialInstructor();
        $actorId = (string) $official['instructorId'];
        $isMaster = ($actorId === 'MASTER_ADMIN');
        $id = (string) ($_GET['id'] ?? ($body['id'] ?? ''));
        if ($id === '') {
            jsonError('Thiếu id kỳ thi.', 400);
        }
        $chk = $pdo->prepare('SELECT owner_id FROM exams WHERE id = :id LIMIT 1');
        $chk->execute([':id' => $id]);
        $owner = $chk->fetchColumn();
        if ($owner !== false && !$isMaster && (string) $owner !== $actorId) {
            jsonError('Không thể xóa đề thi mẫu hoặc đề của giảng viên khác.', 403);
        }
        $pdo->prepare('DELETE FROM exam_shifts WHERE exam_id = :id')->execute([':id' => $id]);
        $pdo->prepare('DELETE FROM exams WHERE id = :id')->execute([':id' => $id]);
        jsonResponse(['ok' => true]);
    }

    jsonError('Action không hợp lệ.', 400);
}
