<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Quick Poll Tools (Mentimeter-style) API
 * Public endpoints: ?action=poll_live (file-cached <2ms), ?action=lookup_pin, ?action=vote, ?action=create
 * Host endpoints (Bearer HMAC or X-Poll-Host-Key): ?action=list, ?action=host_view, ?action=update_state, ?action=delete
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';

function pollCachePath(string $pin): string
{
    $safePin = preg_replace('/[^a-zA-Z0-9_-]/', '', $pin);
    return rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'vne_poll_' . $safePin . '.json';
}

// Fast file-cache path before DB connection
if (($_GET['action'] ?? '') === 'poll_live' && empty($_GET['includeHidden'])) {
    applyCorsHeaders();
    $pin = preg_replace('/[^0-9]/', '', (string) ($_GET['pin'] ?? ''));
    if ($pin !== '') {
        $cacheFile = pollCachePath($pin);
        if (is_file($cacheFile)) {
            $raw = @file_get_contents($cacheFile);
            if (is_string($raw) && $raw !== '') {
                header('Content-Type: application/json; charset=utf-8');
                header('Cache-Control: no-store, no-cache, must-revalidate');
                echo $raw;
                exit;
            }
        }
    }
}

applyCorsHeaders();

$pdo = getDb();
ensurePollSchema($pdo, getDbDriver());

function getOptionalAdminAuth(): ?array
{
    return verifyAdminTokenPayload(extractBearerToken());
}

function getPollHostKey(array $body = []): string
{
    $candidates = [
        $_SERVER['HTTP_X_POLL_HOST_KEY'] ?? null,
        $_GET['hostKey'] ?? null,
        $body['hostKey'] ?? null,
    ];
    foreach ($candidates as $c) {
        if (is_string($c) && trim($c) !== '') {
            return trim($c);
        }
    }
    return '';
}

function canManagePoll(array $row, ?array $auth, string $hostKey): bool
{
    if ($auth !== null && ($row['owner_id'] ?? '') !== 'PUBLIC_ANON' && ($row['owner_id'] ?? '') === ($auth['instructorId'] ?? '')) {
        return true;
    }
    $hash = (string) ($row['host_key_hash'] ?? '');
    if ($hostKey !== '' && $hash !== '') {
        return hash_equals($hash, hash('sha256', $hostKey));
    }
    return false;
}

function normalizePollQuestions(mixed $rawQuestions): array
{
    if (!is_array($rawQuestions) || count($rawQuestions) === 0 || count($rawQuestions) > 30) {
        jsonError('Bộ câu hỏi khảo sát phải có từ 1 đến 30 câu.', 400);
    }

    $validTypes = ['MULTIPLE_CHOICE', 'WORD_CLOUD', 'OPEN_ENDED', 'SCALES', 'RANKING'];
    $validCharts = ['BAR', 'HORIZONTAL_BAR', 'DONUT', 'DOTS'];
    $normalized = [];

    foreach ($rawQuestions as $idx => $q) {
        if (!is_array($q)) {
            continue;
        }
        $type = in_array((string) ($q['type'] ?? ''), $validTypes, true)
            ? (string) $q['type']
            : 'MULTIPLE_CHOICE';
        $title = mb_substr(trim((string) ($q['title'] ?? '')), 0, 300);
        if ($title === '') {
            $title = 'Câu hỏi khảo sát #' . ($idx + 1);
        }
        $description = mb_substr(trim((string) ($q['description'] ?? '')), 0, 500);
        $chartType = in_array((string) ($q['chartType'] ?? ''), $validCharts, true)
            ? (string) $q['chartType']
            : 'BAR';
        $openEndedLayout = (($q['openEndedLayout'] ?? 'GRID') === 'FLOW') ? 'FLOW' : 'GRID';

        $item = [
            'id' => trim((string) ($q['id'] ?? '')) !== '' ? (string) $q['id'] : ('pq_' . ($idx + 1)),
            'type' => $type,
            'title' => $title,
            'description' => $description,
            'chartType' => $chartType,
            'openEndedLayout' => $openEndedLayout,
            'allowMultipleSelections' => (bool) ($q['allowMultipleSelections'] ?? false),
            'maxWordsPerVoter' => max(1, min(5, (int) ($q['maxWordsPerVoter'] ?? 3))),
            'scaleMin' => max(1, min(5, (int) ($q['scaleMin'] ?? 1))),
            'scaleMax' => max(3, min(10, (int) ($q['scaleMax'] ?? 5))),
            'scaleMinLabel' => mb_substr(trim((string) ($q['scaleMinLabel'] ?? 'Hoàn toàn không đồng ý')), 0, 80),
            'scaleMaxLabel' => mb_substr(trim((string) ($q['scaleMaxLabel'] ?? 'Hoàn toàn đồng ý')), 0, 80),
        ];

        if ($type === 'MULTIPLE_CHOICE' || $type === 'RANKING') {
            $opts = is_array($q['options'] ?? null) ? $q['options'] : [];
            $cleanOpts = [];
            foreach ($opts as $oi => $opt) {
                if (!is_array($opt)) {
                    continue;
                }
                $text = mb_substr(trim((string) ($opt['text'] ?? '')), 0, 180);
                if ($text === '') {
                    continue;
                }
                $cleanOpts[] = [
                    'id' => trim((string) ($opt['id'] ?? '')) !== '' ? (string) $opt['id'] : ('opt_' . ($oi + 1)),
                    'text' => $text,
                    'color' => isset($opt['color']) && is_string($opt['color']) ? $opt['color'] : null,
                ];
            }
            if (count($cleanOpts) < 2) {
                jsonError("Câu hỏi \"{$title}\" cần ít nhất 2 lựa chọn.", 400);
            }
            $item['options'] = array_slice($cleanOpts, 0, 12);
        } elseif ($type === 'SCALES') {
            $stmts = is_array($q['scaleStatements'] ?? null) ? $q['scaleStatements'] : [];
            $cleanStmts = [];
            foreach ($stmts as $si => $st) {
                if (!is_array($st)) {
                    continue;
                }
                $text = mb_substr(trim((string) ($st['text'] ?? '')), 0, 220);
                if ($text === '') {
                    continue;
                }
                $cleanStmts[] = [
                    'id' => trim((string) ($st['id'] ?? '')) !== '' ? (string) $st['id'] : ('st_' . ($si + 1)),
                    'text' => $text,
                ];
            }
            if (count($cleanStmts) < 1) {
                jsonError("Câu hỏi thang đo \"{$title}\" cần ít nhất 1 phát biểu.", 400);
            }
            $item['scaleStatements'] = array_slice($cleanStmts, 0, 8);
        }

        $normalized[] = $item;
    }

    if (count($normalized) === 0) {
        jsonError('Không có câu hỏi hợp lệ.', 400);
    }
    return $normalized;
}

