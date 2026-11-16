<?php
declare(strict_types=1);

/**
 * VNEconomics Testing Platform - Dual-Transport Mailer & Queue Processor
 * 1) Native Socket SMTP (TLS 587 / SSL 465 AUTH LOGIN) with RFC 2047 UTF-8 & MIME Multipart CSV attachment
 * 2) Automatic fallback to PHP mail() if SMTP disabled or unavailable
 * 3) Async response flush via fastcgi_finish_request() so student submit returns instantly
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin_auth.php';

function encodeMimeHeaderUtf8(string $text): string
{
    if ($text === '' || preg_match('/^[\x20-\x7E]*$/', $text) === 1) {
        return $text;
    }
    return '=?UTF-8?B?' . base64_encode($text) . '?=';
}

function buildMimeEmailMessage(
    string $fromEmail,
    string $fromName,
    string $toEmail,
    string $subject,
    string $bodyHtml,
    ?string $csvAttachment = null,
    ?string $csvFilename = null
): array {
    $boundary = 'VNE_MIME_' . bin2hex(random_bytes(10));
    $encodedFrom = encodeMimeHeaderUtf8($fromName) . ' <' . $fromEmail . '>';
    $encodedSubject = encodeMimeHeaderUtf8($subject);

    $headers = [
        'Date: ' . gmdate('r'),
        'From: ' . $encodedFrom,
        'To: <' . $toEmail . '>',
        'Subject: ' . $encodedSubject,
        'MIME-Version: 1.0',
    ];

    if ($csvAttachment !== null && $csvAttachment !== '' && $csvFilename !== null && $csvFilename !== '') {
        $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
        $parts = [];
        $parts[] = '--' . $boundary . "\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($bodyHtml), 76, "\r\n");

        $safeFile = preg_replace('/[^a-zA-Z0-9._-]/', '_', $csvFilename) ?: 'report.csv';
        $parts[] = '--' . $boundary . "\r\n"
            . 'Content-Type: text/csv; charset=UTF-8; name="' . $safeFile . "\"\r\n"
            . 'Content-Disposition: attachment; filename="' . $safeFile . "\"\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($csvAttachment), 76, "\r\n");

        $parts[] = '--' . $boundary . '--';
        $rawBody = implode("\r\n", $parts);
        $phpMailContentType = 'multipart/mixed; boundary="' . $boundary . '"';
    } else {
        $headers[] = 'Content-Type: text/html; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: base64';
        $rawBody = chunk_split(base64_encode($bodyHtml), 76, "\r\n");
        $phpMailContentType = 'text/html; charset=UTF-8';
    }

    return [
        'headers' => $headers,
        'body' => $rawBody,
        'encodedSubject' => $encodedSubject,
        'encodedFrom' => $encodedFrom,
        'phpMailContentType' => $phpMailContentType,
    ];
}

function smtpReadResponse($socket): string
{
    $resp = '';
    while (($line = fgets($socket, 515)) !== false) {
        $resp .= $line;
        if (isset($line[3]) && $line[3] === ' ') {
            break;
        }
    }
    return $resp;
}

function smtpCommand($socket, string $cmd, array $expectedCodes): string
{
    fwrite($socket, $cmd . "\r\n");
    $resp = smtpReadResponse($socket);
    $code = (int) substr($resp, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP command failed [' . $cmd . ']: ' . trim($resp));
    }
    return $resp;
}

function sendViaNativeSmtp(
    array $smtpCfg,
    string $toEmail,
    string $subject,
    string $bodyHtml,
    ?string $csvAttachment = null,
    ?string $csvFilename = null
): array {
    $host = trim((string) ($smtpCfg['host'] ?? ''));
    $port = (int) ($smtpCfg['port'] ?? 465);
    $enc = strtolower(trim((string) ($smtpCfg['encryption'] ?? 'ssl')));
    $user = (string) ($smtpCfg['username'] ?? '');
    $pass = (string) ($smtpCfg['password'] ?? '');
    $fromEmail = (string) ($smtpCfg['from_email'] ?? 'noreply@vneconomics.com');
    $fromName = (string) ($smtpCfg['from_name'] ?? 'VNEconomics Testing Platform');
    $timeout = (int) ($smtpCfg['timeout'] ?? 12);

    if ($host === '' || $user === '' || $pass === '') {
        return ['ok' => false, 'error' => 'Chưa cấu hình đầy đủ SMTP host/username/password.'];
    }

    $remote = ($enc === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $errno = 0;
    $errstr = '';
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'allow_self_signed' => false,
        ],
    ]);

    $socket = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        return ['ok' => false, 'error' => "Không kết nối được SMTP ($errno): $errstr"];
    }

    stream_set_timeout($socket, $timeout);

    try {
        $greeting = smtpReadResponse($socket);
        if ((int) substr($greeting, 0, 3) !== 220) {
            throw new RuntimeException('SMTP greeting error: ' . trim($greeting));
        }

        $ehloHost = $_SERVER['SERVER_NAME'] ?? 'vneconomics.com';
        smtpCommand($socket, 'EHLO ' . $ehloHost, [250]);

        if ($enc === 'tls') {
            smtpCommand($socket, 'STARTTLS', [220]);
            if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('STARTTLS handshake thất bại.');
            }
            smtpCommand($socket, 'EHLO ' . $ehloHost, [250]);
        }

        smtpCommand($socket, 'AUTH LOGIN', [334]);
        smtpCommand($socket, base64_encode($user), [334]);
        smtpCommand($socket, base64_encode($pass), [235]);

        smtpCommand($socket, 'MAIL FROM:<' . $fromEmail . '>', [250]);
        smtpCommand($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
        smtpCommand($socket, 'DATA', [354]);

        $mime = buildMimeEmailMessage($fromEmail, $fromName, $toEmail, $subject, $bodyHtml, $csvAttachment, $csvFilename);
        // Dot-stuffing per RFC 5321
        $fullMessage = implode("\r\n", $mime['headers']) . "\r\n\r\n" . $mime['body'];
        $fullMessage = preg_replace('/^\./m', '..', $fullMessage) ?? $fullMessage;
        fwrite($socket, $fullMessage . "\r\n.\r\n");

        $dataResp = smtpReadResponse($socket);
        if ((int) substr($dataResp, 0, 3) !== 250) {
            throw new RuntimeException('SMTP DATA error: ' . trim($dataResp));
        }

        @fwrite($socket, "QUIT\r\n");
        fclose($socket);
        return ['ok' => true, 'transport' => 'SMTP'];
    } catch (Throwable $e) {
        @fclose($socket);
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

function sendViaPhpMailFallback(
    string $fromEmail,
    string $fromName,
    string $toEmail,
    string $subject,
    string $bodyHtml,
    ?string $csvAttachment = null,
    ?string $csvFilename = null
): array {
    if (!function_exists('mail')) {
        return ['ok' => false, 'error' => 'Hàm PHP mail() không khả dụng trên máy chủ.'];
    }
    $mime = buildMimeEmailMessage($fromEmail, $fromName, $toEmail, $subject, $bodyHtml, $csvAttachment, $csvFilename);
    $extraHeaders = array_values(array_filter(
        $mime['headers'],
        static fn (string $h): bool => !str_starts_with($h, 'To:') && !str_starts_with($h, 'Subject:')
    ));
    $sent = @mail($toEmail, $mime['encodedSubject'], $mime['body'], implode("\r\n", $extraHeaders));
    return $sent
        ? ['ok' => true, 'transport' => 'PHP_MAIL']
        : ['ok' => false, 'error' => 'PHP mail() trả về false (cần cấu hình SMTP thực tế trong config.php).'];
}

function dispatchSingleEmail(
    string $toEmail,
    string $subject,
    string $bodyHtml,
    ?string $csvAttachment = null,
    ?string $csvFilename = null
): array {
    $cfg = getAppConfig();
    $smtp = $cfg['smtp'] ?? [];
    if (!empty($smtp['enabled'])) {
        $smtpRes = sendViaNativeSmtp($smtp, $toEmail, $subject, $bodyHtml, $csvAttachment, $csvFilename);
        if ($smtpRes['ok']) {
            return $smtpRes;
        }
        // Log SMTP failure then try local mail() fallback
        error_log('[VNE_SMTP_FALLBACK] ' . ($smtpRes['error'] ?? 'unknown'));
    }

    $fromEmail = (string) ($smtp['from_email'] ?? 'noreply@vneconomics.com');
    $fromName = (string) ($smtp['from_name'] ?? 'VNEconomics Testing Platform');
    return sendViaPhpMailFallback($fromEmail, $fromName, $toEmail, $subject, $bodyHtml, $csvAttachment, $csvFilename);
}

function isDemoExamRecord(array $exam): bool
{
    $ownerId = (string) ($exam['ownerId'] ?? ($exam['owner_id'] ?? ''));
    $examId = (string) ($exam['id'] ?? '');
    $roomPin = strtoupper(trim((string) ($exam['roomPin'] ?? ($exam['room_pin'] ?? ''))));
    if ($ownerId === 'SYSTEM_DEMO' || str_starts_with($examId, 'exm_demo_')) {
        return true;
    }
    return in_array($roomPin, ['101202', '202303', '303404'], true) && ($ownerId === '' || $ownerId === 'SYSTEM_DEMO');
}

function enqueueAndSendEmail(
    PDO $pdo,
    string $recipient,
    string $subject,
    string $bodyHtml,
    string $kind = 'STUDENT_SCORE',
    string $summary = '',
    ?string $csvAttachment = null,
    ?string $csvFilename = null,
    bool $sendImmediately = true,
    bool $demoSkip = false
): array {
    $id = generateId('mail');
    $now = nowIso();
    $status = 'PENDING';
    $err = null;
    $sentAt = null;

    if ($demoSkip) {
        $status = 'DEMO_SKIPPED';
        $err = 'Chế độ Demo: không gửi email thực tế';
    } elseif ($sendImmediately) {
        $res = dispatchSingleEmail($recipient, $subject, $bodyHtml, $csvAttachment, $csvFilename);
        if ($res['ok']) {
            $status = 'SENT';
            $sentAt = nowIso();
        } else {
            $status = 'FAILED';
            $err = (string) ($res['error'] ?? 'Send failed');
        }
    }

    $stmt = $pdo->prepare(
        'INSERT INTO email_queue (id, recipient, subject, body_html, csv_attachment, csv_filename, kind, status, summary, error_message, created_at, sent_at)
         VALUES (:id, :recipient, :subject, :body_html, :csv_attachment, :csv_filename, :kind, :status, :summary, :error_message, :created_at, :sent_at)'
    );
    $stmt->execute([
        ':id' => $id,
        ':recipient' => $recipient,
        ':subject' => $subject,
        ':body_html' => $bodyHtml,
        ':csv_attachment' => $csvAttachment,
        ':csv_filename' => $csvFilename,
        ':kind' => $kind,
        ':status' => $status,
        ':summary' => $summary,
        ':error_message' => $err,
        ':created_at' => $now,
        ':sent_at' => $sentAt,
    ]);

    return [
        'id' => $id,
        'status' => $status,
        'error' => $err,
        'sentAt' => $sentAt,
    ];
}

function buildStudentScoreEmailHtml(array $exam, array $attempt, array $answers): string
{
    $name = htmlspecialchars((string) ($attempt['studentName'] ?? ''), ENT_QUOTES, 'UTF-8');
    $code = htmlspecialchars((string) ($attempt['studentCode'] ?? ''), ENT_QUOTES, 'UTF-8');
    $title = htmlspecialchars((string) ($exam['title'] ?? ''), ENT_QUOTES, 'UTF-8');
    $scale10 = number_format((float) ($attempt['scale10Score'] ?? 0), 2);
    $raw = (float) ($attempt['totalScore'] ?? 0) . ' / ' . (float) ($attempt['maxTotalScore'] ?? 10);
    $integrity = (int) ($attempt['integrityScore'] ?? 100);

    $assigned = is_array($attempt['assignedQuestions'] ?? null) ? $attempt['assignedQuestions'] : [];
    $ansByQid = [];
    foreach ($answers as $k => $ans) {
        $qid = (string) ($ans['questionId'] ?? $k);
        if ($qid !== '') {
            $ansByQid[$qid] = $ans;
        }
    }

    $orderedItems = [];
    if (count($assigned) > 0) {
        foreach ($assigned as $i => $aq) {
            $qid = (string) ($aq['questionId'] ?? '');
            $ans = $ansByQid[$qid] ?? [];
            $orderedItems[] = [
                'num' => $i + 1,
                'prompt' => (string) ($aq['renderedContent'] ?? ''),
                'chapter' => (string) ($ans['chapterCategory'] ?? ($aq['chapterCategory'] ?? '')),
                'earned' => (float) ($ans['earnedPoints'] ?? 0),
                'maxPts' => (float) ($ans['maxPoints'] ?? ($aq['maxPoints'] ?? 1)),
                'isCorrect' => $ans['isCorrect'] ?? false,
            ];
        }
    } else {
        $seq = 0;
        foreach ($answers as $ans) {
            $seq++;
            $orderedItems[] = [
                'num' => $seq,
                'prompt' => (string) ($ans['questionContent'] ?? ''),
                'chapter' => (string) ($ans['chapterCategory'] ?? ''),
                'earned' => (float) ($ans['earnedPoints'] ?? 0),
                'maxPts' => (float) ($ans['maxPoints'] ?? 1),
                'isCorrect' => $ans['isCorrect'] ?? null,
            ];
        }
    }

    $wrongRowsHtml = '';
    $wrongCount = 0;
    foreach ($orderedItems as $item) {
        $qNum = (int) $item['num'];
        $earned = (float) $item['earned'];
        $maxPts = (float) $item['maxPts'];
        $isCorrect = $item['isCorrect'];
        $isWrong = ($isCorrect === false) || ($maxPts > 0 && $earned + 1e-6 < $maxPts);
        if (!$isWrong) {
            continue;
        }
        $wrongCount++;
        $rawPrompt = trim(preg_replace('/\s+/', ' ', strip_tags((string) $item['prompt'])) ?? '');
        if ($rawPrompt !== '' && function_exists('mb_strlen') && mb_strlen($rawPrompt, 'UTF-8') > 180) {
            $rawPrompt = mb_substr($rawPrompt, 0, 177, 'UTF-8') . '...';
        }
        $qTitleHtml = $rawPrompt !== ''
            ? "<div style='font-weight:600;color:#111827;'>" . htmlspecialchars($rawPrompt, ENT_QUOTES, 'UTF-8') . "</div>"
            : '';
        $ch = htmlspecialchars((string) $item['chapter'], ENT_QUOTES, 'UTF-8');
        $chHtml = $ch !== '' ? "<div style='font-size:11px;color:#6B7280;margin-top:2px;'>{$ch}</div>" : '';
        $pts = $earned . ' / ' . $maxPts;
        $statusLabel = $earned > 0 ? 'Chưa đạt tối đa' : 'Làm sai / Chưa trả lời';
        $wrongRowsHtml .= "<tr><td style='padding:8px;border-bottom:1px solid #E5E7EB;font-weight:bold;white-space:nowrap;vertical-align:top;'>Câu {$qNum}</td>"
            . "<td style='padding:8px;border-bottom:1px solid #E5E7EB;vertical-align:top;'>{$qTitleHtml}{$chHtml}</td>"
            . "<td style='padding:8px;border-bottom:1px solid #E5E7EB;font-weight:bold;color:#B91C1C;white-space:nowrap;vertical-align:top;'>{$pts}</td>"
            . "<td style='padding:8px;border-bottom:1px solid #E5E7EB;color:#991B1B;white-space:nowrap;vertical-align:top;'>{$statusLabel}</td></tr>";
    }

    $detailSectionHtml = $wrongCount > 0
        ? "<p style='margin:18px 0 8px;font-size:14px;font-weight:700;color:#111827;'>Danh sách câu hỏi làm sai / chưa đạt điểm tối đa ({$wrongCount} câu):</p>"
            . "<table style='width:100%;border-collapse:collapse;font-size:13px;'>"
            . "<thead><tr style='background:#FEF2F2;text-align:left;color:#991B1B;'>"
            . "<th style='padding:8px;'>Câu</th><th style='padding:8px;'>Nội dung câu hỏi</th><th style='padding:8px;'>Điểm</th><th style='padding:8px;'>Trạng thái</th>"
            . "</tr></thead><tbody>{$wrongRowsHtml}</tbody></table>"
        : "<div style='margin-top:16px;padding:12px 16px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;color:#065F46;font-size:13px;font-weight:600;'>"
            . "Chúc mừng! Bạn không có câu hỏi nào làm sai trong bài thi này."
            . "</div>";

    return "<div style='font-family:Inter,Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;'>"
        . "<div style='background:#0B1324;color:#ffffff;padding:24px;'>"
        . "<p style='margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#14B8A6;'>VNEconomics Testing Platform</p>"
        . "<h2 style='margin:6px 0 0;font-size:20px;'>Kết quả bài thi: {$title}</h2>"
        . "</div>"
        . "<div style='padding:24px;color:#111827;'>"
        . "<p>Xin chào <strong>{$name}</strong> (MSSV: <strong>{$code}</strong>),</p>"
        . "<div style='display:flex;gap:16px;margin:16px 0;padding:16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;'>"
        . "<div style='margin-right:24px;'><div style='font-size:12px;color:#6B7280;'>ĐIỂM HỆ 10</div><div style='font-size:28px;font-weight:800;color:#0F766E;'>{$scale10}</div></div>"
        . "<div style='margin-right:24px;'><div style='font-size:12px;color:#6B7280;'>TỔNG ĐIỂM GỐC</div><div style='font-size:18px;font-weight:700;'>{$raw}</div></div>"
        . "<div><div style='font-size:12px;color:#6B7280;'>ĐIỂM TIN CẬY</div><div style='font-size:18px;font-weight:700;'>{$integrity}%</div></div>"
        . "</div>"
        . $detailSectionHtml
        . "<p style='margin-top:20px;font-size:12px;color:#6B7280;'>Lưu ý: Email chỉ thông báo điểm số và các câu làm sai, không gửi kèm đáp án đúng. Biên lai điện tử sinh tự động bởi hệ thống khảo thí VNEconomics.</p>"
        . "</div></div>";
}

function buildInstructorCsvAttachment(array $exam, array $attempts, ?PDO $pdo = null): string
{
    $esc = static function (mixed $v): string {
        $s = $v === null ? '' : (string) $v;
        if (preg_match('/[",\n\r]/', $s) === 1) {
            return '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    };

    $appendPerQuestionDetails = static function (array &$lines) use ($attempts, $pdo, $esc): void {
        if ($pdo === null || count($attempts) === 0) {
            return;
        }
        $attemptIds = array_values(array_filter(array_map(static fn (array $a): string => (string) ($a['id'] ?? ''), $attempts)));
        if (count($attemptIds) === 0) {
            return;
        }
        $ansByAttQ = [];
        foreach (array_chunk($attemptIds, 200) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $pdo->prepare("SELECT attempt_id, question_id, chapter_category, max_points, earned_points, grading_feedback FROM attempt_answers WHERE attempt_id IN ($ph)");
            $stmt->execute($chunk);
            foreach ($stmt->fetchAll() as $ansRow) {
                $aid = (string) ($ansRow['attempt_id'] ?? '');
                $qid = (string) ($ansRow['question_id'] ?? '');
                if ($aid !== '' && $qid !== '') {
                    $ansByAttQ[$aid][$qid] = $ansRow;
                }
            }
        }

        $hasAnyAssigned = false;
        foreach ($attempts as $a) {
            $assigned = json_decode((string) ($a['assigned_questions_json'] ?? '[]'), true);
            if (is_array($assigned) && count($assigned) > 0) {
                $hasAnyAssigned = true;
                break;
            }
        }
        if (!$hasAnyAssigned) {
            return;
        }

        $lines[] = '';
        $lines[] = implode(',', array_map($esc, [
            'CHI TIẾT KẾT QUẢ TỪNG CÂU HỎI CỦA TỪNG THÍ SINH',
            'Họ tên',
            'Câu số',
            'Chương / Chuyên đề',
            'Nội dung câu hỏi',
            'Kết quả',
            'Điểm đạt',
            'Điểm tối đa',
            'Nhận xét chấm',
        ]));

        foreach ($attempts as $a) {
            $aid = (string) ($a['id'] ?? '');
            $assigned = json_decode((string) ($a['assigned_questions_json'] ?? '[]'), true);
            if (!is_array($assigned) || count($assigned) === 0) {
                continue;
            }
            foreach ($assigned as $idx => $snap) {
                $qid = (string) ($snap['questionId'] ?? '');
                $ans = $ansByAttQ[$aid][$qid] ?? null;
                $maxP = (float) ($ans['max_points'] ?? ($snap['maxPoints'] ?? 1));
                $earned = (float) ($ans['earned_points'] ?? 0);
                $statusLabel = ($maxP > 0 && $earned >= $maxP - 1e-6)
                    ? 'Đúng'
                    : ($earned > 0 ? 'Một phần' : 'Sai');
                $lines[] = implode(',', array_map($esc, [
                    (string) ($a['student_code'] ?? ''),
                    (string) ($a['student_name'] ?? ''),
                    'Câu ' . ($idx + 1),
                    (string) ($snap['chapterCategory'] ?? ($ans['chapter_category'] ?? '')),
                    (string) ($snap['renderedContent'] ?? ''),
                    $statusLabel,
                    $earned,
                    $maxP,
                    (string) ($ans['grading_feedback'] ?? ''),
                ]));
            }
        }
    };

    $rosterEntries = json_decode((string) ($exam['roster_entries_json'] ?? '[]'), true);
    if (is_array($rosterEntries) && count($rosterEntries) > 0) {
        $attemptByCode = [];
        foreach ($attempts as $a) {
            $code = strtoupper(trim((string) ($a['student_code'] ?? '')));
            if ($code !== '') {
                $attemptByCode[$code] = $a;
            }
        }
        $headers = ['STT', 'Mã sinh viên', 'Họ đệm', 'Tên', 'Giới tính', 'Ngày sinh', 'Điểm'];
        $lines = [implode(',', array_map($esc, $headers))];
        foreach ($rosterEntries as $idx => $entry) {
            $code = strtoupper(trim((string) ($entry['studentCode'] ?? '')));
            $matched = $attemptByCode[$code] ?? null;
            $scoreCell = $matched !== null
                ? number_format((float) ($matched['scale10_score'] ?? 0), 2)
                : 'Vắng';
            $row = [
                $idx + 1,
                (string) ($entry['studentCode'] ?? ''),
                (string) ($entry['lastName'] ?? ''),
                (string) ($entry['firstName'] ?? ''),
                (string) ($entry['gender'] ?? ''),
                (string) ($entry['dob'] ?? ''),
                $scoreCell,
            ];
            $lines[] = implode(',', array_map($esc, $row));
        }
        $appendPerQuestionDetails($lines);
        return "\xEF\xBB\xBF" . implode("\r\n", $lines);
    }

    $headers = [
        'MSSV', 'Họ tên', 'Email', 'Lớp',
        'Điểm Trắc nghiệm/Số', 'Điểm Tự luận', 'Tổng điểm gốc', 'Điểm Hệ 10',
        'Số lần rời màn hình', 'Tổng giây vắng', 'Điểm Tin Cậy (%)',
        'Cờ AI', 'Trạng thái', 'Trạng thái Email',
    ];

    $lines = [implode(',', array_map($esc, $headers))];
    foreach ($attempts as $a) {
        $row = [
            $a['student_code'] ?? '',
            $a['student_name'] ?? '',
            $a['student_email'] ?? '',
            $a['class_name'] ?? '',
            $a['auto_score'] ?? 0,
            $a['essay_score'] ?? 0,
            ($a['total_score'] ?? 0) . '/' . ($a['max_total_score'] ?? 10),
            number_format((float) ($a['scale10_score'] ?? 0), 2),
            $a['leave_count'] ?? 0,
            $a['total_away_seconds'] ?? 0,
            ($a['integrity_score'] ?? 100) . '%',
            !empty($a['ai_flag']) ? ('CÓ (' . ($a['ai_flag_reason'] ?? '') . ')') : 'KHÔNG',
            $a['status'] ?? '',
            $a['email_sent_status'] ?? '',
        ];
        $lines[] = implode(',', array_map($esc, $row));
    }

    $appendPerQuestionDetails($lines);
    return "\xEF\xBB\xBF" . implode("\r\n", $lines);
}

/**
 * Flush HTTP response to student before slow SMTP handshake if Plesk PHP-FPM fastcgi_finish_request exists.
 */
