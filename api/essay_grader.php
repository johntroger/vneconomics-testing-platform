<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Deterministic Rubric & Question Grading Engine (< 1ms CPU, Zero AI)
 * Shared by attempts.php (submission grading) and direct ?action=test (Live Rubric Tester).
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';

function normalizeVietnameseEssay(string $raw): string
{
    $text = $raw;
    if (class_exists('Normalizer')) {
        $norm = Normalizer::normalize($text, Normalizer::FORM_C);
        if (is_string($norm)) {
            $text = $norm;
        }
    }

    $text = function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);

    // Unify legacy vs modern Vietnamese tone mark positions
    $text = strtr($text, [
        'oà' => 'òa', 'oá' => 'óa', 'oả' => 'ỏa', 'oã' => 'õa', 'oạ' => 'ọa',
        'uý' => 'úy', 'uỳ' => 'ùy', 'uỷ' => 'ủy', 'uỹ' => 'ũy', 'uỵ' => 'ụy',
    ]);

    // Normalize logic arrows, decimals, and quotes
    $text = preg_replace('/(-->|==>|=>|➔|⇒|→)/u', ' -> ', $text) ?? $text;
    $text = preg_replace('/(\d),(\d)/u', '$1.$2', $text) ?? $text;
    $text = preg_replace('/[“”"\'`]/u', '', $text) ?? $text;
    $text = preg_replace('/\s+/u', ' ', $text) ?? $text;

    return trim($text);
}

function interpolateTemplateVars(string $text, array $seedVars): string
{
    return preg_replace_callback('/\{([a-zA-Z0-9_]+)\}/', static function (array $m) use ($seedVars): string {
        $key = $m[1];
        return array_key_exists($key, $seedVars) ? (string) $seedVars[$key] : $m[0];
    }, $text) ?? $text;
}

function splitEssayClauses(string $normalizedText): array
{
    $parts = preg_split('/(?:->|\.|;|,|\/|\bnên\b|\bdo đó\b|\bvì vậy\b|\bsuy ra\b|\bdẫn đến\b|\blàm cho\b|\bkhiến\b)/u', $normalizedText);
    if (!is_array($parts)) {
        return [$normalizedText];
    }
    $clean = [];
    foreach ($parts as $p) {
        $t = trim($p);
        if ($t !== '') {
            $clean[] = $t;
        }
    }
    return $clean;
}

function hasNegationConflictPhp(string $clause, string $phrase): bool
{
    $negations = ['không', 'chẳng', 'chưa', 'không phải', 'ngược lại', 'phi'];
    $normPhrase = normalizeVietnameseEssay($phrase);
    if ($normPhrase === '') {
        return false;
    }

    foreach ($negations as $neg) {
        if (str_contains($normPhrase, $neg)) {
            return false;
        }
    }

    $pos = mb_strpos($clause, $normPhrase, 0, 'UTF-8');
    if ($pos === false || $pos <= 0) {
        return false;
    }

    $start = max(0, $pos - 18);
    $prefix = mb_substr($clause, $start, $pos - $start, 'UTF-8');

    foreach ($negations as $neg) {
        $escaped = preg_quote($neg, '/');
        if (
            preg_match('/(?:^|\s)' . $escaped . '\s*$/u', $prefix) === 1 ||
            preg_match('/(?:^|\s)' . $escaped . '\s+\S+$/u', $prefix) === 1
        ) {
            return true;
        }
    }
    return false;
}