function buildPollSnapshot(PDO $pdo, array $sessionRow, bool $includeHidden = false): array
{
    $questions = json_decode((string) ($sessionRow['questions_json'] ?? '[]'), true);
    if (!is_array($questions)) {
        $questions = [];
    }
    $hiddenItems = json_decode((string) ($sessionRow['hidden_items_json'] ?? '[]'), true);
    if (!is_array($hiddenItems)) {
        $hiddenItems = [];
    }
    $pinnedItems = json_decode((string) ($sessionRow['pinned_items_json'] ?? '[]'), true);
    if (!is_array($pinnedItems)) {
        $pinnedItems = [];
    }

    $hiddenSet = array_flip(array_map('strval', $hiddenItems));
    $pinnedSet = array_flip(array_map('strval', $pinnedItems));

    $qCount = count($questions);
    $qIdx = max(0, min($qCount > 0 ? $qCount - 1 : 0, (int) ($sessionRow['current_q_index'] ?? 0)));
    $currentQ = $questions[$qIdx] ?? null;

    $sid = (string) $sessionRow['id'];

    $votersStmt = $pdo->prepare('SELECT COUNT(DISTINCT device_token) FROM poll_votes WHERE session_id = :sid');
    $votersStmt->execute([':sid' => $sid]);
    $totalVoters = (int) $votersStmt->fetchColumn();

    $votesStmt = $pdo->prepare(
        'SELECT id, payload_json, created_at FROM poll_votes WHERE session_id = :sid AND question_index = :qi ORDER BY created_at ASC'
    );
    $votesStmt->execute([':sid' => $sid, ':qi' => $qIdx]);
    $voteRows = $votesStmt->fetchAll();

    $totalVotes = count($voteRows);
    $aggregation = [
        'optionCounts' => new stdClass(),
        'wordCounts' => [],
        'openResponses' => [],
        'scaleStats' => new stdClass(),
        'rankingStats' => [],
    ];

    if (is_array($currentQ)) {
        $type = (string) ($currentQ['type'] ?? 'MULTIPLE_CHOICE');

        if ($type === 'MULTIPLE_CHOICE') {
            $counts = [];
            foreach (($currentQ['options'] ?? []) as $opt) {
                $counts[(string) $opt['id']] = 0;
            }
            foreach ($voteRows as $vr) {
                $p = json_decode((string) $vr['payload_json'], true);
                $chosen = is_array($p['optionIds'] ?? null) ? $p['optionIds'] : [];
                foreach ($chosen as $oid) {
                    $key = (string) $oid;
                    if (array_key_exists($key, $counts)) {
                        $counts[$key]++;
                    }
                }
            }
            $aggregation['optionCounts'] = empty($counts) ? new stdClass() : $counts;
        } elseif ($type === 'WORD_CLOUD') {
            $wordMap = [];
            foreach ($voteRows as $vr) {
                $p = json_decode((string) $vr['payload_json'], true);
                $words = is_array($p['words'] ?? null) ? $p['words'] : [];
                foreach ($words as $rawW) {
                    $clean = preg_replace('/\s+/u', ' ', trim((string) $rawW));
                    if ($clean === '') {
                        continue;
                    }
                    $norm = mb_strtolower($clean, 'UTF-8');
                    $hideKey = "word:{$qIdx}:{$norm}";
                    $isHidden = isset($hiddenSet[$hideKey]);
                    if ($isHidden && !$includeHidden) {
                        continue;
                    }
                    if (!isset($wordMap[$norm])) {
                        $wordMap[$norm] = [
                            'word' => $clean,
                            'norm' => $norm,
                            'count' => 0,
                            'hidden' => $isHidden,
                        ];
                    }
                    $wordMap[$norm]['count']++;
                }
            }
            usort($wordMap, static fn (array $a, array $b): int => $b['count'] <=> $a['count']);
            $aggregation['wordCounts'] = array_slice(array_values($wordMap), 0, 80);
        } elseif ($type === 'OPEN_ENDED') {
            $responses = [];
            foreach ($voteRows as $vr) {
                $p = json_decode((string) $vr['payload_json'], true);
                $text = trim((string) ($p['text'] ?? ''));
                if ($text === '') {
                    continue;
                }
                $vid = (string) $vr['id'];
                $isHidden = isset($hiddenSet["resp:{$vid}"]);
                if ($isHidden && !$includeHidden) {
                    continue;
                }
                $responses[] = [
                    'id' => $vid,
                    'text' => $text,
                    'createdAt' => (string) $vr['created_at'],
                    'pinned' => isset($pinnedSet["resp:{$vid}"]),
                    'hidden' => $isHidden,
                ];
            }
            usort($responses, static function (array $a, array $b): int {
                if ($a['pinned'] !== $b['pinned']) {
                    return $a['pinned'] ? -1 : 1;
                }
                return strcmp($b['createdAt'], $a['createdAt']);
            });
            $aggregation['openResponses'] = $responses;
        } elseif ($type === 'SCALES') {
            $min = (int) ($currentQ['scaleMin'] ?? 1);
            $max = (int) ($currentQ['scaleMax'] ?? 5);
            $stats = [];
            foreach (($currentQ['scaleStatements'] ?? []) as $st) {
                $stid = (string) $st['id'];
                $dist = [];
                for ($v = $min; $v <= $max; $v++) {
                    $dist[(string) $v] = 0;
                }
                $stats[$stid] = [
                    'sum' => 0,
                    'count' => 0,
                    'avg' => 0.0,
                    'distribution' => $dist,
                ];
            }
            foreach ($voteRows as $vr) {
                $p = json_decode((string) $vr['payload_json'], true);
                $ratings = is_array($p['ratings'] ?? null) ? $p['ratings'] : [];
                foreach ($ratings as $stid => $val) {
                    $sk = (string) $stid;
                    if (!isset($stats[$sk])) {
                        continue;
                    }
                    $num = (int) $val;
                    if ($num < $min || $num > $max) {
                        continue;
                    }
                    $stats[$sk]['sum'] += $num;
                    $stats[$sk]['count']++;
                    $stats[$sk]['distribution'][(string) $num]++;
                }
            }
            $outStats = [];
            foreach ($stats as $sk => $st) {
                $outStats[$sk] = [
                    'avg' => $st['count'] > 0 ? round($st['sum'] / $st['count'], 2) : 0.0,
                    'count' => $st['count'],
                    'distribution' => $st['distribution'],
                ];
            }
            $aggregation['scaleStats'] = empty($outStats) ? new stdClass() : $outStats;
        } elseif ($type === 'RANKING') {
            $opts = is_array($currentQ['options'] ?? null) ? $currentQ['options'] : [];
            $nOpts = count($opts);
            $board = [];
            foreach ($opts as $opt) {
                $oid = (string) $opt['id'];
                $board[$oid] = [
                    'optionId' => $oid,
                    'text' => (string) $opt['text'],
                    'color' => $opt['color'] ?? null,
                    'score' => 0,
                    'rankSum' => 0,
                    'count' => 0,
                    'firstPlaceCount' => 0,
                ];
            }
            foreach ($voteRows as $vr) {
                $p = json_decode((string) $vr['payload_json'], true);
                $ranked = is_array($p['rankedOptionIds'] ?? null) ? $p['rankedOptionIds'] : [];
                $pos = 0;
                foreach ($ranked as $oid) {
                    $key = (string) $oid;
                    if (!isset($board[$key])) {
                        continue;
                    }
                    $points = max(1, $nOpts - $pos);
                    $board[$key]['score'] += $points;
                    $board[$key]['rankSum'] += ($pos + 1);
                    $board[$key]['count']++;
                    if ($pos === 0) {
                        $board[$key]['firstPlaceCount']++;
                    }
                    $pos++;
                }
            }
            $list = array_map(static function (array $row): array {
                return [
                    'optionId' => $row['optionId'],
                    'text' => $row['text'],
                    'color' => $row['color'],
                    'score' => $row['score'],
                    'avgRank' => $row['count'] > 0 ? round($row['rankSum'] / $row['count'], 2) : 0.0,
                    'firstPlaceCount' => $row['firstPlaceCount'],
                ];
            }, array_values($board));
            usort($list, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);
            $aggregation['rankingStats'] = $list;
        }
    }

    return [
        'ok' => true,
        'session' => [
            'id' => $sid,
            'title' => (string) $sessionRow['title'],
            'pollPin' => (string) $sessionRow['poll_pin'],
            'status' => (string) $sessionRow['status'],
            'currentQIndex' => $qIdx,
            'totalQuestions' => $qCount,
            'isLocked' => (bool) ((int) ($sessionRow['is_locked'] ?? 0)),
            'hideResults' => (bool) ((int) ($sessionRow['hide_results'] ?? 0)),
            'allowMultipleVotes' => (bool) ((int) ($sessionRow['allow_multiple_votes'] ?? 0)),
            'stateVersion' => (int) ($sessionRow['state_version'] ?? 1),
            'createdAt' => (string) $sessionRow['created_at'],
            'updatedAt' => (string) $sessionRow['updated_at'],
            'expiresAt' => $sessionRow['expires_at'] !== null ? (string) $sessionRow['expires_at'] : null,
            'isAnonymous' => ($sessionRow['owner_id'] ?? '') === 'PUBLIC_ANON',
        ],
        'questions' => $questions,
        'currentQuestion' => $currentQ,
        'totalVoters' => $totalVoters,
        'totalVotesCurrent' => $totalVotes,
        'aggregation' => $aggregation,
        'hiddenItems' => $includeHidden ? $hiddenItems : [],
        'pinnedItems' => $pinnedItems,
    ];
}