function runAfterResponse(callable $fn): void
{
    if (function_exists('fastcgi_finish_request')) {
        @fastcgi_finish_request();
    }
    $fn();
}

function resolveMailerClientIp(): string
{
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
        explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0] ?? '',
        $_SERVER['REMOTE_ADDR'] ?? '',
    ];
    foreach ($candidates as $raw) {
        $ip = trim((string) $raw);
        if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP)) {
            return substr($ip, 0, 64);
        }
    }
    return '0.0.0.0';
}

function getVietnamTodayDate(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Ho_Chi_Minh')))->format('Y-m-d');
}

function checkDemoMailerQuota(
    PDO $pdo,
    string $browserId,
    string $ip,
    string $today,
    ?string $recipient = null
): array {
    $stmt = $pdo->prepare(
        'SELECT recipient, created_at FROM demo_mailer_quota WHERE browser_id = :bid AND test_date = :d LIMIT 1'
    );
    $stmt->execute([':bid' => $browserId, ':d' => $today]);
    $row = $stmt->fetch();
    if ($row) {
        return [
            'allowed' => false,
            'reason' => 'BROWSER_LIMIT',
            'alreadyTestedRecipient' => (string) $row['recipient'],
            'sentAt' => (string) $row['created_at'],
            'message' => 'Trình duyệt này đã gửi Email thử nghiệm trong ngày hôm nay (' . $row['recipient'] . '). Chế độ Demo giới hạn tối đa 1 lần/ngày/trình duyệt để tránh spam.',
        ];
    }

    if ($recipient !== null && $recipient !== '') {
        $recStmt = $pdo->prepare(
            'SELECT COUNT(*) AS cnt FROM demo_mailer_quota WHERE recipient = :rec AND test_date = :d'
        );
        $recStmt->execute([':rec' => strtolower($recipient), ':d' => $today]);
        if ((int) ($recStmt->fetchColumn() ?: 0) >= 2) {
            return [
                'allowed' => false,
                'reason' => 'RECIPIENT_LIMIT',
                'message' => 'Hộp thư này đã nhận đủ số lần gửi thử Demo trong ngày hôm nay. Vui lòng thử lại vào ngày mai.',
            ];
        }
    }

    $ipStmt = $pdo->prepare(
        'SELECT COUNT(*) AS cnt FROM demo_mailer_quota WHERE ip_address = :ip AND test_date = :d'
    );
    $ipStmt->execute([':ip' => $ip, ':d' => $today]);
    if ((int) ($ipStmt->fetchColumn() ?: 0) >= 10) {
        return [
            'allowed' => false,
            'reason' => 'IP_LIMIT',
            'message' => 'Mạng/IP hiện tại đã đạt giới hạn gửi thử Demo hôm nay. Vui lòng đăng nhập tài khoản Giảng viên chính thức để gửi không giới hạn.',
        ];
    }

    return ['allowed' => true];
}