function hasHedgingContradictionPhp(string $clause, array $slot): ?string
{
    $oppositeTerms = $slot['oppositeTerms'] ?? [];
    if (is_array($oppositeTerms)) {
        foreach ($oppositeTerms as $opp) {
            $normOpp = normalizeVietnameseEssay((string) $opp);
            if ($normOpp !== '' && str_contains($clause, $normOpp)) {
                return 'Chứa từ khóa đối lập ("' . $opp . '")';
            }
        }
    }

    $oppositePairs = [
        ['tăng', 'giảm'],
        ['phải', 'trái'],
        ['cao', 'thấp'],
        ['mở rộng', 'thu hẹp'],
        ['dư cung', 'dư cầu'],
        ['đồng biến', 'nghịch biến'],
        ['cùng chiều', 'ngược chiều'],
    ];

    $accepted = $slot['acceptedPhrases'] ?? [];
    foreach ($oppositePairs as [$a, $b]) {
        $hasBoth = str_contains($clause, "$a hoặc $b")
            || str_contains($clause, "$a hay $b")
            || str_contains($clause, "vừa $a vừa $b")
            || (str_contains($clause, $a) && str_contains($clause, $b));

        if ($hasBoth && is_array($accepted)) {
            foreach ($accepted as $p) {
                $np = normalizeVietnameseEssay((string) $p);
                if (str_contains($np, $a) || str_contains($np, $b)) {
                    return 'Chứa hai chiều đối lập ("' . $a . '" & "' . $b . '") trong cùng vế';
                }
            }
        }
    }

    return null;
}

