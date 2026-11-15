<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Attempts, Shuffling, Submission Grading,
 * 5-Minute Email Correction & Orphaned Attempt Sweeper API
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';
require_once __DIR__ . '/exams.php';
require_once __DIR__ . '/essay_grader.php';
require_once __DIR__ . '/mailer.php';

/**
 * 32-bit FNV-1a & Mulberry32 deterministic PRNG matching dynamicQuestionEngine.ts
 */
function imul32(int $a, int $b): int
{
    $a &= 0xFFFFFFFF;
    $b &= 0xFFFFFFFF;
    $ah = ($a >> 16) & 0xFFFF;
    $al = $a & 0xFFFF;
    $bh = ($b >> 16) & 0xFFFF;
    $bl = $b & 0xFFFF;
    $res = (($al * $bl) + (((($ah * $bl) + ($al * $bh)) & 0xFFFF) << 16)) & 0xFFFFFFFF;
    if ($res & 0x80000000) {
        return $res - 0x100000000;
    }
    return $res;
}

function fnv1aHashPhp(string $input): int
{
    $hash = 0x811c9dc5;
    $len = strlen($input);
    for ($i = 0; $i < $len; $i++) {
        $hash ^= ord($input[$i]);
        $hash = imul32($hash, 0x01000193) & 0xFFFFFFFF;
    }
    return $hash & 0xFFFFFFFF;
}