// Direct HTTP Endpoint handling
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $action = $_GET['action'] ?? 'list';
    $pdo = getDb();
    $admin = requireAdminAuth();
    $isDemo = (($admin['role'] ?? 'DEMO') !== 'OFFICIAL');

    if ($action === 'list') {
        $actorId = (string) ($admin['instructorId'] ?? 'DEMO_INSTRUCTOR');
        $actorEmail = strtolower(trim((string) ($admin['email'] ?? '')));
        if (!$isDemo && $actorId === 'MASTER_ADMIN') {
            $rows = $pdo->query('SELECT id, recipient, subject, kind, status, summary, csv_filename, error_message, created_at, sent_at FROM email_queue ORDER BY created_at DESC LIMIT 200')->fetchAll();
        } elseif (!$isDemo) {
            $eStmt = $pdo->prepare(
                "SELECT id, recipient, subject, kind, status, summary, csv_filename, error_message, created_at, sent_at
                 FROM email_queue
                 WHERE LOWER(recipient) = :em
                    OR LOWER(recipient) IN (SELECT DISTINCT LOWER(instructor_email) FROM exams WHERE owner_id = :uid1)
                    OR LOWER(recipient) IN (SELECT DISTINCT LOWER(a.student_email) FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE e.owner_id = :uid2)
                 ORDER BY created_at DESC LIMIT 200"
            );
            $eStmt->execute([':em' => $actorEmail, ':uid1' => $actorId, ':uid2' => $actorId]);
            $rows = $eStmt->fetchAll();
        } else {
            $rows = $pdo->query(
                "SELECT id, recipient, subject, kind, status, summary, csv_filename, error_message, created_at, sent_at
                 FROM email_queue
                 WHERE LOWER(recipient) = 'giangvien@vneconomics.com'
                    OR LOWER(recipient) IN (SELECT DISTINCT LOWER(a.student_email) FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE e.owner_id = 'SYSTEM_DEMO')
                 ORDER BY created_at DESC LIMIT 200"
            )->fetchAll();
        }
        jsonResponse(['ok' => true, 'logs' => $rows]);
    }

    if ($action === 'test_quota') {
        $browserId = trim((string) ($_GET['browserId'] ?? ''));
        if (!$isDemo) {
            jsonResponse(['ok' => true, 'isDemo' => false, 'allowed' => true]);
        }
        if (!preg_match('/^[a-zA-Z0-9_-]{8,80}$/', $browserId)) {
            jsonResponse(['ok' => true, 'isDemo' => true, 'allowed' => true]);
        }
        $today = getVietnamTodayDate();
        $ip = resolveMailerClientIp();
        $quota = checkDemoMailerQuota($pdo, $browserId, $ip, $today);
        jsonResponse(array_merge(['ok' => true, 'isDemo' => true, 'today' => $today], $quota));
    }

    if ($action === 'test') {
        $body = readJsonBody();
        $cfg = getAppConfig();
        $to = trim((string) ($body['to'] ?? ($isDemo ? '' : $cfg['default_instructor_email'])));
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            jsonError('Vui lòng nhập địa chỉ Email hợp lệ để nhận thư thử nghiệm.', 400);
        }

        $browserId = trim((string) ($body['browserId'] ?? ''));
        $today = getVietnamTodayDate();
        $ip = resolveMailerClientIp();

        if ($isDemo) {
            if (!preg_match('/^[a-zA-Z0-9_-]{8,80}$/', $browserId)) {
                jsonError('Không xác định được mã trình duyệt (Browser ID) hợp lệ.', 400);
            }
            $quota = checkDemoMailerQuota($pdo, $browserId, $ip, $today, $to);
            if (empty($quota['allowed'])) {
                jsonResponse([
                    'ok' => false,
                    'quotaExceeded' => true,
                    'alreadyTestedRecipient' => $quota['alreadyTestedRecipient'] ?? null,
                    'error' => $quota['message'] ?? 'Đã hết lượt gửi Email thử nghiệm hôm nay.',
                ], 429);
            }
        }

        $sentTimeVn = (new DateTimeImmutable('now', new DateTimeZone('Asia/Ho_Chi_Minh')))->format('H:i:s d/m/Y');
        $safeTo = htmlspecialchars($to, ENT_QUOTES, 'UTF-8');
        $modeLabel = $isDemo ? 'Chế độ Trải nghiệm Demo' : 'Tài khoản Giảng viên Chính thức';
        $html = "<div style='font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #cbd5e1;border-radius:12px;background:#ffffff;color:#0f172a;'>"
            . "<h3 style='color:#0F766E;margin-top:0;'>VNEconomics Testing Platform — Kiểm thử Email Thành công</h3>"
            . "<p>Xin chào Thầy/Cô,</p>"
            . "<p>Đây là thư kiểm thử được gửi từ <strong>{$modeLabel}</strong> tới địa chỉ <strong>{$safeTo}</strong> lúc <strong>{$sentTimeVn}</strong> (giờ Việt Nam).</p>"
            . "<div style='background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:14px 0;font-size:13px;'>"
            . "<strong>Khi tổ chức thi thật trên hệ thống:</strong>"
            . "<ul style='margin:6px 0 0 18px;padding:0;line-height:1.6;'>"
            . "<li>Sinh viên nộp bài sẽ nhận ngay phiếu điểm chi tiết (hoặc biên nhận nếu chọn chế độ hoãn điểm).</li>"
            . "<li>Giảng viên bấm <em>Kết thúc Ca thi</em> sẽ nhận được Bảng điểm tổng hợp kèm file CSV toàn lớp.</li>"
            . "</ul></div>"
            . "<p style='font-size:12px;color:#64748b;margin-bottom:0;'>Thư được gửi tự động bởi VNEconomics Testing Platform.</p>"
            . "</div>";

        $res = enqueueAndSendEmail(
            $pdo,
            $to,
            '[VNEconomics Testing] Email Kiểm thử Hệ thống Pre-Flight',
            $html,
            'TEST_MAIL',
            ($isDemo ? '[Demo Test] ' : '') . 'Email kiểm tra gửi tới ' . $to,
            null,
            null,
            true
        );

        if ($isDemo && ($res['status'] ?? '') === 'SENT') {
            $ins = $pdo->prepare(
                'INSERT INTO demo_mailer_quota (id, browser_id, ip_address, recipient, test_date, created_at)
                 VALUES (:id, :bid, :ip, :rec, :d, :at)'
            );
            $ins->execute([
                ':id' => 'dmq_' . bin2hex(random_bytes(8)),
                ':bid' => $browserId,
                ':ip' => $ip,
                ':rec' => strtolower($to),
                ':d' => $today,
                ':at' => nowIso(),
            ]);
        }

        $isSent = ($res['status'] ?? '') === 'SENT';
        jsonResponse([
            'ok' => $isSent,
            'error' => $isSent ? null : ($res['error'] ?? 'Không thể gửi Email thử nghiệm qua SMTP.'),
            'result' => $res,
        ]);
    }

    if ($action === 'retry') {
        if ($isDemo) {
            jsonResponse(['ok' => true, 'processed' => 0, 'sentCount' => 0, 'demoSkipped' => true]);
        }
        $stmt = $pdo->query("SELECT * FROM email_queue WHERE status IN ('PENDING', 'FAILED') ORDER BY created_at ASC LIMIT 30");
        $pending = $stmt->fetchAll();
        $sentCount = 0;
        $upd = $pdo->prepare('UPDATE email_queue SET status = :status, error_message = :err, sent_at = :sent_at WHERE id = :id');
        foreach ($pending as $item) {
            $res = dispatchSingleEmail(
                (string) $item['recipient'],
                (string) $item['subject'],
                (string) $item['body_html'],
                $item['csv_attachment'] ?: null,
                $item['csv_filename'] ?: null
            );
            $upd->execute([
                ':status' => $res['ok'] ? 'SENT' : 'FAILED',
                ':err' => $res['ok'] ? null : (string) ($res['error'] ?? ''),
                ':sent_at' => $res['ok'] ? nowIso() : null,
                ':id' => $item['id'],
            ]);
            if ($res['ok']) {
                $sentCount++;
            }
        }
        jsonResponse(['ok' => true, 'processed' => count($pending), 'sentCount' => $sentCount]);
    }

    jsonError('Action mailer không hợp lệ.', 400);
}
