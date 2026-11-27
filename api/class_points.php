<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Fixed Class Roster & Time-Series Point Ledger API
 * STRICTLY OFFICIAL INSTRUCTOR ONLY (requireOfficialInstructor -> role === 'OFFICIAL').
 * Shares fixed class rosters with Smart QR Attendance (attendance_classes) and stores
 * immutable reward/penalty ledger entries in class_point_ledger for multi-period analytics
 * (day, week, month, year, semester, academic year, custom date range).
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';

applyCorsHeaders();

function cpTodayVnDate(): string
{
    try {
        $tz = new DateTimeZone('Asia/Ho_Chi_Minh');
        return (new DateTimeImmutable('now', $tz))->format('Y-m-d');
    } catch (Throwable) {
        return gmdate('Y-m-d', time() + 7 * 3600);
    }
}

function cpSanitizeDate(?string $raw): string
{
    $s = trim((string) ($raw ?? ''));
    if ($s === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return '';
    }
    return $s;
}

function cpNormalizeRosterEntries(array $rawEntries): array
{
    $usedCodes = [];
    $out = [];
    $seq = 1;

    foreach ($rawEntries as $item) {
        if (!is_array($item)) {
            continue;
        }
        $lastName = trim((string) ($item['lastName'] ?? ''));
        $firstName = trim((string) ($item['firstName'] ?? ''));
        $fullName = trim((string) ($item['fullName'] ?? $item['name'] ?? ''));

        if ($lastName === '' && $firstName === '' && $fullName !== '') {
            $parts = preg_split('/\s+/', $fullName) ?: [$fullName];
            if (count($parts) > 1) {
                $firstName = (string) array_pop($parts);
                $lastName = implode(' ', $parts);
            } else {
                $firstName = $fullName;
            }
        }
        if ($lastName === '' && $firstName === '') {
            continue;
        }

        $code = strtoupper(trim((string) ($item['studentCode'] ?? '')));
        if ($code === '') {
            do {
                $code = 'HS' . str_pad((string) $seq, 2, '0', STR_PAD_LEFT);
                $seq++;
            } while (isset($usedCodes[$code]));
        } else {
            // Ensure uniqueness even if teacher accidentally duplicated a code
            $base = $code;
            $dupIdx = 2;
            while (isset($usedCodes[$code])) {
                $code = $base . '_' . $dupIdx;
                $dupIdx++;
            }
        }
        $usedCodes[$code] = true;

        $out[] = [
            'studentCode' => $code,
            'lastName' => $lastName,
            'firstName' => $firstName,
            'className' => trim((string) ($item['className'] ?? '')),
            'gender' => trim((string) ($item['gender'] ?? '')),
            'dob' => trim((string) ($item['dob'] ?? '')),
        ];
    }

    return $out;
}

function cpFormatClass(array $row, array $agg = []): array
{
    $rosterRaw = json_decode((string) ($row['roster_entries_json'] ?? '[]'), true);
    $roster = is_array($rosterRaw) ? cpNormalizeRosterEntries($rosterRaw) : [];

    $reward = round((float) ($agg['total_reward'] ?? 0), 2);
    $penalty = round((float) ($agg['total_penalty'] ?? 0), 2);

    return [
        'id' => (string) $row['id'],
        'ownerId' => (string) $row['owner_id'],
        'courseId' => $row['course_id'] !== null ? (string) $row['course_id'] : undefinedOrNull(),
        'classCode' => (string) ($row['class_code'] ?? ''),
        'title' => (string) ($row['title'] ?? ''),
        'semester' => (string) ($row['semester'] ?? ''),
        'credits' => (int) ($row['credits'] ?? 3),
        'instructorName' => (string) ($row['instructor_name'] ?? ''),
        'rosterEntries' => $roster,
        'studentCount' => count($roster),
        'totalReward' => $reward,
        'totalPenalty' => $penalty,
        'netPoints' => round($reward - $penalty, 2),
        'entryCount' => (int) ($agg['entry_count'] ?? 0),
        'lastActivityAt' => $agg['last_activity_at'] ?? null,
        'createdAt' => (string) ($row['created_at'] ?? ''),
    ];
}