function gradeMicroEssayRubricPhp(array $question, string $rawAnswer, array $seedVars = [], ?float $overrideMaxPoints = null): array
{
    $maxPoints = $overrideMaxPoints ?? (float) ($question['points'] ?? 1.0);
    $rubric = $question['gradingRubric'] ?? [];
    if (!is_array($rubric)) {
        $rubric = [];
    }

    $normalized = normalizeVietnameseEssay($rawAnswer);
    if ($normalized === '') {
        $emptyBreakdown = array_map(static fn (array $slot): array => [
            'slotId' => (string) ($slot['id'] ?? ''),
            'label' => (string) ($slot['label'] ?? ''),
            'earnedPoints' => 0.0,
            'maxPoints' => (float) ($slot['points'] ?? 0),
            'matched' => false,
        ], $rubric);

        return [
            'earnedPoints' => 0.0,
            'maxPoints' => $maxPoints,
            'breakdown' => $emptyBreakdown,
            'feedback' => 'Chưa có nội dung trả lời.',
            'matchedHighlights' => [],
            'blockedHighlights' => [],
            'honeypotTriggered' => false,
        ];
    }

    $honeypotTriggered = false;
    $blockedHighlights = [];
    $hpKw = trim((string) ($question['aiHoneypotKeyword'] ?? ''));
    if ($hpKw !== '' && str_contains($normalized, normalizeVietnameseEssay($hpKw))) {
        $honeypotTriggered = true;
        $blockedHighlights[] = $hpKw;
    }

    $clauses = splitEssayClauses($normalized);
    if (count($clauses) === 0) {
        $clauses = [$normalized];
    }

    $totalWeight = 0.0;
    foreach ($rubric as $r) {
        $totalWeight += (float) ($r['points'] ?? 0);
    }
    if ($totalWeight <= 0) {
        $totalWeight = $maxPoints;
    }
    $scaleFactor = $totalWeight > 0 ? ($maxPoints / $totalWeight) : 1.0;

    $breakdown = [];
    $matchedHighlights = [];
    $rawEarned = 0.0;

    foreach ($rubric as $slot) {
        $slotMax = round(((float) ($slot['points'] ?? 0)) * $scaleFactor, 2);
        $phrases = array_map(
            static fn ($p): string => interpolateTemplateVars((string) $p, $seedVars),
            is_array($slot['acceptedPhrases'] ?? null) ? $slot['acceptedPhrases'] : []
        );

        $pairs = [];
        if (is_array($slot['requiredPairs'] ?? null)) {
            foreach ($slot['requiredPairs'] as $group) {
                if (!is_array($group)) {
                    continue;
                }
                $pairs[] = array_map(static fn ($t): string => interpolateTemplateVars((string) $t, $seedVars), $group);
            }
        }

        $opposites = array_map(
            static fn ($t): string => interpolateTemplateVars((string) $t, $seedVars),
            is_array($slot['oppositeTerms'] ?? null) ? $slot['oppositeTerms'] : []
        );

        $activeSlot = [
            'acceptedPhrases' => $phrases,
            'requiredPairs' => $pairs,
            'oppositeTerms' => $opposites,
        ];

        $matched = false;
        $matchedText = null;
        $blockedReason = null;

        foreach ($clauses as $clause) {
            $hitPhrase = null;
            foreach ($phrases as $phrase) {
                $np = normalizeVietnameseEssay($phrase);
                if ($np !== '' && str_contains($clause, $np)) {
                    $hitPhrase = $phrase;
                    break;
                }
            }

            if ($hitPhrase === null && count($pairs) > 0) {
                $allSatisfied = true;
                $pairHits = [];
                foreach ($pairs as $group) {
                    $foundInGroup = null;
                    foreach ($group as $term) {
                        $nt = normalizeVietnameseEssay((string) $term);
                        if ($nt !== '' && str_contains($clause, $nt)) {
                            $foundInGroup = (string) $term;
                            break;
                        }
                    }
                    if ($foundInGroup === null) {
                        $allSatisfied = false;
                        break;
                    }
                    $pairHits[] = $foundInGroup;
                }
                if ($allSatisfied && count($pairHits) > 0) {
                    $hitPhrase = implode(' + ', $pairHits);
                }
            }

            if ($hitPhrase !== null) {
                if (hasNegationConflictPhp($clause, $hitPhrase)) {
                    $blockedReason = 'Phát hiện từ phủ định đảo ngược ý';
                    $blockedHighlights[] = $clause;
                    continue;
                }
                $hedgeErr = hasHedgingContradictionPhp($clause, $activeSlot);
                if ($hedgeErr !== null) {
                    $blockedReason = $hedgeErr;
                    $blockedHighlights[] = $clause;
                    continue;
                }
                $matched = true;
                $matchedText = $hitPhrase;
                $matchedHighlights[] = $hitPhrase;
                break;
            }
        }

        if ($matched) {
            $rawEarned += $slotMax;
            $breakdown[] = [
                'slotId' => (string) ($slot['id'] ?? ''),
                'label' => (string) ($slot['label'] ?? ''),
                'earnedPoints' => $slotMax,
                'maxPoints' => $slotMax,
                'matched' => true,
                'matchedText' => $matchedText,
            ];
        } else {
            $item = [
                'slotId' => (string) ($slot['id'] ?? ''),
                'label' => (string) ($slot['label'] ?? ''),
                'earnedPoints' => 0.0,
                'maxPoints' => $slotMax,
                'matched' => false,
            ];
            if ($blockedReason !== null) {
                $item['blockedReason'] = $blockedReason;
            }
            $breakdown[] = $item;
        }
    }

    $finalEarned = min($maxPoints, round($rawEarned, 2));
    $feedbackParts = [];
    foreach ($breakdown as $b) {
        if ($b['matched']) {
            $feedbackParts[] = '✓ Đạt ' . $b['label'] . ' (+' . $b['earnedPoints'] . 'đ)';
        } else {
            $reason = isset($b['blockedReason']) ? ' — ' . $b['blockedReason'] : '';
            $feedbackParts[] = '✗ Thiếu ' . $b['label'] . ' (0đ' . $reason . ')';
        }
    }

    return [
        'earnedPoints' => $finalEarned,
        'maxPoints' => $maxPoints,
        'breakdown' => $breakdown,
        'feedback' => implode('; ', $feedbackParts),
        'matchedHighlights' => array_values(array_unique($matchedHighlights)),
        'blockedHighlights' => array_values(array_unique($blockedHighlights)),
        'honeypotTriggered' => $honeypotTriggered,
    ];
}

/**
 * Safe recursive-descent arithmetic evaluator (zero eval()).
 * Supports +, -, *, /, ^, parentheses, abs(), round(), sqrt().
 */