function createSeededRngPhp(string $seedStr): callable
{
    $state = fnv1aHashPhp($seedStr);
    if ($state === 0) {
        $state = 1;
    }
    if ($state & 0x80000000) {
        $state -= 0x100000000;
    }

    return static function () use (&$state): float {
        $state = ($state + 0x6d2b79f5) & 0xFFFFFFFF;
        if ($state & 0x80000000) {
            $state -= 0x100000000;
        }
        $u = ($state & 0xFFFFFFFF) >> 15;
        $t = imul32($state ^ $u, 1 | $state);
        $tu = ($t & 0xFFFFFFFF) >> 7;
        $t = (imul32($t ^ $tu, 61 | $t) + $t) & 0xFFFFFFFF;
        if ($t & 0x80000000) {
            $t -= 0x100000000;
        }
        $x = ($t ^ (($t & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF;
        return $x / 4294967296.0;
    };
}

function seededShufflePhp(array $items, callable $rng): array
{
    $arr = array_values($items);
    for ($i = count($arr) - 1; $i > 0; $i--) {
        $j = (int) floor($rng() * ($i + 1));
        [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
    }
    return $arr;
}

function buildAssignedQuestionsPhp(array $exam, array $courseQuestions, string $studentCode): array
{
    $byId = [];
    foreach ($courseQuestions as $q) {
        $byId[$q['id']] = $q;
    }

    $slotPointLookup = [];
    foreach ($exam['chapterMatrix'] ?? [] as $rule) {
        if (!empty($rule['pointsPerQuestion']) && (float) $rule['pointsPerQuestion'] > 0) {
            $slotPointLookup[(string) $rule['chapterCategory']] = (float) $rule['pointsPerQuestion'];
        }
    }

    $picked = [];
    $usedIds = [];
    foreach ($exam['pinnedQuestionIds'] ?? [] as $pid) {
        if (isset($byId[$pid]) && empty($usedIds[$pid])) {
            $usedIds[$pid] = true;
            $q = $byId[$pid];
            $picked[] = [
                'question' => $q,
                'slotPoints' => $slotPointLookup[$q['chapterCategory']] ?? (float) $q['points'],
            ];
        }
    }

    $matrix = $exam['chapterMatrix'] ?? [];
    if (count($matrix) > 0) {
        foreach ($matrix as $rule) {
            $cat = (string) ($rule['chapterCategory'] ?? '');
            $already = 0;
            foreach ($picked as $p) {
                if ($p['question']['chapterCategory'] === $cat) {
                    $already++;
                }
            }
            $rem = max(0, ((int) ($rule['questionCount'] ?? 0)) - $already);
            if ($rem === 0) {
                continue;
            }
            $pool = array_values(array_filter(
                $courseQuestions,
                static fn ($q) => $q['chapterCategory'] === $cat && empty($usedIds[$q['id']])
            ));
            $rng = createSeededRngPhp($studentCode . '::' . $exam['id'] . '::pool::' . $cat);
            $selected = !empty($exam['shuffleQuestions']) ? seededShufflePhp($pool, $rng) : $pool;
            foreach (array_slice($selected, 0, $rem) as $q) {
                $usedIds[$q['id']] = true;
                $pts = !empty($rule['pointsPerQuestion']) && (float) $rule['pointsPerQuestion'] > 0
                    ? (float) $rule['pointsPerQuestion']
                    : (float) $q['points'];
                $picked[] = ['question' => $q, 'slotPoints' => $pts];
            }
        }
    } else {
        foreach ($courseQuestions as $q) {
            if (empty($usedIds[$q['id']])) {
                $usedIds[$q['id']] = true;
                $picked[] = ['question' => $q, 'slotPoints' => (float) $q['points']];
            }
        }
    }

    $orderRng = createSeededRngPhp($studentCode . '::' . $exam['id'] . '::order');
    $ordered = $picked;
    if (!empty($exam['shuffleQuestions'])) {
        $mode = (string) ($exam['shuffleMode'] ?? 'FULL_RANDOM');
        if ($mode === 'FULL_RANDOM') {
            $ordered = seededShufflePhp($picked, $orderRng);
        } elseif ($mode === 'BY_CHAPTER') {
            $chapters = [];
            foreach ($picked as $p) {
                $ch = $p['question']['chapterCategory'];
                if (!in_array($ch, $chapters, true)) {
                    $chapters[] = $ch;
                }
            }
            $ordered = [];
            foreach ($chapters as $ch) {
                $sub = array_values(array_filter($picked, static fn ($p) => $p['question']['chapterCategory'] === $ch));
                foreach (seededShufflePhp($sub, $orderRng) as $item) {
                    $ordered[] = $item;
                }
            }
        } elseif ($mode === 'ESSAY_LAST') {
            $nonEssay = seededShufflePhp(array_values(array_filter($picked, static fn ($p) => $p['question']['type'] !== 'ESSAY')), $orderRng);
            $essay = seededShufflePhp(array_values(array_filter($picked, static fn ($p) => $p['question']['type'] === 'ESSAY')), $orderRng);
            $ordered = array_merge($nonEssay, $essay);
        }
    }

    $assigned = [];
    foreach ($ordered as $idx => $entry) {
        $q = $entry['question'];
        $vars = [];
        if (is_array($q['dynamicVars'] ?? null)) {
            $varRng = createSeededRngPhp($studentCode . '::' . $exam['id'] . '::' . $q['id'] . '::vars');
            foreach ($q['dynamicVars'] as $spec) {
                $step = ($spec['step'] ?? 1) > 0 ? (float) $spec['step'] : 1.0;
                $stepsCount = max(0, (int) floor(((float) $spec['max'] - (float) $spec['min']) / $step));
                $k = (int) floor($varRng() * ($stepsCount + 1));
                $val = (float) $spec['min'] + $k * $step;
                $vars[(string) $spec['name']] = round($val, 3);
            }
        }

        $optOrderIds = null;
        if (is_array($q['options'] ?? null) && count($q['options']) > 0) {
            $optRng = createSeededRngPhp($studentCode . '::' . $exam['id'] . '::' . $q['id'] . '::opts');
            if (!empty($exam['shuffleOptions'])) {
                $regular = [];
                $pinned = [];
                foreach ($q['options'] as $opt) {
                    $txt = (string) ($opt['text'] ?? '');
                    if (!empty($opt['pinLast']) || preg_match('/tất cả.*(trên|đều đúng)|cả [abc].*đều đúng|không có phương án nào/iu', $txt) === 1) {
                        $pinned[] = $opt;
                    } else {
                        $regular[] = $opt;
                    }
                }
                $shuffled = array_merge(seededShufflePhp($regular, $optRng), $pinned);
                $optOrderIds = array_map(static fn ($o) => (string) $o['id'], $shuffled);
            } else {
                $optOrderIds = array_map(static fn ($o) => (string) $o['id'], $q['options']);
            }
        }

        $assigned[] = [
            'questionId' => $q['id'],
            'chapterCategory' => $q['chapterCategory'],
            'orderIndex' => $idx,
            'maxPoints' => round((float) $entry['slotPoints'], 2),
            'seedVars' => $vars,
            'renderedContent' => interpolateTemplateVars((string) $q['content'], $vars),
            'optionOrderIds' => $optOrderIds,
        ];
    }

    return $assigned;
}

function finalizeAndGradeAttempt(PDO $pdo, string $attemptId, bool $forcedByRejectOrSweep = false, ?array $clientAnswers = null, ?array $clientViolations = null): array
{
    $stmt = $pdo->prepare('SELECT * FROM exam_attempts WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $attemptId]);
    $attRow = $stmt->fetch();
    if (!$attRow) {
        throw new RuntimeException('Không tìm thấy bài làm.');
    }

    $examStmt = $pdo->prepare('SELECT * FROM exams WHERE id = :id LIMIT 1');
    $examStmt->execute([':id' => $attRow['exam_id']]);
    $examRow = $examStmt->fetch();
    $exam = $examRow ? formatExamRow($examRow, false) : ['title' => 'Bài kiểm tra', 'emailDeliveryMode' => 'IMMEDIATE', 'status' => 'OPEN'];

    $assigned = decodeJsonSafe($attRow['assigned_questions_json'] ?? null, []);
    $qMap = [];
    if ($examRow) {
        $qStmt = $pdo->prepare('SELECT * FROM questions WHERE course_id = :cid');
        $qStmt->execute([':cid' => $examRow['course_id']]);
        foreach ($qStmt->fetchAll() as $qr) {
            $qMap[(string) $qr['id']] = formatQuestionRow($qr, false);
        }
    }

    // Load existing answers in DB
    $ansStmt = $pdo->prepare('SELECT * FROM attempt_answers WHERE attempt_id = :aid');
    $ansStmt->execute([':aid' => $attemptId]);
    $dbAnswers = [];
    foreach ($ansStmt->fetchAll() as $ar) {
        $dbAnswers[(string) $ar['question_id']] = $ar;
    }

    if (getDbDriver() === 'mysql') {
        $upsertAns = $pdo->prepare(
            'INSERT INTO attempt_answers (id, attempt_id, question_id, chapter_category, rendered_seed_vars, answer_payload, keystroke_telemetry, is_correct, max_points, earned_points, grading_feedback, grading_status, rubric_breakdown_json, matched_highlights_json, blocked_highlights_json, honeypot_triggered)
             VALUES (:id, :attempt_id, :question_id, :chapter_category, :rendered_seed_vars, :answer_payload, :keystroke_telemetry, :is_correct, :max_points, :earned_points, :grading_feedback, :grading_status, :rubric_breakdown_json, :matched_highlights_json, :blocked_highlights_json, :honeypot_triggered)
             ON DUPLICATE KEY UPDATE
                rendered_seed_vars = VALUES(rendered_seed_vars),
                answer_payload = VALUES(answer_payload),
                keystroke_telemetry = VALUES(keystroke_telemetry),
                is_correct = VALUES(is_correct),
                max_points = VALUES(max_points),
                earned_points = VALUES(earned_points),
                grading_feedback = VALUES(grading_feedback),
                grading_status = VALUES(grading_status),
                rubric_breakdown_json = VALUES(rubric_breakdown_json),
                matched_highlights_json = VALUES(matched_highlights_json),
                blocked_highlights_json = VALUES(blocked_highlights_json),
                honeypot_triggered = VALUES(honeypot_triggered)'
        );
    } else {
        $upsertAns = $pdo->prepare(
            'INSERT INTO attempt_answers (id, attempt_id, question_id, chapter_category, rendered_seed_vars, answer_payload, keystroke_telemetry, is_correct, max_points, earned_points, grading_feedback, grading_status, rubric_breakdown_json, matched_highlights_json, blocked_highlights_json, honeypot_triggered)
             VALUES (:id, :attempt_id, :question_id, :chapter_category, :rendered_seed_vars, :answer_payload, :keystroke_telemetry, :is_correct, :max_points, :earned_points, :grading_feedback, :grading_status, :rubric_breakdown_json, :matched_highlights_json, :blocked_highlights_json, :honeypot_triggered)
             ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                rendered_seed_vars = excluded.rendered_seed_vars,
                answer_payload = excluded.answer_payload,
                keystroke_telemetry = excluded.keystroke_telemetry,
                is_correct = excluded.is_correct,
                max_points = excluded.max_points,
                earned_points = excluded.earned_points,
                grading_feedback = excluded.grading_feedback,
                grading_status = excluded.grading_status,
                rubric_breakdown_json = excluded.rubric_breakdown_json,
                matched_highlights_json = excluded.matched_highlights_json,
                blocked_highlights_json = excluded.blocked_highlights_json,
                honeypot_triggered = excluded.honeypot_triggered'
        );
    }

    $autoScore = 0.0;
    $essayScore = 0.0;
    $maxTotal = 0.0;
    $aiHoneypot = false;
    $formattedAnswers = [];

    foreach ($assigned as $slot) {
        $qid = (string) ($slot['questionId'] ?? '');
        $maxPts = (float) ($slot['maxPoints'] ?? 1.0);
        $maxTotal += $maxPts;
        $seedVars = is_array($slot['seedVars'] ?? null) ? $slot['seedVars'] : [];
        $existingDb = $dbAnswers[$qid] ?? null;
        $clientAns = is_array($clientAnswers) && isset($clientAnswers[$qid]) ? $clientAnswers[$qid] : null;

        $payload = $clientAns['answerPayload'] ?? ($existingDb ? decodeJsonSafe($existingDb['answer_payload'] ?? null, '') : '');
        $telemetry = $clientAns['keystrokeTelemetry'] ?? ($existingDb ? decodeJsonSafe($existingDb['keystroke_telemetry'] ?? null, null) : null);

        // Respect MANUAL_OVERRIDE if instructor already overrode
        if ($existingDb && ($existingDb['grading_status'] ?? '') === 'MANUAL_OVERRIDE') {
            $earned = (float) $existingDb['earned_points'];
            $essayScore += $earned;
            $formattedAnswers[] = [
                'questionId' => $qid,
                'chapterCategory' => (string) ($slot['chapterCategory'] ?? ''),
                'isCorrect' => $existingDb['is_correct'] === null ? null : (bool) $existingDb['is_correct'],
                'maxPoints' => $maxPts,
                'earnedPoints' => $earned,
                'gradingFeedback' => (string) ($existingDb['grading_feedback'] ?? ''),
                'gradingStatus' => 'MANUAL_OVERRIDE',
                'rubricBreakdown' => decodeJsonSafe($existingDb['rubric_breakdown_json'] ?? null, null),
                'matchedHighlights' => decodeJsonSafe($existingDb['matched_highlights_json'] ?? null, null),
                'blockedHighlights' => decodeJsonSafe($existingDb['blocked_highlights_json'] ?? null, null),
                'honeypotTriggered' => (bool) ($existingDb['honeypot_triggered'] ?? false),
            ];
            continue;
        }

        $q = $qMap[$qid] ?? null;
        if ($q !== null) {
            $graded = gradeAnyQuestionPhp($q, $payload, $seedVars, $maxPts);
        } elseif ($clientAns !== null) {
            $graded = [
                'isCorrect' => $clientAns['isCorrect'] ?? false,
                'maxPoints' => $maxPts,
                'earnedPoints' => (float) ($clientAns['earnedPoints'] ?? 0),
                'gradingStatus' => (string) ($clientAns['gradingStatus'] ?? 'AUTO'),
                'gradingFeedback' => (string) ($clientAns['gradingFeedback'] ?? ''),
                'rubricBreakdown' => $clientAns['rubricBreakdown'] ?? null,
                'matchedHighlights' => $clientAns['matchedHighlights'] ?? null,
                'blockedHighlights' => $clientAns['blockedHighlights'] ?? null,
                'honeypotTriggered' => !empty($clientAns['honeypotTriggered']),
            ];
        } else {
            $graded = [
                'isCorrect' => false,
                'maxPoints' => $maxPts,
                'earnedPoints' => 0.0,
                'gradingStatus' => 'AUTO',
                'gradingFeedback' => 'Chưa trả lời',
                'honeypotTriggered' => false,
            ];
        }

        if (!empty($graded['honeypotTriggered'])) {
            $aiHoneypot = true;
        }

        if (($graded['gradingStatus'] ?? 'AUTO') === 'AUTO') {
            $autoScore += (float) $graded['earnedPoints'];
        } else {
            $essayScore += (float) $graded['earnedPoints'];
        }

        $upsertAns->execute([
            ':id' => $existingDb['id'] ?? generateId('ans'),
            ':attempt_id' => $attemptId,
            ':question_id' => $qid,
            ':chapter_category' => (string) ($slot['chapterCategory'] ?? ''),
            ':rendered_seed_vars' => json_encode($seedVars, JSON_UNESCAPED_UNICODE),
            ':answer_payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            ':keystroke_telemetry' => $telemetry ? json_encode($telemetry, JSON_UNESCAPED_UNICODE) : null,
            ':is_correct' => $graded['isCorrect'] ? 1 : 0,
            ':max_points' => $maxPts,
            ':earned_points' => (float) $graded['earnedPoints'],
            ':grading_feedback' => (string) ($graded['gradingFeedback'] ?? ''),
            ':grading_status' => (string) ($graded['gradingStatus'] ?? 'AUTO'),
            ':rubric_breakdown_json' => isset($graded['rubricBreakdown']) ? json_encode($graded['rubricBreakdown'], JSON_UNESCAPED_UNICODE) : null,
            ':matched_highlights_json' => isset($graded['matchedHighlights']) ? json_encode($graded['matchedHighlights'], JSON_UNESCAPED_UNICODE) : null,
            ':blocked_highlights_json' => isset($graded['blockedHighlights']) ? json_encode($graded['blockedHighlights'], JSON_UNESCAPED_UNICODE) : null,
            ':honeypot_triggered' => !empty($graded['honeypotTriggered']) ? 1 : 0,
        ]);

        $formattedAnswers[] = [
            'questionId' => $qid,
            'chapterCategory' => (string) ($slot['chapterCategory'] ?? ''),
            'isCorrect' => $graded['isCorrect'] ?? null,
            'maxPoints' => $maxPts,
            'earnedPoints' => (float) $graded['earnedPoints'],
            'gradingFeedback' => (string) ($graded['gradingFeedback'] ?? ''),
            'gradingStatus' => (string) ($graded['gradingStatus'] ?? 'AUTO'),
            'rubricBreakdown' => $graded['rubricBreakdown'] ?? null,
            'matchedHighlights' => $graded['matchedHighlights'] ?? null,
            'blockedHighlights' => $graded['blockedHighlights'] ?? null,
            'honeypotTriggered' => !empty($graded['honeypotTriggered']),
        ];
    }

    // Sync client-recorded violations if provided during offline-first submit
    if (is_array($clientViolations) && count($clientViolations) > 0) {
        $chkV = $pdo->prepare('SELECT COUNT(*) FROM violation_logs WHERE id = :id');
        $insV = $pdo->prepare('INSERT INTO violation_logs (id, attempt_id, severity, event_type, duration_seconds, detail, occurred_at) VALUES (:id, :aid, :sev, :et, :dur, :det, :occ)');
        foreach ($clientViolations as $v) {
            $vid = (string) ($v['id'] ?? generateId('vio'));
            $chkV->execute([':id' => $vid]);
            if ((int) $chkV->fetchColumn() === 0) {
                $insV->execute([
                    ':id' => $vid,
                    ':aid' => $attemptId,
                    ':sev' => (string) ($v['severity'] ?? 'MAJOR_LEAVE'),
                    ':et' => (string) ($v['eventType'] ?? 'CLIENT_SYNC'),
                    ':dur' => (int) ($v['durationSeconds'] ?? 0),
                    ':det' => (string) ($v['detail'] ?? ''),
                    ':occ' => (string) ($v['occurredAt'] ?? nowIso()),
                ]);
            }
        }
    }

    $autoScore = round($autoScore, 2);
    $essayScore = round($essayScore, 2);
    $totalScore = round($autoScore + $essayScore, 2);
    $maxTotal = max(0.01, round($maxTotal, 2));
    $scale10 = round(($totalScore / $maxTotal) * 10, 2);
    $now = nowIso();
    $status = $forcedByRejectOrSweep ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    $isDelayed = ($exam['emailDeliveryMode'] ?? 'IMMEDIATE') === 'DELAYED_BATCH' && ($exam['status'] ?? 'OPEN') !== 'CLOSED';
    $emailStatus = $isDelayed ? 'RECEIPT_SENT' : 'SENT';

    $updAtt = $pdo->prepare(
        'UPDATE exam_attempts SET status=:st, locked_at=NULL, auto_score=:as, essay_score=:es, total_score=:ts, max_total_score=:mts, scale10_score=:s10, ai_flag=CASE WHEN ai_flag=1 OR :hp=1 THEN 1 ELSE 0 END, email_sent_status=:ess, email_sent_at=:esa, submitted_at=COALESCE(submitted_at, :sub) WHERE id=:id'
    );
    $updAtt->execute([
        ':st' => $status,
        ':as' => $autoScore,
        ':es' => $essayScore,
        ':ts' => $totalScore,
        ':mts' => $maxTotal,
        ':s10' => $scale10,
        ':hp' => $aiHoneypot ? 1 : 0,
        ':ess' => $emailStatus,
        ':esa' => $now,
        ':sub' => $now,
        ':id' => $attemptId,
    ]);

    $fresh = $pdo->prepare('SELECT * FROM exam_attempts WHERE id = :id LIMIT 1');
    $fresh->execute([':id' => $attemptId]);
    $finalRow = $fresh->fetch();

    return [
        'attempt' => [
            'id' => $finalRow['id'],
            'examId' => $finalRow['exam_id'],
            'studentCode' => $finalRow['student_code'],
            'studentName' => $finalRow['student_name'],
            'studentEmail' => $finalRow['student_email'],
            'className' => $finalRow['class_name'],
            'status' => $finalRow['status'],
            'autoScore' => (float) $finalRow['auto_score'],
            'essayScore' => (float) $finalRow['essay_score'],
            'totalScore' => (float) $finalRow['total_score'],
            'maxTotalScore' => (float) $finalRow['max_total_score'],
            'scale10Score' => (float) $finalRow['scale10_score'],
            'integrityScore' => (int) $finalRow['integrity_score'],
            'submittedAt' => $finalRow['submitted_at'],
            'emailSentStatus' => $finalRow['email_sent_status'],
        ],
        'exam' => $exam,
        'answers' => $formattedAnswers,
        'isDelayed' => $isDelayed,
    ];
}

function formatAttemptAnswerRowPhp(array $a, bool $includeGrading = true): array
{
    $rsv = decodeJsonSafe($a['rendered_seed_vars'] ?? null, []);
    $kt = decodeJsonSafe($a['keystroke_telemetry'] ?? null, null);
    $entry = [
        'questionId' => $a['question_id'],
        'chapterCategory' => (string) ($a['chapter_category'] ?? ''),
        'renderedSeedVars' => (is_array($rsv) && count($rsv) > 0) ? $rsv : new stdClass(),
        'answerPayload' => decodeJsonSafe($a['answer_payload'] ?? null, ''),
        'isCorrect' => $includeGrading ? ($a['is_correct'] === null ? null : (bool) $a['is_correct']) : null,
        'maxPoints' => (float) $a['max_points'],
        'earnedPoints' => $includeGrading ? (float) $a['earned_points'] : 0.0,
        'gradingFeedback' => $includeGrading ? ($a['grading_feedback'] ?? '') : '',
        'gradingStatus' => $includeGrading ? (string) ($a['grading_status'] ?: 'AUTO') : 'AUTO',
        'honeypotTriggered' => $includeGrading ? (bool) ($a['honeypot_triggered'] ?? false) : false,
    ];
    if ($kt !== null) {
        $entry['keystrokeTelemetry'] = $kt;
    }
    if ($includeGrading) {
        $rb = decodeJsonSafe($a['rubric_breakdown_json'] ?? null, null);
        $mh = decodeJsonSafe($a['matched_highlights_json'] ?? null, null);
        $bh = decodeJsonSafe($a['blocked_highlights_json'] ?? null, null);
        if ($rb !== null) {
            $entry['rubricBreakdown'] = $rb;
        }
        if ($mh !== null) {
            $entry['matchedHighlights'] = $mh;
        }
        if ($bh !== null) {
            $entry['blockedHighlights'] = $bh;
        }
    }
    return $entry;
}

/**
 * Batch-load attempt_answers for many attempts in 200-ID chunks (eliminates N+1 queries).
 * Returns [attemptId => [questionId => formattedAnswer]].
 */
function fetchAttemptAnswersBatchPhp(PDO $pdo, array $attemptIds, bool $includeGrading = true): array
{
    $grouped = [];
    if (count($attemptIds) === 0) {
        return $grouped;
    }
    foreach (array_chunk(array_values(array_unique($attemptIds)), 200) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = $pdo->prepare("SELECT * FROM attempt_answers WHERE attempt_id IN ($ph)");
        $stmt->execute($chunk);
        foreach ($stmt->fetchAll() as $a) {
            $aid = (string) $a['attempt_id'];
            $grouped[$aid][(string) $a['question_id']] = formatAttemptAnswerRowPhp($a, $includeGrading);
        }
    }
    return $grouped;
}

/**
 * Hydrate attempt_answers keyed by questionId so proctor/resume endpoints share one mapper.
 */
function fetchAttemptAnswersMapPhp(PDO $pdo, string $attemptId, bool $includeGrading = true): array
{
    $batch = fetchAttemptAnswersBatchPhp($pdo, [$attemptId], $includeGrading);
    return $batch[$attemptId] ?? [];
}

function normalizeRosterTextPhp(string $val): string
{
    $collapsed = trim(preg_replace('/\s+/u', ' ', $val) ?? $val);
    return function_exists('mb_strtolower') ? mb_strtolower($collapsed, 'UTF-8') : strtolower($collapsed);
}

function normalizeRosterDobPhp(string $val): string
{
    $s = trim($val);
    if ($s === '') {
        return '';
    }
    if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/', $s, $m)) {
        return sprintf('%02d-%02d-%04d', (int) $m[1], (int) $m[2], (int) $m[3]);
    }
    if (preg_match('/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/', $s, $m)) {
        return sprintf('%02d-%02d-%04d', (int) $m[3], (int) $m[2], (int) $m[1]);
    }
    return normalizeRosterTextPhp($s);
}

function appendLoginDevicePhp(?string $rawJson, string $deviceToken, string $deviceLabel, ?float $lat, ?float $lng): array
{
    $list = decodeJsonSafe($rawJson, []);
    if (!is_array($list)) {
        $list = [];
    }
    $cleanLabel = $deviceLabel !== '' ? $deviceLabel : 'Trình duyệt không xác định';
    $found = false;
    foreach ($list as &$item) {
        if (($item['deviceToken'] ?? '') === $deviceToken && ($item['deviceLabel'] ?? '') === $cleanLabel) {
            $item['at'] = nowIso();
            if ($lat !== null && $lng !== null) {
                $item['lat'] = $lat;
                $item['lng'] = $lng;
            }
            $found = true;
            break;
        }
    }
    unset($item);
    if (!$found) {
        $list[] = [
            'deviceToken' => $deviceToken,
            'deviceLabel' => $cleanLabel,
            'lat' => $lat,
            'lng' => $lng,
            'at' => nowIso(),
        ];
    }
    return $list;
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $pdo = getDb();
    $action = $_GET['action'] ?? '';
    $body = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' ? [] : readJsonBody();

    if ($action === 'start') {
        try {
        $pin = strtoupper(trim((string) ($body['pin'] ?? '')));
        $examIdParam = trim((string) ($body['examId'] ?? ''));
        $studentCode = strtoupper(trim((string) ($body['studentCode'] ?? '')));
        $lastName = trim((string) ($body['lastName'] ?? ''));
        $firstName = trim((string) ($body['firstName'] ?? ''));
        $gender = trim((string) ($body['gender'] ?? ''));
        $dob = trim((string) ($body['dob'] ?? ''));
        $studentName = trim((string) ($body['studentName'] ?? ''));
        if ($studentName === '' && ($lastName !== '' || $firstName !== '')) {
            $studentName = trim($lastName . ' ' . $firstName);
        }
        $studentEmail = strtolower(trim((string) ($body['studentEmail'] ?? '')));
        $className = trim((string) ($body['className'] ?? ''));
        $deviceToken = trim((string) ($body['deviceToken'] ?? generateId('dev')));
        $deviceLabel = trim((string) ($body['deviceLabel'] ?? ''));
        $locationLat = isset($body['locationLat']) && is_numeric($body['locationLat']) ? (float) $body['locationLat'] : null;
        $locationLng = isset($body['locationLng']) && is_numeric($body['locationLng']) ? (float) $body['locationLng'] : null;
        $locationAccuracy = isset($body['locationAccuracy']) && is_numeric($body['locationAccuracy']) ? (float) $body['locationAccuracy'] : null;

        if ($studentCode === '' || $studentEmail === '') {
            jsonError('Thiếu MSSV hoặc Email sinh viên.', 400);
        }

        $examRow = null;
        if ($examIdParam !== '') {
            $stmtE = $pdo->prepare('SELECT * FROM exams WHERE id = :id LIMIT 1');
            $stmtE->execute([':id' => $examIdParam]);
            $examRow = $stmtE->fetch() ?: null;
        }
        if (!$examRow && $pin !== '') {
            $stmtE = $pdo->prepare('SELECT * FROM exams WHERE UPPER(room_pin) = :pin LIMIT 1');
            $stmtE->execute([':pin' => $pin]);
            $examRow = $stmtE->fetch() ?: null;
        }

        // If frontend hybrid sent an ID of an exam not yet synced to DB, allow sync fallback? Reject if invalid PIN on server mode.
        if (!$examRow) {
            if ($pin !== '') {
                jsonError('Không tìm thấy phòng thi với mã PIN này.', 404);
            }
            jsonResponse(['ok' => true, 'synced' => false, 'reason' => 'exam_not_in_server_db']);
        }

        $exam = formatExamRow($examRow, false);
        if ($exam['status'] !== 'OPEN') {
            jsonError('Phòng thi hiện không ở trạng thái MỞ.', 403);
        }

        $whitelist = array_map(static fn ($s) => strtoupper(trim((string) $s)), $exam['rosterWhitelist'] ?? []);
        if (count($whitelist) > 0 && !in_array($studentCode, $whitelist, true)) {
            jsonError("MSSV $studentCode không có tên trong danh sách ca thi này.", 403);
        }

        $rosterEntries = is_array($exam['rosterEntries'] ?? null) ? $exam['rosterEntries'] : [];
        if (count($rosterEntries) > 0) {
            $matchedRoster = null;
            foreach ($rosterEntries as $entry) {
                if (strtoupper(trim((string) ($entry['studentCode'] ?? ''))) === $studentCode) {
                    $matchedRoster = $entry;
                    break;
                }
            }
            if (!$matchedRoster) {
                jsonError("MSSV $studentCode không có tên trong danh sách sinh viên được phép thi ca này.", 403);
            }
            $mismatches = [];
            if (normalizeRosterTextPhp($lastName) !== normalizeRosterTextPhp((string) ($matchedRoster['lastName'] ?? ''))) {
                $mismatches[] = 'Họ đệm';
            }
            if (normalizeRosterTextPhp($firstName) !== normalizeRosterTextPhp((string) ($matchedRoster['firstName'] ?? ''))) {
                $mismatches[] = 'Tên';
            }
            if (normalizeRosterTextPhp($gender) !== normalizeRosterTextPhp((string) ($matchedRoster['gender'] ?? ''))) {
                $mismatches[] = 'Giới tính';
            }
            if (normalizeRosterDobPhp($dob) !== normalizeRosterDobPhp((string) ($matchedRoster['dob'] ?? ''))) {
                $mismatches[] = 'Ngày sinh';
            }
            if (count($mismatches) > 0) {
                jsonError('Thông tin sinh viên không khớp với danh sách ca thi (kiểm tra lại: ' . implode(', ', $mismatches) . ').', 403);
            }
        }

        $existingStmt = $pdo->prepare('SELECT * FROM exam_attempts WHERE exam_id = :eid AND UPPER(student_code) = :sc LIMIT 1');
        $existingStmt->execute([':eid' => $exam['id'], ':sc' => $studentCode]);
        $existing = $existingStmt->fetch();

        if ($existing) {
            if (in_array($existing['status'], ['SUBMITTED', 'AUTO_SUBMITTED'], true)) {
                $ansMap = fetchAttemptAnswersMapPhp($pdo, $existing['id'], true);
                jsonResponse([
                    'ok' => true,
                    'resumed' => true,
                    'alreadySubmitted' => true,
                    'attemptId' => $existing['id'],
                    'examId' => $exam['id'],
                    'exam' => formatExamRow($examRow, true),
                    'attempt' => [
                        'id' => $existing['id'],
                        'examId' => $existing['exam_id'],
                        'studentCode' => $existing['student_code'],
                        'studentName' => $existing['student_name'],
                        'studentEmail' => $existing['student_email'],
                        'className' => $existing['class_name'],
                        'deviceToken' => $existing['device_token'] ?? '',
                        'assignedQuestions' => decodeJsonSafe($existing['assigned_questions_json'] ?? null, []),
                        'answers' => count($ansMap) > 0 ? $ansMap : new stdClass(),
                        'status' => $existing['status'],
                        'currentQuestionIndex' => (int) $existing['current_question_index'],
                        'flaggedQuestionIds' => decodeJsonSafe($existing['flagged_question_ids_json'] ?? null, []),
                        'leaveCount' => (int) $existing['leave_count'],
                        'extraLeaveAllowance' => (int) $existing['extra_leave_allowance'],
                        'minorBlurCount' => (int) $existing['minor_blur_count'],
                        'totalAwaySeconds' => (int) $existing['total_away_seconds'],
                        'lockedWaitSeconds' => (int) $existing['locked_wait_seconds'],
                        'bonusSeconds' => (int) $existing['bonus_seconds'],
                        'integrityScore' => (int) $existing['integrity_score'],
                        'aiFlag' => (bool) $existing['ai_flag'],
                        'aiFlagReason' => $existing['ai_flag_reason'] ?: null,
                        'autoScore' => (float) $existing['auto_score'],
                        'essayScore' => (float) $existing['essay_score'],
                        'totalScore' => (float) $existing['total_score'],
                        'maxTotalScore' => (float) $existing['max_total_score'],
                        'scale10Score' => (float) $existing['scale10_score'],
                        'emailSentStatus' => $existing['email_sent_status'],
                        'emailSentAt' => $existing['email_sent_at'] ?: null,
                        'emailEditCount' => (int) ($existing['email_edit_count'] ?? 0),
                        'startedAt' => $existing['started_at'],
                        'submittedAt' => $existing['submitted_at'] ?: null,
                    ],
                ]);
            }
            $updatedDevices = appendLoginDevicePhp(
                $existing['login_devices_json'] ?? null,
                $deviceToken,
                $deviceLabel,
                $locationLat,
                $locationLng
            );
            $updatedDevicesJson = json_encode($updatedDevices, JSON_UNESCAPED_UNICODE);

            if ((string) $existing['device_token'] !== '' && $existing['device_token'] !== $deviceToken) {
                $pdo->prepare('UPDATE exam_attempts SET login_devices_json = :ld, ai_flag = 1, ai_flag_reason = :reason WHERE id = :id')
                    ->execute([
                        ':ld' => $updatedDevicesJson,
                        ':reason' => 'Phát hiện đăng nhập trên nhiều thiết bị / trình duyệt (' . count($updatedDevices) . ')',
                        ':id' => $existing['id'],
                    ]);
                $pdo->prepare('INSERT INTO violation_logs (id, attempt_id, severity, event_type, duration_seconds, detail, occurred_at) VALUES (:id, :aid, :sev, :et, 0, :det, :occ)')
                    ->execute([
                        ':id' => generateId('vio'),
                        ':aid' => $existing['id'],
                        ':sev' => 'DUPLICATE_DEVICE',
                        ':et' => 'SECOND_DEVICE_LOGIN',
                        ':det' => 'Phát hiện đăng nhập từ thiết bị/trình duyệt khác (' . ($deviceLabel ?: 'Không rõ') . ') trong khi bài thi đang diễn ra.',
                        ':occ' => nowIso(),
                    ]);
                jsonError('Tài khoản đang thi trên một thiết bị hoặc trình duyệt khác. Liên hệ giám thị để reset thiết bị.', 409);
            }

            // Resume existing attempt (update device/location tracking)
            $resumeSql = 'UPDATE exam_attempts SET login_devices_json = :ld';
            $resumeParams = [':ld' => $updatedDevicesJson, ':id' => $existing['id']];
            if ($existing['device_token'] === '') {
                $resumeSql .= ', device_token = :dt, device_label = :dl';
                $resumeParams[':dt'] = $deviceToken;
                $resumeParams[':dl'] = $deviceLabel;
            }
            if ($locationLat !== null && $locationLng !== null) {
                $resumeSql .= ', location_lat = COALESCE(location_lat, :lat), location_lng = COALESCE(location_lng, :lng), location_accuracy = COALESCE(location_accuracy, :acc)';
                $resumeParams[':lat'] = $locationLat;
                $resumeParams[':lng'] = $locationLng;
                $resumeParams[':acc'] = $locationAccuracy;
            }
            if (count($updatedDevices) > 1) {
                $resumeSql .= ', ai_flag = 1, ai_flag_reason = :reason';
                $resumeParams[':reason'] = 'Phát hiện đăng nhập trên nhiều thiết bị / trình duyệt (' . count($updatedDevices) . ')';
            }
            $resumeSql .= ' WHERE id = :id';
            $pdo->prepare($resumeSql)->execute($resumeParams);
            $assigned = decodeJsonSafe($existing['assigned_questions_json'], []);
            $ansMap = fetchAttemptAnswersMapPhp($pdo, $existing['id'], false);
            jsonResponse([
                'ok' => true,
                'resumed' => true,
                'attemptId' => $existing['id'],
                'exam' => formatExamRow($examRow, true),
                'assignedQuestions' => $assigned,
                'answers' => count($ansMap) > 0 ? $ansMap : new stdClass(),
                'status' => $existing['status'],
                'currentQuestionIndex' => (int) $existing['current_question_index'],
                'flaggedQuestionIds' => decodeJsonSafe($existing['flagged_question_ids_json'] ?? null, []),
                'leaveCount' => (int) $existing['leave_count'],
                'extraLeaveAllowance' => (int) $existing['extra_leave_allowance'],
                'minorBlurCount' => (int) $existing['minor_blur_count'],
                'totalAwaySeconds' => (int) $existing['total_away_seconds'],
                'lockedAt' => $existing['locked_at'] ?: null,
                'lockedWaitSeconds' => (int) $existing['locked_wait_seconds'],
                'bonusSeconds' => (int) $existing['bonus_seconds'],
                'unlockRequestNote' => $existing['unlock_request_note'] ?: null,
                'integrityScore' => (int) $existing['integrity_score'],
                'startedAt' => $existing['started_at'],
            ]);
        }

        $qRows = $pdo->prepare('SELECT * FROM questions WHERE course_id = :cid');
        $qRows->execute([':cid' => $exam['courseId']]);
        $courseQuestions = array_map(static fn ($qr) => formatQuestionRow($qr, false), $qRows->fetchAll());

        // Prefer client assignedQuestions if hybrid synced, otherwise compute deterministically on server
        $assigned = !empty($body['assignedQuestions']) && is_array($body['assignedQuestions'])
            ? $body['assignedQuestions']
            : buildAssignedQuestionsPhp($exam, $courseQuestions, $studentCode);

        $maxTotal = 0.0;
        foreach ($assigned as $aSlot) {
            $maxTotal += (float) ($aSlot['maxPoints'] ?? 0);
        }
        $attemptId = trim((string) ($body['id'] ?? '')) ?: generateId('att');
        $startedAt = trim((string) ($body['startedAt'] ?? '')) ?: nowIso();

        $initialDevices = appendLoginDevicePhp(null, $deviceToken, $deviceLabel, $locationLat, $locationLng);
        $ins = $pdo->prepare(
            'INSERT INTO exam_attempts (id, exam_id, student_code, student_name, student_email, class_name, device_token, device_label, location_lat, location_lng, location_accuracy, login_devices_json, assigned_questions_json, flagged_question_ids_json, status, max_total_score, started_at)
             VALUES (:id, :exam_id, :student_code, :student_name, :student_email, :class_name, :device_token, :device_label, :location_lat, :location_lng, :location_accuracy, :login_devices_json, :assigned_json, :flagged_json, :status, :max_total, :started_at)'
        );
        $ins->execute([
            ':id' => $attemptId,
            ':exam_id' => $exam['id'],
            ':student_code' => $studentCode,
            ':student_name' => $studentName ?: $studentCode,
            ':student_email' => $studentEmail,
            ':class_name' => $className,
            ':device_token' => $deviceToken,
            ':device_label' => $deviceLabel,
            ':location_lat' => $locationLat,
            ':location_lng' => $locationLng,
            ':location_accuracy' => $locationAccuracy,
            ':login_devices_json' => json_encode($initialDevices, JSON_UNESCAPED_UNICODE),
            ':assigned_json' => json_encode($assigned, JSON_UNESCAPED_UNICODE),
            ':flagged_json' => json_encode([], JSON_UNESCAPED_UNICODE),
            ':status' => 'IN_PROGRESS',
            ':max_total' => round($maxTotal, 2),
            ':started_at' => $startedAt,
        ]);

        jsonResponse([
            'ok' => true,
            'resumed' => false,
            'attemptId' => $attemptId,
            'exam' => formatExamRow($examRow, true),
            'assignedQuestions' => $assigned,
            'startedAt' => $startedAt,
        ]);
        } catch (Throwable $e) {
            error_log('[VNE_ATTEMPT_START_ERR] ' . $e->getMessage());
            jsonError('Lỗi khởi tạo bài thi: ' . $e->getMessage(), 500);
        }
    }

    if ($action === 'heartbeat') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }
        if (isset($body['currentQuestionIndex'])) {
            $pdo->prepare('UPDATE exam_attempts SET current_question_index = :idx WHERE id = :id')
                ->execute([':idx' => (int) $body['currentQuestionIndex'], ':id' => $attemptId]);
        }
        if (isset($body['questionId'])) {
            $qid = (string) $body['questionId'];
            $payload = json_encode($body['answerPayload'] ?? '', JSON_UNESCAPED_UNICODE);
            $tel = isset($body['keystrokeTelemetry']) ? json_encode($body['keystrokeTelemetry'], JSON_UNESCAPED_UNICODE) : null;
            $seedVars = isset($body['renderedSeedVars']) ? json_encode($body['renderedSeedVars'], JSON_UNESCAPED_UNICODE) : '{}';
            $chk = $pdo->prepare('SELECT id FROM attempt_answers WHERE attempt_id=:aid AND question_id=:qid LIMIT 1');
            $chk->execute([':aid' => $attemptId, ':qid' => $qid]);
            $exist = $chk->fetch();
            if ($exist) {
                $pdo->prepare('UPDATE attempt_answers SET answer_payload=:ap, keystroke_telemetry=:kt WHERE id=:id')
                    ->execute([':ap' => $payload, ':kt' => $tel, ':id' => $exist['id']]);
            } else {
                $pdo->prepare('INSERT INTO attempt_answers (id, attempt_id, question_id, chapter_category, rendered_seed_vars, answer_payload, keystroke_telemetry, max_points) VALUES (:id, :aid, :qid, :ch, :sv, :ap, :kt, :mp)')
                    ->execute([
                        ':id' => generateId('ans'),
                        ':aid' => $attemptId,
                        ':qid' => $qid,
                        ':ch' => (string) ($body['chapterCategory'] ?? ''),
                        ':sv' => $seedVars,
                        ':ap' => $payload,
                        ':kt' => $tel,
                        ':mp' => (float) ($body['maxPoints'] ?? 1.0),
                    ]);
            }
        }
        jsonResponse(['ok' => true, 'savedAt' => nowIso()]);
    }

    if ($action === 'submit') {
        $attemptId = trim((string) ($body['attemptId'] ?? ($body['id'] ?? '')));
        if ($attemptId === '') {
            jsonError('Thiếu attemptId.', 400);
        }

        // Ensure attempt exists if submitted from hybrid offline client directly
        $chk = $pdo->prepare('SELECT status, email_sent_status FROM exam_attempts WHERE id = :id LIMIT 1');
        $chk->execute([':id' => $attemptId]);
        $existingAtt = $chk->fetch();
        $alreadySentEmail = $existingAtt && in_array($existingAtt['email_sent_status'] ?? '', ['SENT', 'RECEIPT_SENT'], true);
        if (!$existingAtt && !empty($body['examId'])) {
            $pdo->prepare(
                'INSERT INTO exam_attempts (id, exam_id, student_code, student_name, student_email, class_name, device_token, assigned_questions_json, status, leave_count, minor_blur_count, total_away_seconds, integrity_score, max_total_score, started_at)
                 VALUES (:id, :eid, :sc, :sn, :se, :cn, :dt, :aq, :st, :lc, :mb, :tas, :intg, :mts, :sa)'
            )->execute([
                ':id' => $attemptId,
                ':eid' => (string) $body['examId'],
                ':sc' => (string) ($body['studentCode'] ?? 'SV'),
                ':sn' => (string) ($body['studentName'] ?? 'Sinh viên'),
                ':se' => (string) ($body['studentEmail'] ?? ''),
                ':cn' => (string) ($body['className'] ?? ''),
                ':dt' => (string) ($body['deviceToken'] ?? ''),
                ':aq' => json_encode($body['assignedQuestions'] ?? [], JSON_UNESCAPED_UNICODE),
                ':st' => 'IN_PROGRESS',
                ':lc' => (int) ($body['leaveCount'] ?? 0),
                ':mb' => (int) ($body['minorBlurCount'] ?? 0),
                ':tas' => (int) ($body['totalAwaySeconds'] ?? 0),
                ':intg' => (int) ($body['integrityScore'] ?? 100),
                ':mts' => (float) ($body['maxTotalScore'] ?? 10),
                ':sa' => (string) ($body['startedAt'] ?? nowIso()),
            ]);
        }

        $result = finalizeAndGradeAttempt(
            $pdo,
            $attemptId,
            !empty($body['forcedByRejectOrSweep']) || ($body['status'] ?? '') === 'AUTO_SUBMITTED',
            is_array($body['answers'] ?? null) ? $body['answers'] : null,
            is_array($body['violations'] ?? null) ? $body['violations'] : null
        );

        // Return immediate HTTP response to student, then flush SMTP email cleanly if FastCGI supports it
        $payloadOut = json_encode(
            ['ok' => true, 'result' => $result['attempt'], 'answers' => $result['answers']],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        header('Content-Type: application/json; charset=utf-8');
        echo $payloadOut;

        $recipient = (string) ($result['attempt']['studentEmail'] ?? '');
        if (!$alreadySentEmail && $recipient !== '' && filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            runAfterResponse(static function () use ($pdo, $result, $recipient): void {
                $examTitle = (string) ($result['exam']['title'] ?? 'Bài thi');
                if ($result['isDelayed']) {
                    $subj = '[VNEconomics] Biên nhận nộp bài: ' . $examTitle;
                    $html = '<p>Hệ thống đã thu bài thành công cho <strong>' . htmlspecialchars((string) $result['attempt']['studentName'], ENT_QUOTES, 'UTF-8') . '</strong> lúc ' . nowIso() . '. Điểm chi tiết sẽ gửi sau khi kết thúc ca thi.</p>';
                    enqueueAndSendEmail($pdo, $recipient, $subj, $html, 'STUDENT_RECEIPT', 'Biên nhận thu bài ' . $result['attempt']['studentCode'], null, null, true);
                } else {
                    $subj = '[VNEconomics] Kết quả bài thi: ' . $examTitle;
                    $html = buildStudentScoreEmailHtml($result['exam'], $result['attempt'], $result['answers']);
                    $summary = 'Điểm hệ 10: ' . $result['attempt']['scale10Score'] . '/10 (' . $result['attempt']['totalScore'] . '/' . $result['attempt']['maxTotalScore'] . 'đ)';
                    enqueueAndSendEmail($pdo, $recipient, $subj, $html, 'STUDENT_SCORE', $summary, null, null, true);
                }
            });
        }
        exit;
    }

    if ($action === 'correct_email') {
        $attemptId = trim((string) ($body['attemptId'] ?? ''));
        $newEmail = strtolower(trim((string) ($body['newEmail'] ?? '')));
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            jsonError('Địa chỉ email mới không hợp lệ.', 400);
        }

        $stmt = $pdo->prepare('SELECT * FROM exam_attempts WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $attemptId]);
        $att = $stmt->fetch();
        if (!$att) {
            jsonError('Không tìm thấy bài thi.', 404);
        }
        if ((int) ($att['email_edit_count'] ?? 0) >= 1) {
            jsonError('Mỗi bài thi chỉ được phép đính chính email tối đa 1 lần.', 409);
        }
        if (!empty($att['submitted_at'])) {
            $elapsed = time() - strtotime((string) $att['submitted_at']);
            if ($elapsed > 300) {
                jsonError('Đã quá cửa sổ 5 phút đính chính email sau khi nộp bài.', 403);
            }
        }

        $pdo->prepare('UPDATE exam_attempts SET student_email = :email, email_edit_count = email_edit_count + 1 WHERE id = :id')
            ->execute([':email' => $newEmail, ':id' => $attemptId]);

        $res = finalizeAndGradeAttempt($pdo, $attemptId, ($att['status'] ?? '') === 'AUTO_SUBMITTED');
        $subj = '[VNEconomics] (Gửi lại) Kết quả bài thi: ' . ($res['exam']['title'] ?? '');
        $html = buildStudentScoreEmailHtml($res['exam'], $res['attempt'], $res['answers']);
        enqueueAndSendEmail($pdo, $newEmail, $subj, $html, 'STUDENT_SCORE', 'Gửi lại sau đính chính email', null, null, true);

        jsonResponse(['ok' => true, 'email' => $newEmail]);
    }

    if ($action === 'sweep') {
        requireAdminAuth();
        $examId = trim((string) ($body['examId'] ?? ''));
        $examStmt = $pdo->prepare('SELECT * FROM exams WHERE id = :id LIMIT 1');
        $examStmt->execute([':id' => $examId]);
        $examRow = $examStmt->fetch();
        if (!$examRow) {
            jsonError('Không tìm thấy kỳ thi.', 404);
        }

        $pdo->prepare("UPDATE exams SET status = 'CLOSED' WHERE id = :id")->execute([':id' => $examId]);
        $openStmt = $pdo->prepare("SELECT id FROM exam_attempts WHERE exam_id = :eid AND status IN ('IN_PROGRESS', 'PAUSED', 'LOCKED')");
        $openStmt->execute([':eid' => $examId]);
        $openIds = $openStmt->fetchAll(PDO::FETCH_COLUMN);

        $emailPayloads = [];
        foreach ($openIds as $aid) {
            $res = finalizeAndGradeAttempt($pdo, (string) $aid, true);
            $email = (string) ($res['attempt']['studentEmail'] ?? '');
            if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $emailPayloads[] = [
                    'email' => $email,
                    'subject' => '[VNEconomics] Kết quả bài thi: ' . ($res['exam']['title'] ?? ''),
                    'html' => buildStudentScoreEmailHtml($res['exam'], $res['attempt'], $res['answers']),
                ];
            }
        }

        // Send aggregate CSV report payload prep
        $allAttStmt = $pdo->prepare('SELECT * FROM exam_attempts WHERE exam_id = :eid ORDER BY student_code ASC');
        $allAttStmt->execute([':eid' => $examId]);
        $allAttempts = $allAttStmt->fetchAll();

        $instEmail = trim((string) ($examRow['instructor_email'] ?? ''));

        // Flush HTTP response immediately before slow batch SMTP sending (prevents 504 timeout at 300+ students)
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'ok' => true,
            'sweptCount' => count($openIds),
            'totalAttempts' => count($allAttempts),
            'queuedEmails' => count($emailPayloads),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            @ob_flush();
            @flush();
        }

        @ignore_user_abort(true);
        @set_time_limit(0);

        foreach ($emailPayloads as $ep) {
            enqueueAndSendEmail($pdo, $ep['email'], $ep['subject'], $ep['html'], 'STUDENT_SCORE', 'Thu bài tự động (Sweeper)', null, null, true);
        }

        if ($instEmail !== '' && filter_var($instEmail, FILTER_VALIDATE_EMAIL)) {
            $csv = buildInstructorCsvAttachment($examRow, $allAttempts);
            $csvFile = 'bao_cao_' . preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $examRow['room_pin']) . '_' . date('Ymd_Hi') . '.csv';
            $html = '<h3>Báo cáo tổng hợp kết quả ca thi: ' . htmlspecialchars((string) $examRow['title'], ENT_QUOTES, 'UTF-8') . '</h3>'
                . '<p>Tổng số thí sinh đã ghi nhận: <strong>' . count($allAttempts) . '</strong>. Đính kèm file CSV chuẩn UTF-8 BOM mở trực tiếp trong Excel.</p>';
            $reportResult = enqueueAndSendEmail(
                $pdo,
                $instEmail,
                '[VNEconomics] Báo cáo tổng hợp & CSV ca thi: ' . $examRow['title'],
                $html,
                'INSTRUCTOR_REPORT',
                'Tổng hợp ' . count($allAttempts) . ' thí sinh (' . count($openIds) . ' bài sweep)',
                $csv,
                $csvFile,
                true
            );
            $pdo->prepare("UPDATE exams SET report_sent_status = :rs, report_sent_at = :ra WHERE id = :id")
                ->execute([
                    ':rs' => ($reportResult['status'] === 'SENT' ? 'SENT' : 'FAILED'),
                    ':ra' => nowIso(),
                    ':id' => $examId,
                ]);
        }
        exit;
    }

    jsonError('Action attempts không hợp lệ.', 400);
}