function undefinedOrNull(): ?string
{
    return null;
}

function cpRound2(float $v): float
{
    return round($v, 2);
}

try {
    $pdo = getDb();
    $action = trim((string) ($_GET['action'] ?? 'list_classes'));

    // Strictly require OFFICIAL instructor account (rejects Demo / unauthenticated)
    $auth = requireOfficialInstructor();
    $ownerId = (string) ($auth['instructorId'] ?? '');
    if ($ownerId === '' || $ownerId === 'DEMO_INSTRUCTOR' || $ownerId === 'SYSTEM_DEMO') {
        jsonError('Tính năng Lớp cố định & Sổ điểm tích lũy chỉ dành cho tài khoản giáo viên chính thức.', 403);
    }

    if ($action === 'list_classes') {
        $stmt = $pdo->prepare('SELECT * FROM attendance_classes WHERE owner_id = :oid ORDER BY created_at DESC');
        $stmt->execute([':oid' => $ownerId]);
        $rows = $stmt->fetchAll();

        $aggStmt = $pdo->prepare(
            "SELECT class_id,
                    SUM(CASE WHEN point_type = 'REWARD' THEN delta_points ELSE 0 END) AS total_reward,
                    SUM(CASE WHEN point_type = 'PENALTY' THEN delta_points ELSE 0 END) AS total_penalty,
                    COUNT(*) AS entry_count,
                    MAX(created_at) AS last_activity_at
             FROM class_point_ledger
             WHERE owner_id = :oid
             GROUP BY class_id"
        );
        $aggStmt->execute([':oid' => $ownerId]);
        $aggMap = [];
        foreach ($aggStmt->fetchAll() as $a) {
            $aggMap[(string) $a['class_id']] = $a;
        }

        $classes = array_map(
            static fn (array $r): array => cpFormatClass($r, $aggMap[(string) $r['id']] ?? []),
            $rows
        );

        jsonResponse(['ok' => true, 'classes' => $classes]);
    }

    if ($action === 'save_class') {
        $body = readJsonBody();
        $id = trim((string) ($body['id'] ?? ''));
        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            jsonError('Vui lòng nhập Tên lớp cố định.', 400);
        }
        $classCode = trim((string) ($body['classCode'] ?? ''));
        $semester = trim((string) ($body['semester'] ?? ''));
        $credits = max(1, (int) ($body['credits'] ?? 3));
        $instructorName = trim((string) ($body['instructorName'] ?? ($auth['name'] ?? '')));
        $courseId = trim((string) ($body['courseId'] ?? '')) ?: null;
        $rawRoster = is_array($body['rosterEntries'] ?? null) ? $body['rosterEntries'] : [];
        $normalizedRoster = cpNormalizeRosterEntries($rawRoster);
        $rosterJson = json_encode($normalizedRoster, JSON_UNESCAPED_UNICODE);

        if ($id !== '') {
            $chk = $pdo->prepare('SELECT id FROM attendance_classes WHERE id = :id AND owner_id = :oid LIMIT 1');
            $chk->execute([':id' => $id, ':oid' => $ownerId]);
            if ($chk->fetch()) {
                $pdo->prepare(
                    'UPDATE attendance_classes
                     SET course_id = :cid, class_code = :cc, title = :t, semester = :sem,
                         credits = :cr, instructor_name = :inst, roster_entries_json = :rej
                     WHERE id = :id AND owner_id = :oid'
                )->execute([
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
            $pdo->prepare(
                'INSERT INTO attendance_classes
                    (id, owner_id, course_id, class_code, title, semester, credits, instructor_name, roster_entries_json, created_at)
                 VALUES (:id, :oid, :cid, :cc, :t, :sem, :cr, :inst, :rej, :ca)'
            )->execute([
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

        $rowStmt = $pdo->prepare('SELECT * FROM attendance_classes WHERE id = :id AND owner_id = :oid LIMIT 1');
        $rowStmt->execute([':id' => $id, ':oid' => $ownerId]);
        $saved = $rowStmt->fetch();

        $aggStmt = $pdo->prepare(
            "SELECT SUM(CASE WHEN point_type = 'REWARD' THEN delta_points ELSE 0 END) AS total_reward,
                    SUM(CASE WHEN point_type = 'PENALTY' THEN delta_points ELSE 0 END) AS total_penalty,
                    COUNT(*) AS entry_count,
                    MAX(created_at) AS last_activity_at
             FROM class_point_ledger
             WHERE owner_id = :oid AND class_id = :cid"
        );
        $aggStmt->execute([':oid' => $ownerId, ':cid' => $id]);
        $agg = $aggStmt->fetch() ?: [];

        jsonResponse([
            'ok' => true,
            'classItem' => $saved ? cpFormatClass($saved, $agg) : null,
        ]);
    }

    if ($action === 'delete_class') {
        $body = readJsonBody();
        $classId = trim((string) ($body['classId'] ?? ''));
        if ($classId === '') {
            jsonError('Thiếu classId.', 400);
        }

        $pdo->prepare('DELETE FROM class_point_ledger WHERE class_id = :cid AND owner_id = :oid')
            ->execute([':cid' => $classId, ':oid' => $ownerId]);

        $sStmt = $pdo->prepare('SELECT id FROM attendance_sessions WHERE class_id = :cid AND owner_id = :oid');
        $sStmt->execute([':cid' => $classId, ':oid' => $ownerId]);
        $sIds = $sStmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($sIds as $sid) {
            $pdo->prepare('DELETE FROM attendance_records WHERE session_id = :sid')->execute([':sid' => $sid]);
        }
        $pdo->prepare('DELETE FROM attendance_sessions WHERE class_id = :cid AND owner_id = :oid')
            ->execute([':cid' => $classId, ':oid' => $ownerId]);
        $pdo->prepare('DELETE FROM attendance_classes WHERE id = :cid AND owner_id = :oid')
            ->execute([':cid' => $classId, ':oid' => $ownerId]);

        jsonResponse(['ok' => true]);
    }

    if ($action === 'class_summary') {
        $classId = trim((string) ($_GET['classId'] ?? ''));
        if ($classId === '') {
            jsonError('Thiếu classId.', 400);
        }
        $startDate = cpSanitizeDate($_GET['startDate'] ?? '');
        $endDate = cpSanitizeDate($_GET['endDate'] ?? '');

        $clsStmt = $pdo->prepare('SELECT * FROM attendance_classes WHERE id = :cid AND owner_id = :oid LIMIT 1');
        $clsStmt->execute([':cid' => $classId, ':oid' => $ownerId]);
        $clsRow = $clsStmt->fetch();
        if (!$clsRow) {
            jsonError('Không tìm thấy lớp cố định hoặc bạn không có quyền truy cập.', 404);
        }

        $where = 'WHERE owner_id = :oid AND class_id = :cid';
        $params = [':oid' => $ownerId, ':cid' => $classId];
        if ($startDate !== '') {
            $where .= ' AND occurred_date >= :sd';
            $params[':sd'] = $startDate;
        }
        if ($endDate !== '') {
            $where .= ' AND occurred_date <= :ed';
            $params[':ed'] = $endDate;
        }

        $lStmt = $pdo->prepare(
            "SELECT * FROM class_point_ledger $where ORDER BY occurred_date DESC, created_at DESC"
        );
        $lStmt->execute($params);
        $ledgerRows = $lStmt->fetchAll();

        $formattedClass = cpFormatClass($clsRow, []);
        $rosterEntries = $formattedClass['rosterEntries'];

        // Seed student map from fixed roster
        $studentMap = [];
        foreach ($rosterEntries as $stu) {
            $code = strtoupper((string) $stu['studentCode']);
            $fullName = trim(((string) $stu['lastName']) . ' ' . ((string) $stu['firstName']));
            $studentMap[$code] = [
                'studentCode' => $code,
                'studentName' => $fullName,
                'gender' => (string) ($stu['gender'] ?? ''),
                'inRoster' => true,
                'rewardPoints' => 0.0,
                'penaltyPoints' => 0.0,
                'netPoints' => 0.0,
                'rewardCount' => 0,
                'penaltyCount' => 0,
                'totalEvents' => 0,
                'lastActivityAt' => null,
            ];
        }

        $totalReward = 0.0;
        $totalPenalty = 0.0;
        $dateBuckets = [];
        $entriesOut = [];

        foreach ($ledgerRows as $idx => $r) {
            $code = strtoupper(trim((string) ($r['student_code'] ?? '')));
            $name = trim((string) ($r['student_name'] ?? ''));
            $pType = ((string) ($r['point_type'] ?? 'REWARD')) === 'PENALTY' ? 'PENALTY' : 'REWARD';
            $pts = max(0.0, (float) ($r['delta_points'] ?? 0));
            $occDate = (string) ($r['occurred_date'] ?? '');
            $createdAt = (string) ($r['created_at'] ?? '');

            if ($code === '') {
                $code = 'STU_' . substr(md5($name), 0, 6);
            }
            if (!isset($studentMap[$code])) {
                $studentMap[$code] = [
                    'studentCode' => $code,
                    'studentName' => $name !== '' ? $name : $code,
                    'gender' => '',
                    'inRoster' => false,
                    'rewardPoints' => 0.0,
                    'penaltyPoints' => 0.0,
                    'netPoints' => 0.0,
                    'rewardCount' => 0,
                    'penaltyCount' => 0,
                    'totalEvents' => 0,
                    'lastActivityAt' => null,
                ];
            }

            if ($pType === 'REWARD') {
                $studentMap[$code]['rewardPoints'] = cpRound2($studentMap[$code]['rewardPoints'] + $pts);
                $studentMap[$code]['rewardCount']++;
                $totalReward = cpRound2($totalReward + $pts);
            } else {
                $studentMap[$code]['penaltyPoints'] = cpRound2($studentMap[$code]['penaltyPoints'] + $pts);
                $studentMap[$code]['penaltyCount']++;
                $totalPenalty = cpRound2($totalPenalty + $pts);
            }
            $studentMap[$code]['netPoints'] = cpRound2(
                $studentMap[$code]['rewardPoints'] - $studentMap[$code]['penaltyPoints']
            );
            $studentMap[$code]['totalEvents']++;
            if ($studentMap[$code]['lastActivityAt'] === null || $createdAt > $studentMap[$code]['lastActivityAt']) {
                $studentMap[$code]['lastActivityAt'] = $createdAt;
            }

            if ($occDate !== '') {
                if (!isset($dateBuckets[$occDate])) {
                    $dateBuckets[$occDate] = ['reward' => 0.0, 'penalty' => 0.0, 'count' => 0];
                }
                if ($pType === 'REWARD') {
                    $dateBuckets[$occDate]['reward'] = cpRound2($dateBuckets[$occDate]['reward'] + $pts);
                } else {
                    $dateBuckets[$occDate]['penalty'] = cpRound2($dateBuckets[$occDate]['penalty'] + $pts);
                }
                $dateBuckets[$occDate]['count']++;
            }

            if ($idx < 300) {
                $entriesOut[] = [
                    'id' => (string) $r['id'],
                    'classId' => (string) $r['class_id'],
                    'studentCode' => $code,
                    'studentName' => $name,
                    'sourceType' => (string) ($r['source_type'] ?? 'MINIGAME'),
                    'sourceId' => (string) ($r['source_id'] ?? ''),
                    'sourceTitle' => (string) ($r['source_title'] ?? ''),
                    'pointType' => $pType,
                    'deltaPoints' => cpRound2($pts),
                    'reason' => (string) ($r['reason'] ?? ''),
                    'occurredDate' => $occDate,
                    'createdAt' => $createdAt,
                ];
            }
        }

        $studentsList = array_values($studentMap);
        usort($studentsList, static function (array $a, array $b): int {
            if ($b['netPoints'] !== $a['netPoints']) {
                return $b['netPoints'] <=> $a['netPoints'];
            }
            if ($b['rewardPoints'] !== $a['rewardPoints']) {
                return $b['rewardPoints'] <=> $a['rewardPoints'];
            }
            return strcmp($a['studentCode'], $b['studentCode']);
        });

        // Build trend buckets: group by month (YYYY-MM) if > 45 distinct dates or wide range, else by day
        ksort($dateBuckets);
        $useMonthly = count($dateBuckets) > 45;
        if (!$useMonthly && $startDate !== '' && $endDate !== '') {
            $diffDays = (int) round((strtotime($endDate) - strtotime($startDate)) / 86400);
            if ($diffDays > 95) {
                $useMonthly = true;
            }
        }

        $trendMap = [];
        foreach ($dateBuckets as $day => $vals) {
            $key = $useMonthly ? substr($day, 0, 7) : $day;
            if (!isset($trendMap[$key])) {
                $trendMap[$key] = ['bucket' => $key, 'reward' => 0.0, 'penalty' => 0.0, 'net' => 0.0, 'count' => 0];
            }
            $trendMap[$key]['reward'] = cpRound2($trendMap[$key]['reward'] + $vals['reward']);
            $trendMap[$key]['penalty'] = cpRound2($trendMap[$key]['penalty'] + $vals['penalty']);
            $trendMap[$key]['net'] = cpRound2($trendMap[$key]['reward'] - $trendMap[$key]['penalty']);
            $trendMap[$key]['count'] += $vals['count'];
        }
        $trend = array_values($trendMap);

        $activeStudents = 0;
        foreach ($studentsList as $s) {
            if ($s['totalEvents'] > 0) {
                $activeStudents++;
            }
        }

        $formattedClass['totalReward'] = $totalReward;
        $formattedClass['totalPenalty'] = $totalPenalty;
        $formattedClass['netPoints'] = cpRound2($totalReward - $totalPenalty);
        $formattedClass['entryCount'] = count($ledgerRows);

        jsonResponse([
            'ok' => true,
            'classItem' => $formattedClass,
            'startDate' => $startDate,
            'endDate' => $endDate,
            'granularity' => $useMonthly ? 'MONTH' : 'DAY',
            'totals' => [
                'totalReward' => $totalReward,
                'totalPenalty' => $totalPenalty,
                'netTotal' => cpRound2($totalReward - $totalPenalty),
                'totalEvents' => count($ledgerRows),
                'activeStudents' => $activeStudents,
                'rosterCount' => count($rosterEntries),
            ],
            'students' => $studentsList,
            'trend' => $trend,
            'entries' => $entriesOut,
        ]);
    }

    if ($action === 'add_points') {
        $body = readJsonBody();
        $classId = trim((string) ($body['classId'] ?? ''));
        $rawEntries = is_array($body['entries'] ?? null) ? $body['entries'] : [];
        if ($classId === '' || count($rawEntries) === 0) {
            jsonError('Thiếu classId hoặc danh sách điểm cần ghi.', 400);
        }

        $chk = $pdo->prepare('SELECT id FROM attendance_classes WHERE id = :cid AND owner_id = :oid LIMIT 1');
        $chk->execute([':cid' => $classId, ':oid' => $ownerId]);
        if (!$chk->fetch()) {
            jsonError('Không tìm thấy lớp cố định thuộc tài khoản của bạn.', 404);
        }

        $todayVn = cpTodayVnDate();
        $now = nowIso();
        $ins = $pdo->prepare(
            'INSERT INTO class_point_ledger
                (id, owner_id, class_id, student_code, student_name, source_type, source_id, source_title, point_type, delta_points, reason, occurred_date, created_at)
             VALUES (:id, :oid, :cid, :sc, :sn, :st, :sid, :stitle, :pt, :dp, :rsn, :od, :ca)'
        );

        $created = [];
        $pdo->beginTransaction();
        try {
            foreach ($rawEntries as $e) {
                if (!is_array($e)) {
                    continue;
                }
                $studentCode = strtoupper(trim((string) ($e['studentCode'] ?? '')));
                $studentName = trim((string) ($e['studentName'] ?? ''));
                $points = cpRound2((float) ($e['points'] ?? 0));
                if ($studentName === '' || $points <= 0) {
                    continue;
                }
                if ($studentCode === '') {
                    $studentCode = 'STU_' . substr(md5($studentName), 0, 6);
                }
                $pointType = strtoupper(trim((string) ($e['pointType'] ?? 'REWARD'))) === 'PENALTY' ? 'PENALTY' : 'REWARD';
                $sourceType = strtoupper(trim((string) ($e['sourceType'] ?? 'MINIGAME')));
                if (!in_array($sourceType, ['MINIGAME', 'MANUAL', 'LIVE_GAME'], true)) {
                    $sourceType = 'MINIGAME';
                }
                $sourceId = substr(trim((string) ($e['sourceId'] ?? '')), 0, 64);
                $sourceTitle = substr(trim((string) ($e['sourceTitle'] ?? '')), 0, 255);
                $reason = substr(trim((string) ($e['reason'] ?? '')), 0, 255);
                $occDate = cpSanitizeDate($e['occurredDate'] ?? '') ?: $todayVn;
                $entryId = generateId('cpl');

                $ins->execute([
                    ':id' => $entryId,
                    ':oid' => $ownerId,
                    ':cid' => $classId,
                    ':sc' => $studentCode,
                    ':sn' => $studentName,
                    ':st' => $sourceType,
                    ':sid' => $sourceId,
                    ':stitle' => $sourceTitle,
                    ':pt' => $pointType,
                    ':dp' => $points,
                    ':rsn' => $reason,
                    ':od' => $occDate,
                    ':ca' => $now,
                ]);

                $created[] = [
                    'id' => $entryId,
                    'classId' => $classId,
                    'studentCode' => $studentCode,
                    'studentName' => $studentName,
                    'sourceType' => $sourceType,
                    'sourceId' => $sourceId,
                    'sourceTitle' => $sourceTitle,
                    'pointType' => $pointType,
                    'deltaPoints' => $points,
                    'reason' => $reason,
                    'occurredDate' => $occDate,
                    'createdAt' => $now,
                ];
            }
            $pdo->commit();
        } catch (Throwable $txErr) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $txErr;
        }

        jsonResponse([
            'ok' => true,
            'addedCount' => count($created),
            'entries' => $created,
        ]);
    }

    if ($action === 'delete_entry') {
        $body = readJsonBody();
        $entryId = trim((string) ($body['entryId'] ?? ''));
        if ($entryId === '') {
            jsonError('Thiếu entryId.', 400);
        }
        $del = $pdo->prepare('DELETE FROM class_point_ledger WHERE id = :id AND owner_id = :oid');
        $del->execute([':id' => $entryId, ':oid' => $ownerId]);
        jsonResponse(['ok' => true, 'deleted' => $del->rowCount()]);
    }

    if ($action === 'reset_class_points') {
        $body = readJsonBody();
        $classId = trim((string) ($body['classId'] ?? ''));
        if ($classId === '') {
            jsonError('Thiếu classId.', 400);
        }
        $startDate = cpSanitizeDate($body['startDate'] ?? '');
        $endDate = cpSanitizeDate($body['endDate'] ?? '');

        $where = 'WHERE class_id = :cid AND owner_id = :oid';
        $params = [':cid' => $classId, ':oid' => $ownerId];
        if ($startDate !== '') {
            $where .= ' AND occurred_date >= :sd';
            $params[':sd'] = $startDate;
        }
        if ($endDate !== '') {
            $where .= ' AND occurred_date <= :ed';
            $params[':ed'] = $endDate;
        }
        $del = $pdo->prepare("DELETE FROM class_point_ledger $where");
        $del->execute($params);
        jsonResponse(['ok' => true, 'deleted' => $del->rowCount()]);
    }

    jsonError('Hành động không được hỗ trợ: ' . $action, 400);
} catch (Throwable $e) {
    jsonError('Lỗi máy chủ Sổ điểm lớp: ' . $e->getMessage(), 500);
}