function evaluateFormulaPhp(string $expression, array $vars = []): float
{
    $interpolated = interpolateTemplateVars($expression, $vars);
    preg_match_all('/\d+(?:\.\d+)?|[a-zA-Z_]+|[+\-*\/^(),]/', $interpolated, $m);
    $tokens = $m[0] ?? [];
    $pos = 0;
    $count = count($tokens);

    $peek = static function () use (&$tokens, &$pos, $count): ?string {
        return $pos < $count ? $tokens[$pos] : null;
    };
    $consume = static function () use (&$tokens, &$pos): string {
        return $tokens[$pos++];
    };

    $parseExpr = null;
    $parsePrimary = static function () use (&$peek, &$consume, &$parseExpr): float {
        $tok = $peek();
        if ($tok === null) {
            return 0.0;
        }
        if ($tok === '(') {
            $consume();
            $v = $parseExpr();
            if ($peek() === ')') {
                $consume();
            }
            return $v;
        }
        if (is_numeric($tok)) {
            $consume();
            return (float) $tok;
        }
        if (preg_match('/^[a-zA-Z_]+$/', $tok) === 1) {
            $consume();
            $args = [];
            if ($peek() === '(') {
                $consume();
                while ($peek() !== null && $peek() !== ')') {
                    $args[] = $parseExpr();
                    if ($peek() === ',') {
                        $consume();
                    }
                }
                if ($peek() === ')') {
                    $consume();
                }
            }
            $fn = strtolower($tok);
            $a0 = $args[0] ?? 0.0;
            return match ($fn) {
                'abs' => abs($a0),
                'round' => round($a0),
                'sqrt' => sqrt(max(0.0, $a0)),
                'max' => count($args) > 0 ? max($args) : 0.0,
                'min' => count($args) > 0 ? min($args) : 0.0,
                default => 0.0,
            };
        }
        $consume();
        return 0.0;
    };

    $parseUnary = static function () use (&$peek, &$consume, &$parsePrimary, &$parseUnary): float {
        if ($peek() === '-') {
            $consume();
            return -$parseUnary();
        }
        if ($peek() === '+') {
            $consume();
            return $parseUnary();
        }
        return $parsePrimary();
    };

    $parsePower = static function () use (&$peek, &$consume, &$parseUnary, &$parsePower): float {
        $base = $parseUnary();
        if ($peek() === '^') {
            $consume();
            $exp = $parsePower();
            return pow($base, $exp);
        }
        return $base;
    };

    $parseTerm = static function () use (&$peek, &$consume, &$parsePower): float {
        $val = $parsePower();
        while ($peek() === '*' || $peek() === '/') {
            $op = $consume();
            $right = $parsePower();
            if ($op === '*') {
                $val *= $right;
            } else {
                $val = $right == 0.0 ? 0.0 : $val / $right;
            }
        }
        return $val;
    };

    $parseExpr = static function () use (&$peek, &$consume, &$parseTerm): float {
        $val = $parseTerm();
        while ($peek() === '+' || $peek() === '-') {
            $op = $consume();
            $right = $parseTerm();
            $val = $op === '+' ? ($val + $right) : ($val - $right);
        }
        return $val;
    };

    $res = $parseExpr();
    return is_finite($res) ? $res : 0.0;
}

function normalizeDecimalPhp(string $raw): ?float
{
    $cleaned = str_replace([' ', ',', '%'], ['', '.', ''], trim($raw));
    if ($cleaned === '' || !is_numeric($cleaned)) {
        return null;
    }
    return (float) $cleaned;
}

function normalizeBlankTextPhp(string $raw, bool $caseSensitive = false): string
{
    $collapsed = preg_replace('/\s+/u', ' ', trim($raw)) ?? trim($raw);
    return $caseSensitive ? $collapsed : mb_strtolower($collapsed, 'UTF-8');
}

