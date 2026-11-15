<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Kahoot-style Live Game API
 * Public endpoints: ?action=poll (file-cached <2ms), ?action=lookup_pin, ?action=join, ?action=player_state, ?action=answer
 * Host endpoints (Bearer HMAC): ?action=create, ?action=next_state, ?action=toggle_lock, ?action=kick_player, ?action=host_view
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';
require_once __DIR__ . '/essay_grader.php';

function gameNowMs(): int
{
    return (int) round(microtime(true) * 1000);
}

function gameCachePath(string $pin): string
{
    $safePin = preg_replace('/[^a-zA-Z0-9_-]/', '', $pin);
    return rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'vne_game_' . $safePin . '.json';
}

function writeGamePollCache(PDO $pdo, array $sessionRow): void
{
    $pin = (string) ($sessionRow['game_pin'] ?? '');
    if ($pin === '') {
        return;
    }

    $sid = (string) $sessionRow['id'];
    $qIdx = (int) $sessionRow['current_q_index'];

    $pcStmt = $pdo->prepare('SELECT COUNT(*) FROM game_players WHERE session_id = :sid AND is_kicked = 0');
    $pcStmt->execute([':sid' => $sid]);
    $playerCount = (int) $pcStmt->fetchColumn();

    $acStmt = $pdo->prepare('SELECT COUNT(*) FROM game_answers WHERE session_id = :sid AND question_index = :qi');
    $acStmt->execute([':sid' => $sid, ':qi' => $qIdx]);
    $answeredCount = (int) $acStmt->fetchColumn();

    $payload = [
        'ok' => true,
        'id' => $sid,
        's' => (string) $sessionRow['state'],
        'q' => $qIdx,
        'v' => (int) $sessionRow['state_version'],
        'start' => (int) $sessionRow['question_started_at_ms'],
        'end' => (int) $sessionRow['question_ends_at_ms'],
        'pc' => $playerCount,
        'ac' => $answeredCount,
        'lk' => (int) ($sessionRow['is_locked'] ?? 0),
    ];

    @file_put_contents(gameCachePath($pin), json_encode($payload, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function sanitizeQuestionForPlayer(array $q, bool $showQuestionOnPlayer, bool $revealAnswer): array
{
    $type = (string) ($q['type'] ?? 'SINGLE_CHOICE');
    $out = [
        'id' => (string) ($q['id'] ?? ''),
        'type' => $type,
        'timeLimitSec' => (int) ($q['timeLimitSec'] ?? 20),
        'isDoublePoints' => (bool) ($q['isDoublePoints'] ?? false),
        'content' => ($showQuestionOnPlayer || $type === 'TRUE_FALSE') ? (string) ($q['content'] ?? '') : '',
    ];

    if ($type === 'SINGLE_CHOICE' || $type === 'MULTI_CHOICE') {
        $opts = is_array($q['options'] ?? null) ? $q['options'] : [];
        $out['options'] = array_map(static function (array $opt) use ($showQuestionOnPlayer): array {
            return [
                'id' => (string) ($opt['id'] ?? ''),
                'text' => $showQuestionOnPlayer ? (string) ($opt['text'] ?? '') : '',
            ];
        }, $opts);
        if ($revealAnswer) {
            $out['correctOptionIds'] = array_values($q['correctOptionIds'] ?? []);
        }
    } elseif ($type === 'TRUE_FALSE') {
        $items = is_array($q['trueFalseItems'] ?? null) ? $q['trueFalseItems'] : [];
        $out['trueFalseItems'] = array_map(static function (array $item) use ($showQuestionOnPlayer, $revealAnswer, $items): array {
            $row = [
                'id' => (string) ($item['id'] ?? ''),
                'statement' => ($showQuestionOnPlayer || count($items) > 1) ? (string) ($item['statement'] ?? '') : '',
            ];
            if ($revealAnswer) {
                $row['answer'] = (bool) ($item['answer'] ?? false);
            }
            return $row;
        }, $items);
    } elseif ($type === 'NUMERICAL') {
        $out['numericalUnit'] = (string) ($q['numericalUnit'] ?? '');
        if ($revealAnswer) {
            $out['expectedValue'] = $q['expectedValue'] ?? null;
            $out['tolerance'] = (float) ($q['tolerance'] ?? 0.01);
        }
    } elseif ($type === 'ESSAY') {
        if ($revealAnswer) {
            $out['sampleAnswer'] = (string) ($q['sampleAnswer'] ?? '');
        }
    }

    return $out;
}

function gradeGameAnswer(array $q, mixed $payload): array
{
    $type = (string) ($q['type'] ?? 'SINGLE_CHOICE');

    if ($type === 'SINGLE_CHOICE') {
        $chosen = is_string($payload) ? trim($payload) : '';
        $correctIds = array_map('strval', $q['correctOptionIds'] ?? []);
        $ok = $chosen !== '' && in_array($chosen, $correctIds, true);
        return ['isCorrect' => $ok, 'earnedRatio' => $ok ? 1.0 : 0.0];
    }

    if ($type === 'MULTI_CHOICE') {
        $selected = is_array($payload) ? array_values(array_unique(array_map('strval', $payload))) : [];
        $correctIds = array_map('strval', $q['correctOptionIds'] ?? []);
        if (count($correctIds) === 0) {
            return ['isCorrect' => false, 'earnedRatio' => 0.0];
        }
        $hasWrong = false;
        $hits = 0;
        foreach ($selected as $sid) {
            if (in_array($sid, $correctIds, true)) {
                $hits++;
            } else {
                $hasWrong = true;
            }
        }
        $isExact = !$hasWrong && $hits === count($correctIds);
        $ratio = $isExact ? 1.0 : max(0.0, ($hits - ($hasWrong ? 1 : 0)) / count($correctIds));
        return ['isCorrect' => $isExact, 'earnedRatio' => round($ratio, 4)];
    }

    if ($type === 'TRUE_FALSE') {
        $map = is_array($payload) ? $payload : [];
        $items = is_array($q['trueFalseItems'] ?? null) ? $q['trueFalseItems'] : [];
        if (count($items) === 0) {
            return ['isCorrect' => false, 'earnedRatio' => 0.0];
        }
        $correctCount = 0;
        foreach ($items as $item) {
            $id = (string) ($item['id'] ?? '');
            $expected = (bool) ($item['answer'] ?? false);
            if (array_key_exists($id, $map) && (bool) $map[$id] === $expected) {
                $correctCount++;
            }
        }
        $isExact = $correctCount === count($items);
        if (count($items) === 4) {
            $weights = [0 => 0.0, 1 => 0.1, 2 => 0.25, 3 => 0.5, 4 => 1.0];
            $ratio = $weights[$correctCount] ?? 0.0;
        } else {
            $ratio = $correctCount / count($items);
        }
        return ['isCorrect' => $isExact, 'earnedRatio' => round($ratio, 4)];
    }

    if ($type === 'NUMERICAL') {
        $raw = is_string($payload) ? trim($payload) : (is_numeric($payload) ? (string) $payload : '');
        $normalized = str_replace([' ', ','], ['', '.'], $raw);
        if ($normalized === '' || !is_numeric($normalized)) {
            return ['isCorrect' => false, 'earnedRatio' => 0.0];
        }
        $val = (float) $normalized;
        $expected = (float) ($q['expectedValue'] ?? 0.0);
        $tol = (float) ($q['tolerance'] ?? 0.01);
        $ok = abs($val - $expected) <= $tol;
        return ['isCorrect' => $ok, 'earnedRatio' => $ok ? 1.0 : 0.0];
    }

    if ($type === 'ESSAY') {
        $raw = is_string($payload) ? trim($payload) : '';
        if ($raw === '') {
            return ['isCorrect' => false, 'earnedRatio' => 0.0];
        }
        $res = gradeMicroEssayRubricPhp([
            'points' => 1.0,
            'gradingRubric' => $q['gradingRubric'] ?? [],
        ], $raw, [], 1.0);
        $earned = (float) ($res['earnedPoints'] ?? 0.0);
        $max = max(0.0001, (float) ($res['maxPoints'] ?? 1.0));
        $ratio = max(0.0, min(1.0, $earned / $max));
        return ['isCorrect' => $ratio >= 0.999, 'earnedRatio' => round($ratio, 4)];
    }

    return ['isCorrect' => false, 'earnedRatio' => 0.0];
}

function getRankedPlayers(PDO $pdo, string $sessionId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, nickname, student_code, score, prev_rank, streak, correct_count, joined_at
         FROM game_players
         WHERE session_id = :sid AND is_kicked = 0
         ORDER BY score DESC, correct_count DESC, joined_at ASC'
    );
    $stmt->execute([':sid' => $sessionId]);
    $rows = $stmt->fetchAll();
    $ranked = [];
    $rank = 1;
    foreach ($rows as $r) {
        $ranked[] = [
            'id' => (string) $r['id'],
            'nickname' => (string) $r['nickname'],
            'studentCode' => (string) $r['student_code'],
            'score' => (int) $r['score'],
            'prevRank' => (int) $r['prev_rank'],
            'rank' => $rank++,
            'streak' => (int) $r['streak'],
            'correctCount' => (int) $r['correct_count'],
        ];
    }
    return $ranked;
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $action = (string) ($_GET['action'] ?? '');

    // Ultra-fast zero-DB poll path
    if ($action === 'poll') {
        $pin = trim((string) ($_GET['pin'] ?? ''));
        if ($pin === '') {
            jsonError('Thiếu mã PIN.', 400);
        }
        $cacheFile = gameCachePath($pin);
        if (is_file($cacheFile)) {
            $raw = @file_get_contents($cacheFile);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded) && !empty($decoded['ok'])) {
                $decoded['now'] = gameNowMs();
                jsonResponse($decoded);
            }
        }

        // Fallback to DB if cache missing
        $pdo = getDb();
        ensureGameSchema($pdo, getDbDriver());
        $stmt = $pdo->prepare('SELECT * FROM game_sessions WHERE game_pin = :pin ORDER BY created_at DESC LIMIT 1');
        $stmt->execute([':pin' => $pin]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonError('Không tìm thấy phòng game.', 404);
        }
        writeGamePollCache($pdo, $row);
        $raw = @file_get_contents($cacheFile);
        $decoded = is_string($raw) ? json_decode($raw, true) : ['ok' => true, 's' => $row['state'], 'q' => (int) $row['current_q_index'], 'v' => (int) $row['state_version']];
        $decoded['now'] = gameNowMs();
        jsonResponse($decoded);
    }

    $pdo = getDb();
    $driver = getDbDriver();
    ensureGameSchema($pdo, $driver);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $body = $method === 'GET' ? [] : readJsonBody();

    if ($action === 'lookup_pin') {
        $pin = trim((string) ($_GET['pin'] ?? ''));
        if ($pin === '') {
            jsonError('Vui lòng nhập mã PIN.', 400);
        }
        $stmt = $pdo->prepare('SELECT id, title, game_pin, show_question_on_player, require_student_code, is_locked, state FROM game_sessions WHERE game_pin = :pin ORDER BY created_at DESC LIMIT 1');
        $stmt->execute([':pin' => $pin]);
        $row = $stmt->fetch();
        if (!$row || $row['state'] === 'ENDED') {
            jsonError('Mã PIN không tồn tại hoặc trò chơi đã kết thúc.', 404);
        }
        jsonResponse([
            'ok' => true,
            'sessionId' => $row['id'],
            'title' => $row['title'],
            'gamePin' => $row['game_pin'],
            'showQuestionOnPlayer' => (bool) $row['show_question_on_player'],
            'requireStudentCode' => (bool) $row['require_student_code'],
            'isLocked' => (bool) $row['is_locked'],
            'state' => $row['state'],
        ]);
    }

    if ($action === 'create') {
        $admin = requireAdminAuth();
        $title = trim((string) ($body['title'] ?? 'Live Quiz Game'));
        $courseId = trim((string) ($body['courseId'] ?? ''));
        $showQuestionOnPlayer = !empty($body['showQuestionOnPlayer']) ? 1 : 0;
        $requireStudentCode = !empty($body['requireStudentCode']) ? 1 : 0;
        $doubleFinalQuestion = array_key_exists('doubleFinalQuestion', $body) ? (!empty($body['doubleFinalQuestion']) ? 1 : 0) : 1;
        $defaultTimeSec = max(5, min(120, (int) ($body['defaultTimeSec'] ?? 20)));
        $questionsSnapshot = is_array($body['questionsSnapshot'] ?? null) ? $body['questionsSnapshot'] : [];

        if (count($questionsSnapshot) === 0) {
            jsonError('Cần ít nhất 1 câu hỏi để tạo phòng Game.', 400);
        }

        // Generate unique 6-digit PIN among non-ENDED sessions
        $pin = '';
        for ($attempt = 0; $attempt < 15; $attempt++) {
            $candidate = (string) random_int(100000, 999999);
            $chk = $pdo->prepare("SELECT id FROM game_sessions WHERE game_pin = :pin AND state <> 'ENDED' LIMIT 1");
            $chk->execute([':pin' => $candidate]);
            if (!$chk->fetch()) {
                $pin = $candidate;
                break;
            }
        }
        if ($pin === '') {
            $pin = (string) random_int(100000, 999999);
        }

        $id = generateId('game');
        $now = nowIso();
        $stmt = $pdo->prepare(
            'INSERT INTO game_sessions (
                id, owner_id, course_id, title, game_pin,
                show_question_on_player, require_student_code, is_locked, double_final_question,
                default_time_sec, questions_snapshot_json, state, current_q_index,
                question_started_at_ms, question_ends_at_ms, state_version, created_at
            ) VALUES (
                :id, :owner, :cid, :title, :pin,
                :sqp, :rsc, 0, :dfq,
                :dts, :qs, :st, 0,
                0, 0, 1, :cat
            )'
        );
        $stmt->execute([
            ':id' => $id,
            ':owner' => (string) ($admin['instructorId'] ?? 'DEMO_INSTRUCTOR'),
            ':cid' => $courseId,
            ':title' => $title,
            ':pin' => $pin,
            ':sqp' => $showQuestionOnPlayer,
            ':rsc' => $requireStudentCode,
            ':dfq' => $doubleFinalQuestion,
            ':dts' => $defaultTimeSec,
            ':qs' => json_encode($questionsSnapshot, JSON_UNESCAPED_UNICODE),
            ':st' => 'LOBBY',
            ':cat' => $now,
        ]);

        $rowStmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $rowStmt->execute([':id' => $id]);
        $row = $rowStmt->fetch();
        if ($row) {
            writeGamePollCache($pdo, $row);
        }

        jsonResponse([
            'ok' => true,
            'sessionId' => $id,
            'gamePin' => $pin,
        ]);
    }

    if ($action === 'join') {
        $pin = trim((string) ($body['gamePin'] ?? ''));
        $nickname = trim((string) ($body['nickname'] ?? ''));
        $studentCode = strtoupper(trim((string) ($body['studentCode'] ?? '')));
        $deviceToken = trim((string) ($body['deviceToken'] ?? ''));

        if ($pin === '' || $nickname === '') {
            jsonError('Vui lòng nhập mã PIN và tên hiển thị.', 400);
        }
        if ($deviceToken === '') {
            $deviceToken = generateId('dev');
        }

        $stmt = $pdo->prepare('SELECT * FROM game_sessions WHERE game_pin = :pin ORDER BY created_at DESC LIMIT 1');
        $stmt->execute([':pin' => $pin]);
        $session = $stmt->fetch();
        if (!$session || $session['state'] === 'ENDED') {
            jsonError('Phòng game không tồn tại hoặc đã kết thúc.', 404);
        }

        // Check reconnect by deviceToken
        $existingStmt = $pdo->prepare('SELECT * FROM game_players WHERE session_id = :sid AND device_token = :dt LIMIT 1');
        $existingStmt->execute([':sid' => $session['id'], ':dt' => $deviceToken]);
        $existing = $existingStmt->fetch();

        if ($existing) {
            if ((int) $existing['is_kicked'] === 1) {
                jsonError('Bạn đã bị giảng viên mời khỏi phòng chơi này.', 403);
            }
            jsonResponse([
                'ok' => true,
                'reconnected' => true,
                'sessionId' => $session['id'],
                'playerId' => $existing['id'],
                'nickname' => $existing['nickname'],
                'studentCode' => $existing['student_code'],
            ]);
        }

        if ((int) $session['is_locked'] === 1) {
            jsonError('Phòng chơi đã khóa, không thể tham gia thêm.', 403);
        }
        if ((int) $session['require_student_code'] === 1 && $studentCode === '') {
            jsonError('Phòng này yêu cầu nhập Mã số sinh viên (MSSV).', 400);
        }

        $playerId = generateId('gpl');
        $pdo->prepare(
            'INSERT INTO game_players (id, session_id, nickname, student_code, device_token, score, prev_rank, streak, correct_count, is_kicked, joined_at)
             VALUES (:id, :sid, :nick, :code, :dt, 0, 0, 0, 0, 0, :jat)'
        )->execute([
            ':id' => $playerId,
            ':sid' => $session['id'],
            ':nick' => mb_substr($nickname, 0, 40, 'UTF-8'),
            ':code' => mb_substr($studentCode, 0, 32, 'UTF-8'),
            ':dt' => $deviceToken,
            ':jat' => nowIso(),
        ]);

        writeGamePollCache($pdo, $session);

        jsonResponse([
            'ok' => true,
            'reconnected' => false,
            'sessionId' => $session['id'],
            'playerId' => $playerId,
            'nickname' => mb_substr($nickname, 0, 40, 'UTF-8'),
            'studentCode' => mb_substr($studentCode, 0, 32, 'UTF-8'),
        ]);
    }

    if ($action === 'toggle_lock') {
        requireAdminAuth();
        $sid = trim((string) ($body['sessionId'] ?? ''));
        $stmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $sid]);
        $session = $stmt->fetch();
        if (!$session) {
            jsonError('Không tìm thấy phòng game.', 404);
        }
        $nextLock = ((int) $session['is_locked'] === 1) ? 0 : 1;
        $nextVer = (int) $session['state_version'] + 1;
        $pdo->prepare('UPDATE game_sessions SET is_locked = :lk, state_version = :v WHERE id = :id')
            ->execute([':lk' => $nextLock, ':v' => $nextVer, ':id' => $sid]);
        $session['is_locked'] = $nextLock;
        $session['state_version'] = $nextVer;
        writeGamePollCache($pdo, $session);
        jsonResponse(['ok' => true, 'isLocked' => (bool) $nextLock]);
    }

    if ($action === 'kick_player') {
        requireAdminAuth();
        $sid = trim((string) ($body['sessionId'] ?? ''));
        $pid = trim((string) ($body['playerId'] ?? ''));
        $pdo->prepare('UPDATE game_players SET is_kicked = 1 WHERE id = :pid AND session_id = :sid')
            ->execute([':pid' => $pid, ':sid' => $sid]);
        $stmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $sid]);
        $session = $stmt->fetch();
        if ($session) {
            $nextVer = (int) $session['state_version'] + 1;
            $pdo->prepare('UPDATE game_sessions SET state_version = :v WHERE id = :id')->execute([':v' => $nextVer, ':id' => $sid]);
            $session['state_version'] = $nextVer;
            writeGamePollCache($pdo, $session);
        }
        jsonResponse(['ok' => true]);
    }

    if ($action === 'next_state') {
        requireAdminAuth();
        $sid = trim((string) ($body['sessionId'] ?? ''));
        $targetState = trim((string) ($body['targetState'] ?? ''));
        $stmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $sid]);
        $session = $stmt->fetch();
        if (!$session) {
            jsonError('Không tìm thấy phòng game.', 404);
        }

        $questions = json_decode((string) $session['questions_snapshot_json'], true) ?: [];
        $totalQ = count($questions);
        $curState = (string) $session['state'];
        $curIdx = (int) $session['current_q_index'];
        $startedMs = (int) $session['question_started_at_ms'];
        $endsMs = (int) $session['question_ends_at_ms'];
        $nowMs = gameNowMs();

        if ($targetState !== '') {
            $nextState = $targetState;
        } else {
            if ($curState === 'LOBBY') {
                $curIdx = 0;
                $nextState = 'QUESTION_INTRO';
                $startedMs = $nowMs;
                $endsMs = $nowMs + 3000;
            } elseif ($curState === 'QUESTION_INTRO') {
                $nextState = 'QUESTION_ACTIVE';
                $qTime = (int) ($questions[$curIdx]['timeLimitSec'] ?? $session['default_time_sec'] ?? 20);
                $startedMs = $nowMs;
                $endsMs = $nowMs + ($qTime * 1000);
                // Snapshot prev_rank before active round
                $ranked = getRankedPlayers($pdo, $sid);
                $updRank = $pdo->prepare('UPDATE game_players SET prev_rank = :pr WHERE id = :pid');
                foreach ($ranked as $rp) {
                    $updRank->execute([':pr' => $rp['rank'], ':pid' => $rp['id']]);
                }
            } elseif ($curState === 'QUESTION_ACTIVE') {
                $nextState = 'QUESTION_RESULT';
                $endsMs = $nowMs;
            } elseif ($curState === 'QUESTION_RESULT') {
                $nextState = ($curIdx + 1 >= $totalQ) ? 'ENDED' : 'LEADERBOARD';
            } elseif ($curState === 'LEADERBOARD') {
                if ($curIdx + 1 >= $totalQ) {
                    $nextState = 'ENDED';
                } else {
                    $curIdx++;
                    $nextState = 'QUESTION_INTRO';
                    $startedMs = $nowMs;
                    $endsMs = $nowMs + 3000;
                }
            } else {
                $nextState = 'ENDED';
            }
        }

        if ($nextState === 'QUESTION_ACTIVE' && $curState !== 'QUESTION_INTRO') {
            $qTime = (int) ($questions[$curIdx]['timeLimitSec'] ?? $session['default_time_sec'] ?? 20);
            $startedMs = $nowMs;
            $endsMs = $nowMs + ($qTime * 1000);
        }

        $nextVer = (int) $session['state_version'] + 1;
        $pdo->prepare(
            'UPDATE game_sessions
             SET state = :st, current_q_index = :qi, question_started_at_ms = :sm, question_ends_at_ms = :em, state_version = :v
             WHERE id = :id'
        )->execute([
            ':st' => $nextState,
            ':qi' => $curIdx,
            ':sm' => $startedMs,
            ':em' => $endsMs,
            ':v' => $nextVer,
            ':id' => $sid,
        ]);

        $session['state'] = $nextState;
        $session['current_q_index'] = $curIdx;
        $session['question_started_at_ms'] = $startedMs;
        $session['question_ends_at_ms'] = $endsMs;
        $session['state_version'] = $nextVer;
        writeGamePollCache($pdo, $session);

        jsonResponse([
            'ok' => true,
            'state' => $nextState,
            'currentQIndex' => $curIdx,
            'stateVersion' => $nextVer,
        ]);
    }

    if ($action === 'host_view') {
        requireAdminAuth();
        $sid = trim((string) ($_GET['sessionId'] ?? ''));
        $stmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $sid]);
        $session = $stmt->fetch();
        if (!$session) {
            jsonError('Không tìm thấy phòng game.', 404);
        }

        $questions = json_decode((string) $session['questions_snapshot_json'], true) ?: [];
        $curIdx = (int) $session['current_q_index'];
        $curQ = $questions[$curIdx] ?? null;
        $ranked = getRankedPlayers($pdo, $sid);

        $ansStmt = $pdo->prepare('SELECT answer_payload_json, is_correct FROM game_answers WHERE session_id = :sid AND question_index = :qi');
        $ansStmt->execute([':sid' => $sid, ':qi' => $curIdx]);
        $ansRows = $ansStmt->fetchAll();

        $optionCounts = [];
        $textBuckets = [];
        $correctAnswered = 0;
        foreach ($ansRows as $ar) {
            $isCor = (int) $ar['is_correct'] === 1;
            if ($isCor) {
                $correctAnswered++;
            }
            $p = json_decode((string) $ar['answer_payload_json'], true);
            if (is_string($p) && $p !== '') {
                $optionCounts[$p] = ($optionCounts[$p] ?? 0) + 1;
                $label = mb_substr(trim($p), 0, 60, 'UTF-8');
                $key = mb_strtolower($label, 'UTF-8');
                if (!isset($textBuckets[$key])) {
                    $textBuckets[$key] = ['label' => $label, 'count' => 0, 'isCorrect' => $isCor];
                }
                $textBuckets[$key]['count']++;
                if ($isCor) {
                    $textBuckets[$key]['isCorrect'] = true;
                }
            } elseif (is_array($p)) {
                foreach ($p as $k => $v) {
                    if (is_int($k) && is_string($v)) {
                        $optionCounts[$v] = ($optionCounts[$v] ?? 0) + 1;
                    } elseif (is_string($k) && is_bool($v)) {
                        $key = $k . ':' . ($v ? 'T' : 'F');
                        $optionCounts[$key] = ($optionCounts[$key] ?? 0) + 1;
                    }
                }
            }
        }

        $topAnswers = array_values($textBuckets);
        usort($topAnswers, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);
        $topAnswers = array_slice($topAnswers, 0, 5);

        jsonResponse([
            'ok' => true,
            'session' => [
                'id' => $session['id'],
                'title' => $session['title'],
                'gamePin' => $session['game_pin'],
                'showQuestionOnPlayer' => (bool) $session['show_question_on_player'],
                'requireStudentCode' => (bool) $session['require_student_code'],
                'isLocked' => (bool) $session['is_locked'],
                'doubleFinalQuestion' => (bool) $session['double_final_question'],
                'state' => $session['state'],
                'currentQIndex' => $curIdx,
                'totalQuestions' => count($questions),
                'questionStartedAtMs' => (int) $session['question_started_at_ms'],
                'questionEndsAtMs' => (int) $session['question_ends_at_ms'],
                'stateVersion' => (int) $session['state_version'],
                'serverNowMs' => gameNowMs(),
            ],
            'currentQuestion' => $curQ,
            'players' => $ranked,
            'answeredCount' => count($ansRows),
            'correctAnsweredCount' => $correctAnswered,
            'optionCounts' => $optionCounts,
            'topAnswers' => $topAnswers,
        ]);
    }

    if ($action === 'player_state') {
        $sid = trim((string) ($_GET['sessionId'] ?? ''));
        $pid = trim((string) ($_GET['playerId'] ?? ''));
        $sStmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $sStmt->execute([':id' => $sid]);
        $session = $sStmt->fetch();
        if (!$session) {
            jsonError('Không tìm thấy phòng game.', 404);
        }

        $pStmt = $pdo->prepare('SELECT * FROM game_players WHERE id = :pid AND session_id = :sid LIMIT 1');
        $pStmt->execute([':pid' => $pid, ':sid' => $sid]);
        $player = $pStmt->fetch();
        if (!$player || (int) $player['is_kicked'] === 1) {
            jsonError('Người chơi không tồn tại hoặc đã bị mời ra khỏi phòng.', 403);
        }

        $questions = json_decode((string) $session['questions_snapshot_json'], true) ?: [];
        $curIdx = (int) $session['current_q_index'];
        $curQ = $questions[$curIdx] ?? null;
        $state = (string) $session['state'];
        $reveal = in_array($state, ['QUESTION_RESULT', 'LEADERBOARD', 'ENDED'], true);

        $ansStmt = $pdo->prepare('SELECT * FROM game_answers WHERE session_id = :sid AND player_id = :pid AND question_index = :qi LIMIT 1');
        $ansStmt->execute([':sid' => $sid, ':pid' => $pid, ':qi' => $curIdx]);
        $myAns = $ansStmt->fetch();

        $ranked = getRankedPlayers($pdo, $sid);
        $myRank = 0;
        $gapToAbove = 0;
        foreach ($ranked as $i => $rp) {
            if ($rp['id'] === $pid) {
                $myRank = $rp['rank'];
                if ($i > 0) {
                    $gapToAbove = max(0, $ranked[$i - 1]['score'] - $rp['score']);
                }
                break;
            }
        }

        jsonResponse([
            'ok' => true,
            'session' => [
                'id' => $session['id'],
                'title' => $session['title'],
                'gamePin' => $session['game_pin'],
                'showQuestionOnPlayer' => (bool) $session['show_question_on_player'],
                'state' => $state,
                'currentQIndex' => $curIdx,
                'totalQuestions' => count($questions),
                'questionStartedAtMs' => (int) $session['question_started_at_ms'],
                'questionEndsAtMs' => (int) $session['question_ends_at_ms'],
                'stateVersion' => (int) $session['state_version'],
                'serverNowMs' => gameNowMs(),
            ],
            'player' => [
                'id' => $player['id'],
                'nickname' => $player['nickname'],
                'studentCode' => $player['student_code'],
                'score' => (int) $player['score'],
                'prevRank' => (int) $player['prev_rank'],
                'rank' => $myRank,
                'gapToAbove' => $gapToAbove,
                'streak' => (int) $player['streak'],
                'correctCount' => (int) $player['correct_count'],
                'totalPlayers' => count($ranked),
            ],
            'question' => $curQ ? sanitizeQuestionForPlayer($curQ, (bool) $session['show_question_on_player'], $reveal) : null,
            'myAnswer' => $myAns ? [
                'answerPayload' => json_decode((string) $myAns['answer_payload_json'], true),
                'isCorrect' => (bool) $myAns['is_correct'],
                'earnedRatio' => (float) $myAns['earned_ratio'],
                'pointsEarned' => (int) $myAns['points_earned'],
            ] : null,
        ]);
    }

    if ($action === 'answer') {
        $sid = trim((string) ($body['sessionId'] ?? ''));
        $pid = trim((string) ($body['playerId'] ?? ''));
        $qIdx = (int) ($body['questionIndex'] ?? -1);
        $payload = $body['answerPayload'] ?? null;

        $sStmt = $pdo->prepare('SELECT * FROM game_sessions WHERE id = :id LIMIT 1');
        $sStmt->execute([':id' => $sid]);
        $session = $sStmt->fetch();
        if (!$session) {
            jsonError('Không tìm thấy phòng game.', 404);
        }

        $nowMs = gameNowMs();
        $curIdx = (int) $session['current_q_index'];
        $state = (string) $session['state'];
        $endsMs = (int) $session['question_ends_at_ms'];
        $startedMs = (int) $session['question_started_at_ms'];

        if ($qIdx !== $curIdx) {
            jsonError('Câu hỏi đã chuyển sang lượt khác.', 409);
        }
        // Allow 1500ms network grace window
        if ($state !== 'QUESTION_ACTIVE' && !($state === 'QUESTION_RESULT' && $nowMs <= $endsMs + 1500)) {
            jsonError('Đã hết thời gian trả lời câu hỏi này.', 409);
        }
        if ($nowMs > $endsMs + 1500) {
            jsonError('Đã hết thời gian trả lời.', 409);
        }

        $pStmt = $pdo->prepare('SELECT * FROM game_players WHERE id = :pid AND session_id = :sid AND is_kicked = 0 LIMIT 1');
        $pStmt->execute([':pid' => $pid, ':sid' => $sid]);
        $player = $pStmt->fetch();
        if (!$player) {
            jsonError('Người chơi không hợp lệ.', 403);
        }

        // Prevent duplicate answer
        $dupStmt = $pdo->prepare('SELECT id FROM game_answers WHERE session_id = :sid AND player_id = :pid AND question_index = :qi LIMIT 1');
        $dupStmt->execute([':sid' => $sid, ':pid' => $pid, ':qi' => $qIdx]);
        if ($dupStmt->fetch()) {
            jsonResponse(['ok' => true, 'duplicate' => true]);
        }

        $questions = json_decode((string) $session['questions_snapshot_json'], true) ?: [];
        $curQ = $questions[$qIdx] ?? null;
        if (!$curQ) {
            jsonError('Không tìm thấy câu hỏi.', 404);
        }

        $timeLimitMs = max(1000, ((int) ($curQ['timeLimitSec'] ?? $session['default_time_sec'] ?? 20)) * 1000);
        $responseTimeMs = max(0, min($timeLimitMs, $nowMs - $startedMs));

        $encodedPayload = (string) json_encode($payload, JSON_UNESCAPED_UNICODE);
        if (strlen($encodedPayload) > 500) {
            jsonError('Dữ liệu trả lời vượt quá giới hạn.', 400);
        }

        $grade = gradeGameAnswer($curQ, $payload);
        $earnedRatio = (float) $grade['earnedRatio'];
        $isCorrect = (bool) $grade['isCorrect'];

        $isFinal = ($qIdx === count($questions) - 1);
        $multiplier = ($isFinal && (int) $session['double_final_question'] === 1) ? 2 : 1;
        $basePoints = 1000 * $multiplier;

        $currentStreak = (int) $player['streak'];
        $pointsEarned = 0;
        $newStreak = 0;

        if ($earnedRatio > 0) {
            $timeRatio = min(1.0, max(0.0, $responseTimeMs / $timeLimitMs));
            $speedScore = (int) round($basePoints * $earnedRatio * (1.0 - ($timeRatio / 2.0)));
            if ($earnedRatio >= 0.999) {
                $newStreak = $currentStreak + 1;
                $streakBonus = min(($newStreak - 1) * 100, 300);
            } elseif ($earnedRatio >= 0.5) {
                $newStreak = $currentStreak; // Preserve streak on partial >= 50%
                $streakBonus = 0;
            } else {
                $newStreak = 0;
                $streakBonus = 0;
            }
            $pointsEarned = $speedScore + $streakBonus;
        }

        $pdo->prepare(
            'INSERT INTO game_answers (id, session_id, player_id, question_index, answer_payload_json, is_correct, earned_ratio, response_time_ms, points_earned, answered_at)
             VALUES (:id, :sid, :pid, :qi, :ap, :ic, :er, :rt, :pe, :at)'
        )->execute([
            ':id' => generateId('gans'),
            ':sid' => $sid,
            ':pid' => $pid,
            ':qi' => $qIdx,
            ':ap' => $encodedPayload,
            ':ic' => $isCorrect ? 1 : 0,
            ':er' => $earnedRatio,
            ':rt' => $responseTimeMs,
            ':pe' => $pointsEarned,
            ':at' => nowIso(),
        ]);

        $pdo->prepare(
            'UPDATE game_players
             SET score = score + :pe, streak = :st, correct_count = correct_count + :cc
             WHERE id = :pid'
        )->execute([
            ':pe' => $pointsEarned,
            ':st' => $newStreak,
            ':cc' => $isCorrect ? 1 : 0,
            ':pid' => $pid,
        ]);

        writeGamePollCache($pdo, $session);

        jsonResponse([
            'ok' => true,
            'recorded' => true,
        ]);
    }

    jsonError('Hành động không hợp lệ.', 400);
}