function writePollLiveCache(PDO $pdo, array $sessionRow): array
{
    $snapshot = buildPollSnapshot($pdo, $sessionRow, false);
    $pin = (string) ($sessionRow['poll_pin'] ?? '');
    if ($pin !== '') {
        @file_put_contents(pollCachePath($pin), json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    return $snapshot;
}

function cleanupExpiredPolls(PDO $pdo): void
{
    try {
        $now = nowIso();
        $stmt = $pdo->prepare('SELECT id, poll_pin FROM poll_sessions WHERE expires_at IS NOT NULL AND expires_at < :now LIMIT 50');
        $stmt->execute([':now' => $now]);
        $expired = $stmt->fetchAll();
        if (empty($expired)) {
            return;
        }
        $delVotes = $pdo->prepare('DELETE FROM poll_votes WHERE session_id = :sid');
        $delSess = $pdo->prepare('DELETE FROM poll_sessions WHERE id = :sid');
        foreach ($expired as $row) {
            $sid = (string) $row['id'];
            $delVotes->execute([':sid' => $sid]);
            $delSess->execute([':sid' => $sid]);
            $cache = pollCachePath((string) $row['poll_pin']);
            if (is_file($cache)) {
                @unlink($cache);
            }
        }
    } catch (Throwable) {
        // Non-blocking cleanup
    }
}

$action = (string) ($_GET['action'] ?? '');
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($action === 'poll_live' && $method === 'GET') {
    $pin = preg_replace('/[^0-9]/', '', (string) ($_GET['pin'] ?? ''));
    if ($pin === '') {
        jsonError('Thiếu mã PIN.', 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE poll_pin = :pin AND status != 'DELETED' ORDER BY created_at DESC LIMIT 1");
    $stmt->execute([':pin' => $pin]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Không tìm thấy phòng khảo sát với mã PIN này.', 404);
    }
    $snapshot = writePollLiveCache($pdo, $row);
    jsonResponse($snapshot);
}

if ($action === 'lookup_pin' && $method === 'GET') {
    $pin = preg_replace('/[^0-9]/', '', (string) ($_GET['pin'] ?? ''));
    $deviceToken = trim((string) ($_GET['deviceToken'] ?? ''));
    if (strlen($pin) !== 6) {
        jsonError('Mã PIN khảo sát phải gồm 6 chữ số.', 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE poll_pin = :pin AND status != 'DELETED' ORDER BY created_at DESC LIMIT 1");
    $stmt->execute([':pin' => $pin]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Mã PIN khảo sát không tồn tại hoặc đã bị đóng.', 404);
    }
    if ($row['expires_at'] !== null && strcmp((string) $row['expires_at'], nowIso()) < 0) {
        jsonError('Phòng khảo sát ẩn danh này đã hết hạn.', 410);
    }

    $snapshot = buildPollSnapshot($pdo, $row, false);
    $hasVotedCurrent = false;
    if ($deviceToken !== '' && !((bool) ((int) ($row['allow_multiple_votes'] ?? 0)))) {
        $chk = $pdo->prepare('SELECT 1 FROM poll_votes WHERE session_id = :sid AND question_index = :qi AND device_token = :dt LIMIT 1');
        $chk->execute([
            ':sid' => (string) $row['id'],
            ':qi' => (int) $row['current_q_index'],
            ':dt' => $deviceToken,
        ]);
        $hasVotedCurrent = (bool) $chk->fetchColumn();
    }

    jsonResponse([
        'ok' => true,
        'snapshot' => $snapshot,
        'hasVotedCurrent' => $hasVotedCurrent,
    ]);
}

if ($action === 'create' && $method === 'POST') {
    cleanupExpiredPolls($pdo);
    $body = readJsonBody();
    $auth = getOptionalAdminAuth();

    $title = mb_substr(trim((string) ($body['title'] ?? '')), 0, 200);
    if ($title === '') {
        $title = 'Khảo sát nhanh trên lớp';
    }
    $questions = normalizePollQuestions($body['questions'] ?? []);
    $allowMultipleVotes = !empty($body['allowMultipleVotes']) ? 1 : 0;
    $hideResults = !empty($body['hideResults']) ? 1 : 0;

    $ownerId = $auth !== null ? (string) $auth['instructorId'] : 'PUBLIC_ANON';
    $hostKey = bin2hex(random_bytes(16));
    $hostKeyHash = hash('sha256', $hostKey);

    // Unique 6-digit active PIN
    $pollPin = '';
    for ($i = 0; $i < 20; $i++) {
        $candidate = (string) random_int(100000, 999999);
        $chk = $pdo->prepare("SELECT 1 FROM poll_sessions WHERE poll_pin = :pin AND status = 'ACTIVE' LIMIT 1");
        $chk->execute([':pin' => $candidate]);
        if (!$chk->fetchColumn()) {
            $pollPin = $candidate;
            break;
        }
    }
    if ($pollPin === '') {
        $pollPin = (string) random_int(100000, 999999);
    }

    $id = generateId('poll');
    $now = nowIso();
    $expiresAt = $ownerId === 'PUBLIC_ANON' ? gmdate('Y-m-d\TH:i:s\Z', time() + 7 * 86400) : null;

    $ins = $pdo->prepare(
        'INSERT INTO poll_sessions (id, owner_id, host_key_hash, title, poll_pin, questions_json, current_q_index, is_locked, hide_results, allow_multiple_votes, hidden_items_json, pinned_items_json, state_version, status, created_at, updated_at, expires_at)
         VALUES (:id, :owner_id, :host_key_hash, :title, :poll_pin, :questions_json, 0, 0, :hide_results, :allow_multiple_votes, :hidden, :pinned, 1, :status, :created_at, :updated_at, :expires_at)'
    );
    $ins->execute([
        ':id' => $id,
        ':owner_id' => $ownerId,
        ':host_key_hash' => $hostKeyHash,
        ':title' => $title,
        ':poll_pin' => $pollPin,
        ':questions_json' => json_encode($questions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':hide_results' => $hideResults,
        ':allow_multiple_votes' => $allowMultipleVotes,
        ':hidden' => '[]',
        ':pinned' => '[]',
        ':status' => 'ACTIVE',
        ':created_at' => $now,
        ':updated_at' => $now,
        ':expires_at' => $expiresAt,
    ]);

    $rowStmt = $pdo->prepare('SELECT * FROM poll_sessions WHERE id = :id');
    $rowStmt->execute([':id' => $id]);
    $row = $rowStmt->fetch();
    $snapshot = writePollLiveCache($pdo, $row);

    jsonResponse([
        'ok' => true,
        'sessionId' => $id,
        'pollPin' => $pollPin,
        'hostKey' => $hostKey,
        'snapshot' => $snapshot,
    ], 201);
}

if ($action === 'list') {
    $auth = getOptionalAdminAuth();
    $body = $method === 'POST' ? readJsonBody() : [];
    $hostKeysMap = [];
    if (is_array($body['hostKeys'] ?? null)) {
        foreach ($body['hostKeys'] as $sid => $hk) {
            if (is_string($sid) && is_string($hk) && $hk !== '') {
                $hostKeysMap[$sid] = $hk;
            }
        }
    }

    $rows = [];
    if ($auth !== null) {
        $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE owner_id = :oid AND status != 'DELETED' ORDER BY updated_at DESC LIMIT 50");
        $stmt->execute([':oid' => (string) $auth['instructorId']]);
        $rows = $stmt->fetchAll();
    }

    $seenIds = [];
    foreach ($rows as $r) {
        $seenIds[(string) $r['id']] = true;
    }

    if (!empty($hostKeysMap)) {
        $ids = array_slice(array_keys($hostKeysMap), 0, 40);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE id IN ({$placeholders}) AND status != 'DELETED' ORDER BY updated_at DESC");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $r) {
            $sid = (string) $r['id'];
            if (isset($seenIds[$sid])) {
                continue;
            }
            $hk = $hostKeysMap[$sid] ?? '';
            if ($hk !== '' && hash_equals((string) $r['host_key_hash'], hash('sha256', $hk))) {
                $rows[] = $r;
                $seenIds[$sid] = true;
            }
        }
    }

    $out = [];
    $voteCountStmt = $pdo->prepare('SELECT COUNT(DISTINCT device_token) FROM poll_votes WHERE session_id = :sid');
    foreach ($rows as $r) {
        $qs = json_decode((string) $r['questions_json'], true);
        $voteCountStmt->execute([':sid' => (string) $r['id']]);
        $voters = (int) $voteCountStmt->fetchColumn();
        $out[] = [
            'id' => (string) $r['id'],
            'title' => (string) $r['title'],
            'pollPin' => (string) $r['poll_pin'],
            'status' => (string) $r['status'],
            'totalQuestions' => is_array($qs) ? count($qs) : 0,
            'currentQIndex' => (int) $r['current_q_index'],
            'voterCount' => $voters,
            'createdAt' => (string) $r['created_at'],
            'updatedAt' => (string) $r['updated_at'],
            'expiresAt' => $r['expires_at'] !== null ? (string) $r['expires_at'] : null,
            'isAnonymous' => ($r['owner_id'] ?? '') === 'PUBLIC_ANON',
        ];
    }

    jsonResponse(['ok' => true, 'polls' => $out]);
}

if ($action === 'host_view' && $method === 'GET') {
    $sessionId = trim((string) ($_GET['sessionId'] ?? ''));
    if ($sessionId === '') {
        jsonError('Thiếu sessionId.', 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE id = :id AND status != 'DELETED' LIMIT 1");
    $stmt->execute([':id' => $sessionId]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Không tìm thấy phòng khảo sát.', 404);
    }
    $auth = getOptionalAdminAuth();
    $hostKey = getPollHostKey();
    if (!canManagePoll($row, $auth, $hostKey)) {
        jsonError('Bạn không có quyền điều khiển phòng khảo sát này.', 403);
    }
    $snapshot = buildPollSnapshot($pdo, $row, true);
    jsonResponse($snapshot);
}

if ($action === 'update_state' && $method === 'POST') {
    $body = readJsonBody();
    $sessionId = trim((string) ($body['sessionId'] ?? ''));
    if ($sessionId === '') {
        jsonError('Thiếu sessionId.', 400);
    }
    $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE id = :id AND status != 'DELETED' LIMIT 1");
    $stmt->execute([':id' => $sessionId]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Không tìm thấy phòng khảo sát.', 404);
    }
    $auth = getOptionalAdminAuth();
    $hostKey = getPollHostKey($body);
    if (!canManagePoll($row, $auth, $hostKey)) {
        jsonError('Bạn không có quyền cập nhật phòng khảo sát này.', 403);
    }

    $questions = json_decode((string) $row['questions_json'], true);
    if (!is_array($questions)) {
        $questions = [];
    }
    $hiddenItems = json_decode((string) ($row['hidden_items_json'] ?? '[]'), true);
    if (!is_array($hiddenItems)) {
        $hiddenItems = [];
    }
    $pinnedItems = json_decode((string) ($row['pinned_items_json'] ?? '[]'), true);
    if (!is_array($pinnedItems)) {
        $pinnedItems = [];
    }

    $title = isset($body['title']) ? mb_substr(trim((string) $body['title']), 0, 200) : (string) $row['title'];
    if ($title === '') {
        $title = (string) $row['title'];
    }
    if (isset($body['questions'])) {
        $questions = normalizePollQuestions($body['questions']);
    }

    $qIdx = isset($body['currentQIndex']) ? (int) $body['currentQIndex'] : (int) $row['current_q_index'];
    $qIdx = max(0, min(max(0, count($questions) - 1), $qIdx));

    if (isset($body['chartType']) && isset($questions[$qIdx])) {
        $validCharts = ['BAR', 'HORIZONTAL_BAR', 'DONUT', 'DOTS'];
        $ct = (string) $body['chartType'];
        if (in_array($ct, $validCharts, true)) {
            $questions[$qIdx]['chartType'] = $ct;
        }
    }
    if (isset($body['openEndedLayout']) && isset($questions[$qIdx])) {
        $questions[$qIdx]['openEndedLayout'] = ($body['openEndedLayout'] === 'FLOW') ? 'FLOW' : 'GRID';
    }

    $isLocked = array_key_exists('isLocked', $body) ? (!empty($body['isLocked']) ? 1 : 0) : (int) $row['is_locked'];
    $hideResults = array_key_exists('hideResults', $body) ? (!empty($body['hideResults']) ? 1 : 0) : (int) $row['hide_results'];
    $allowMultipleVotes = array_key_exists('allowMultipleVotes', $body)
        ? (!empty($body['allowMultipleVotes']) ? 1 : 0)
        : (int) $row['allow_multiple_votes'];

    $status = (string) $row['status'];
    if (isset($body['status']) && in_array((string) $body['status'], ['ACTIVE', 'ENDED'], true)) {
        $status = (string) $body['status'];
    }

    if (!empty($body['resetCurrentVotes'])) {
        $del = $pdo->prepare('DELETE FROM poll_votes WHERE session_id = :sid AND question_index = :qi');
        $del->execute([':sid' => $sessionId, ':qi' => $qIdx]);
    }

    if (isset($body['toggleHideItem']) && is_string($body['toggleHideItem'])) {
        $key = trim($body['toggleHideItem']);
        if ($key !== '') {
            if (in_array($key, $hiddenItems, true)) {
                $hiddenItems = array_values(array_diff($hiddenItems, [$key]));
            } else {
                $hiddenItems[] = $key;
            }
        }
    }

    if (isset($body['togglePinItem']) && is_string($body['togglePinItem'])) {
        $key = trim($body['togglePinItem']);
        if ($key !== '') {
            if (in_array($key, $pinnedItems, true)) {
                $pinnedItems = array_values(array_diff($pinnedItems, [$key]));
            } else {
                $pinnedItems[] = $key;
            }
        }
    }

    $newVersion = ((int) $row['state_version']) + 1;
    $now = nowIso();

    $upd = $pdo->prepare(
        'UPDATE poll_sessions SET title = :title, questions_json = :qs, current_q_index = :qi, is_locked = :lk, hide_results = :hr, allow_multiple_votes = :amv, hidden_items_json = :hi, pinned_items_json = :pi, state_version = :sv, status = :st, updated_at = :ua WHERE id = :id'
    );
    $upd->execute([
        ':title' => $title,
        ':qs' => json_encode($questions, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':qi' => $qIdx,
        ':lk' => $isLocked,
        ':hr' => $hideResults,
        ':amv' => $allowMultipleVotes,
        ':hi' => json_encode(array_values($hiddenItems), JSON_UNESCAPED_UNICODE),
        ':pi' => json_encode(array_values($pinnedItems), JSON_UNESCAPED_UNICODE),
        ':sv' => $newVersion,
        ':st' => $status,
        ':ua' => $now,
        ':id' => $sessionId,
    ]);

    $rowStmt = $pdo->prepare('SELECT * FROM poll_sessions WHERE id = :id');
    $rowStmt->execute([':id' => $sessionId]);
    $updatedRow = $rowStmt->fetch();
    writePollLiveCache($pdo, $updatedRow);

    $hostSnapshot = buildPollSnapshot($pdo, $updatedRow, true);
    jsonResponse($hostSnapshot);
}

if ($action === 'vote' && $method === 'POST') {
    $body = readJsonBody();
    $pin = preg_replace('/[^0-9]/', '', (string) ($body['pollPin'] ?? ''));
    $sessionId = trim((string) ($body['sessionId'] ?? ''));
    $deviceToken = mb_substr(trim((string) ($body['deviceToken'] ?? '')), 0, 120);
    $voterName = mb_substr(trim((string) ($body['voterName'] ?? '')), 0, 80);

    if ($deviceToken === '') {
        jsonError('Thiếu định danh thiết bị.', 400);
    }

    if ($sessionId !== '') {
        $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE id = :id AND status != 'DELETED' LIMIT 1");
        $stmt->execute([':id' => $sessionId]);
    } elseif ($pin !== '') {
        $stmt = $pdo->prepare("SELECT * FROM poll_sessions WHERE poll_pin = :pin AND status != 'DELETED' ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([':pin' => $pin]);
    } else {
        jsonError('Thiếu thông tin phòng khảo sát.', 400);
    }
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Phòng khảo sát không tồn tại.', 404);
    }
    if (($row['status'] ?? '') !== 'ACTIVE') {
        jsonError('Phòng khảo sát đã kết thúc.', 409);
    }
    if ((int) ($row['is_locked'] ?? 0) === 1) {
        jsonError('Giảng viên đã tạm khóa bình chọn cho câu hỏi này.', 423);
    }

    $questions = json_decode((string) $row['questions_json'], true);
    if (!is_array($questions)) {
        $questions = [];
    }
    $qIdx = (int) ($body['questionIndex'] ?? $row['current_q_index']);
    if ($qIdx !== (int) $row['current_q_index']) {
        jsonError('Câu hỏi đã chuyển sang slide khác. Vui lòng tải lại.', 409);
    }
    $currentQ = $questions[$qIdx] ?? null;
    if (!is_array($currentQ)) {
        jsonError('Không tìm thấy câu hỏi hiện tại.', 404);
    }

    $allowMultiple = (int) ($row['allow_multiple_votes'] ?? 0) === 1;
    if (!$allowMultiple) {
        $chk = $pdo->prepare('SELECT 1 FROM poll_votes WHERE session_id = :sid AND question_index = :qi AND device_token = :dt LIMIT 1');
        $chk->execute([':sid' => (string) $row['id'], ':qi' => $qIdx, ':dt' => $deviceToken]);
        if ($chk->fetchColumn()) {
            jsonError('Bạn đã gửi bình chọn cho câu hỏi này rồi.', 409);
        }
    }

    $rawPayload = is_array($body['payload'] ?? null) ? $body['payload'] : [];
    $type = (string) ($currentQ['type'] ?? 'MULTIPLE_CHOICE');
    $cleanPayload = [];

    if ($type === 'MULTIPLE_CHOICE') {
        $validIds = array_map(static fn (array $o): string => (string) $o['id'], $currentQ['options'] ?? []);
        $chosen = is_array($rawPayload['optionIds'] ?? null) ? $rawPayload['optionIds'] : [];
        $filtered = array_values(array_unique(array_filter(array_map('strval', $chosen), static fn (string $id): bool => in_array($id, $validIds, true))));
        if (count($filtered) === 0) {
            jsonError('Vui lòng chọn ít nhất một đáp án.', 400);
        }
        if (empty($currentQ['allowMultipleSelections'])) {
            $filtered = [$filtered[0]];
        }
        $cleanPayload = ['optionIds' => $filtered];
    } elseif ($type === 'WORD_CLOUD') {
        $maxW = max(1, min(5, (int) ($currentQ['maxWordsPerVoter'] ?? 3)));
        $rawWords = is_array($rawPayload['words'] ?? null) ? $rawPayload['words'] : [];
        $cleanWords = [];
        foreach ($rawWords as $w) {
            $s = mb_substr(preg_replace('/\s+/u', ' ', trim((string) $w)), 0, 40);
            if ($s !== '') {
                $cleanWords[] = $s;
            }
        }
        $cleanWords = array_slice($cleanWords, 0, $maxW);
        if (count($cleanWords) === 0) {
            jsonError('Vui lòng nhập ít nhất 1 từ khóa.', 400);
        }
        $cleanPayload = ['words' => $cleanWords];
    } elseif ($type === 'OPEN_ENDED') {
        $text = mb_substr(trim((string) ($rawPayload['text'] ?? '')), 0, 280);
        if ($text === '') {
            jsonError('Vui lòng nhập nội dung phản hồi.', 400);
        }
        $cleanPayload = ['text' => $text];
    } elseif ($type === 'SCALES') {
        $min = (int) ($currentQ['scaleMin'] ?? 1);
        $max = (int) ($currentQ['scaleMax'] ?? 5);
        $validStmts = array_map(static fn (array $s): string => (string) $s['id'], $currentQ['scaleStatements'] ?? []);
        $ratings = is_array($rawPayload['ratings'] ?? null) ? $rawPayload['ratings'] : [];
        $cleanRatings = [];
        foreach ($validStmts as $stid) {
            if (!array_key_exists($stid, $ratings)) {
                continue;
            }
            $v = (int) $ratings[$stid];
            if ($v >= $min && $v <= $max) {
                $cleanRatings[$stid] = $v;
            }
        }
        if (count($cleanRatings) === 0) {
            jsonError('Vui lòng chọn mức đánh giá.', 400);
        }
        $cleanPayload = ['ratings' => $cleanRatings];
    } elseif ($type === 'RANKING') {
        $validIds = array_map(static fn (array $o): string => (string) $o['id'], $currentQ['options'] ?? []);
        $ranked = is_array($rawPayload['rankedOptionIds'] ?? null) ? $rawPayload['rankedOptionIds'] : [];
        $filtered = array_values(array_unique(array_filter(array_map('strval', $ranked), static fn (string $id): bool => in_array($id, $validIds, true))));
        if (count($filtered) !== count($validIds)) {
            jsonError('Vui lòng xếp hạng đầy đủ các lựa chọn.', 400);
        }
        $cleanPayload = ['rankedOptionIds' => $filtered];
    }

    $voteId = generateId('pv');
    $now = nowIso();
    $ins = $pdo->prepare(
        'INSERT INTO poll_votes (id, session_id, question_index, device_token, voter_name, payload_json, created_at)
         VALUES (:id, :sid, :qi, :dt, :vn, :pj, :ca)'
    );
    $ins->execute([
        ':id' => $voteId,
        ':sid' => (string) $row['id'],
        ':qi' => $qIdx,
        ':dt' => $deviceToken,
        ':vn' => $voterName,
        ':pj' => json_encode($cleanPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':ca' => $now,
    ]);

    $newVer = ((int) $row['state_version']) + 1;
    $upd = $pdo->prepare('UPDATE poll_sessions SET state_version = :sv, updated_at = :ua WHERE id = :id');
    $upd->execute([':sv' => $newVer, ':ua' => $now, ':id' => (string) $row['id']]);

    $rowStmt = $pdo->prepare('SELECT * FROM poll_sessions WHERE id = :id');
    $rowStmt->execute([':id' => (string) $row['id']]);
    $updatedRow = $rowStmt->fetch();
    $snapshot = writePollLiveCache($pdo, $updatedRow);

    jsonResponse(['ok' => true, 'snapshot' => $snapshot]);
}

if ($action === 'delete' && $method === 'POST') {
    $body = readJsonBody();
    $sessionId = trim((string) ($body['sessionId'] ?? ''));
    if ($sessionId === '') {
        jsonError('Thiếu sessionId.', 400);
    }
    $stmt = $pdo->prepare('SELECT * FROM poll_sessions WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $sessionId]);
    $row = $stmt->fetch();
    if (!$row) {
        jsonError('Không tìm thấy phòng khảo sát.', 404);
    }
    $auth = getOptionalAdminAuth();
    $hostKey = getPollHostKey($body);
    if (!canManagePoll($row, $auth, $hostKey)) {
        jsonError('Bạn không có quyền xóa phòng khảo sát này.', 403);
    }

    $pdo->prepare('DELETE FROM poll_votes WHERE session_id = :sid')->execute([':sid' => $sessionId]);
    $pdo->prepare('DELETE FROM poll_sessions WHERE id = :sid')->execute([':sid' => $sessionId]);
    $cache = pollCachePath((string) $row['poll_pin']);
    if (is_file($cache)) {
        @unlink($cache);
    }

    jsonResponse(['ok' => true]);
}

jsonError('Action không hợp lệ.', 400);