function gradeAnyQuestionPhp(array $question, mixed $payload, array $seedVars = [], ?float $overrideMaxPoints = null): array
{
    $maxPoints = $overrideMaxPoints ?? (float) ($question['points'] ?? 1.0);
    $type = (string) ($question['type'] ?? 'SINGLE_CHOICE');

    if ($type === 'SINGLE_CHOICE') {
        $selected = is_string($payload) ? trim($payload) : '';
        $correctIds = $question['correctOptionIds'] ?? [];
        $isCorrect = $selected !== '' && in_array($selected, $correctIds, true);
        $honeypotId = $question['aiHoneypotOptionId'] ?? null;
        $hpTriggered = $honeypotId !== null && $selected === $honeypotId;

        return [
            'isCorrect' => $isCorrect,
            'maxPoints' => $maxPoints,
            'earnedPoints' => $isCorrect ? $maxPoints : 0.0,
            'gradingStatus' => 'AUTO',
            'gradingFeedback' => $isCorrect ? 'Chính xác' : 'Chưa đúng đáp án chuẩn',
            'honeypotTriggered' => $hpTriggered,
        ];
    }

    if ($type === 'MULTI_CHOICE') {
        $chosen = is_array($payload) ? array_values(array_unique(array_map('strval', $payload))) : [];
        $correct = array_values(array_unique(array_map('strval', $question['correctOptionIds'] ?? [])));
        sort($chosen);
        sort($correct);
        $exact = count($chosen) === count($correct) && $chosen === $correct;
        $honeypotId = $question['aiHoneypotOptionId'] ?? null;
        $hpTriggered = $honeypotId !== null && in_array($honeypotId, $chosen, true);

        return [
            'isCorrect' => $exact,
            'maxPoints' => $maxPoints,
            'earnedPoints' => $exact ? $maxPoints : 0.0,
            'gradingStatus' => 'AUTO',
            'gradingFeedback' => $exact ? 'Chọn đủ các phương án đúng' : 'Thiếu hoặc thừa phương án',
            'honeypotTriggered' => $hpTriggered,
        ];
    }

    if ($type === 'TRUE_FALSE') {
        $map = is_array($payload) ? $payload : [];
        $items = $question['trueFalseItems'] ?? [];
        if (count($items) === 0) {
            return [
                'isCorrect' => false,
                'maxPoints' => $maxPoints,
                'earnedPoints' => 0.0,
                'gradingStatus' => 'AUTO',
                'gradingFeedback' => 'Không có mệnh đề.',
                'honeypotTriggered' => false,
            ];
        }
        $right = 0;
        foreach ($items as $it) {
            $id = (string) ($it['id'] ?? '');
            if (array_key_exists($id, $map) && (bool) $map[$id] === (bool) ($it['answer'] ?? false)) {
                $right++;
            }
        }
        $ratio = $right / count($items);
        $earned = round($maxPoints * $ratio, 2);
        return [
            'isCorrect' => $right === count($items),
            'maxPoints' => $maxPoints,
            'earnedPoints' => $earned,
            'gradingStatus' => 'AUTO',
            'gradingFeedback' => sprintf('Đúng %d/%d nhận định', $right, count($items)),
            'honeypotTriggered' => false,
        ];
    }

    if ($type === 'NUMERICAL') {
        $raw = is_string($payload) ? $payload : (is_scalar($payload) ? (string) $payload : '');
        $studentNum = normalizeDecimalPhp($raw);
        $formula = (string) ($question['numericalFormula'] ?? '0');
        $expected = evaluateFormulaPhp($formula, $seedVars);
        $tol = (float) ($question['tolerance'] ?? 0.01);
        $ok = $studentNum !== null && abs($studentNum - $expected) <= $tol;

        return [
            'isCorrect' => $ok,
            'maxPoints' => $maxPoints,
            'earnedPoints' => $ok ? $maxPoints : 0.0,
            'gradingStatus' => 'AUTO',
            'gradingFeedback' => $ok
                ? 'Đúng (Đáp số: ' . round($expected, 3) . ')'
                : 'Chưa khớp đáp số chuẩn (' . round($expected, 3) . ' ± ' . $tol . ')',
            'honeypotTriggered' => false,
        ];
    }

    if ($type === 'FILL_IN_BLANK') {
        $slots = is_array($question['blankSlots'] ?? null) ? $question['blankSlots'] : [];
        $submitted = is_array($payload) ? array_values(array_map('strval', $payload)) : [];
        $total = count($slots);
        if ($total === 0) {
            return [
                'isCorrect' => false,
                'maxPoints' => $maxPoints,
                'earnedPoints' => 0.0,
                'gradingStatus' => 'AUTO',
                'gradingFeedback' => 'Chưa cấu hình ô trống.',
                'honeypotTriggered' => false,
            ];
        }

        $correctCount = 0;
        foreach ($slots as $idx => $slot) {
            $cs = !empty($slot['caseSensitive']);
            $studentVal = normalizeBlankTextPhp((string) ($submitted[$idx] ?? ''), $cs);
            $acceptedRaw = is_array($slot['acceptedAnswers'] ?? null) ? $slot['acceptedAnswers'] : [];
            $accepted = [];
            foreach ($acceptedRaw as $ansItem) {
                $norm = normalizeBlankTextPhp((string) $ansItem, $cs);
                if ($norm !== '') {
                    $accepted[] = $norm;
                }
            }
            if ($studentVal !== '' && in_array($studentVal, $accepted, true)) {
                $correctCount++;
            }
        }

        $allMatched = ($correctCount === $total);
        $allOrNothing = !empty($question['blankAllOrNothing']);
        $earned = $allOrNothing
            ? ($allMatched ? $maxPoints : 0.0)
            : round($maxPoints * ($correctCount / $total), 2);

        return [
            'isCorrect' => $allMatched,
            'maxPoints' => $maxPoints,
            'earnedPoints' => $earned,
            'gradingStatus' => 'AUTO',
            'gradingFeedback' => sprintf('Đúng %d/%d ô trống', $correctCount, $total),
            'honeypotTriggered' => false,
        ];
    }

    // ESSAY -> Deterministic Rubric Grader
    $rawEssay = is_string($payload) ? $payload : '';
    $res = gradeMicroEssayRubricPhp($question, $rawEssay, $seedVars, $maxPoints);
    $isFull = $res['maxPoints'] > 0 && $res['earnedPoints'] >= $res['maxPoints'] - 0.01;
    return [
        'isCorrect' => $isFull,
        'maxPoints' => $res['maxPoints'],
        'earnedPoints' => $res['earnedPoints'],
        'gradingStatus' => 'RUBRIC_GRADED',
        'gradingFeedback' => $res['feedback'],
        'rubricBreakdown' => $res['breakdown'],
        'matchedHighlights' => $res['matchedHighlights'],
        'blockedHighlights' => $res['blockedHighlights'],
        'honeypotTriggered' => $res['honeypotTriggered'],
    ];
}

// Direct HTTP endpoint for Live Rubric Tester (?action=test)
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $action = $_GET['action'] ?? 'test';
    if ($action !== 'test') {
        jsonError('Action không được hỗ trợ.', 400);
    }
    requireAdminAuth();

    $body = readJsonBody();
    $question = $body['question'] ?? [];
    $sampleAnswer = (string) ($body['answer'] ?? '');
    $seedVars = is_array($body['seedVars'] ?? null) ? $body['seedVars'] : [];
    $maxPoints = isset($body['maxPoints']) ? (float) $body['maxPoints'] : null;

    if (!is_array($question)) {
        jsonError('Thiếu dữ liệu question.', 400);
    }

    $t0 = microtime(true);
    $result = gradeMicroEssayRubricPhp($question, $sampleAnswer, $seedVars, $maxPoints);
    $elapsedMs = round((microtime(true) - $t0) * 1000, 3);

    jsonResponse([
        'ok' => true,
        'elapsedMs' => $elapsedMs,
        'result' => $result,
    ]);
}
