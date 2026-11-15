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

function enqueueAndSendEmail(
    PDO $pdo,
    string $recipient,
    string $subject,
    string $bodyHtml,
    string $kind = 'STUDENT_SCORE',
    string $summary = '',
    ?string $csvAttachment = null,
    ?string $csvFilename = null,
    bool $sendImmediately = true
): array {
    $id = generateId('mail');
    $now = nowIso();
    $status = 'PENDING';
    $err = null;
    $sentAt = null;

    if ($sendImmediately) {
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

    $wrongRowsHtml = '';
    $wrongCount = 0;
    foreach ($answers as $idx => $ans) {
        $qNum = $idx + 1;
        $earned = (float) ($ans['earnedPoints'] ?? 0);
        $maxPts = (float) ($ans['maxPoints'] ?? 1);
        $isCorrect = $ans['isCorrect'] ?? null;
        $isWrong = ($isCorrect === false) || ($maxPts > 0 && $earned + 1e-6 < $maxPts);
        if (!$isWrong) {
            continue;
        }
        $wrongCount++;
        $ch = htmlspecialchars((string) ($ans['chapterCategory'] ?? ''), ENT_QUOTES, 'UTF-8');
        $pts = $earned . ' / ' . $maxPts;
        $statusLabel = $earned > 0 ? 'Chưa đạt tối đa' : 'Làm sai / Chưa trả lời';
        $wrongRowsHtml .= "<tr><td style='padding:8px;border-bottom:1px solid #E5E7EB;font-weight:bold;'>Câu {$qNum}</td>"
            . "<td style='padding:8px;border-bottom:1px solid #E5E7EB;'>{$ch}</td>"
            . "<td style='padding:8px;border-bottom:1px solid #E5E7EB;font-weight:bold;color:#B91C1C;'>{$pts}</td>"
            . "<td style='padding:8px;border-bottom:1px solid #E5E7EB;color:#991B1B;'>{$statusLabel}</td></tr>";
    }

    $detailSectionHtml = $wrongCount > 0
        ? "<p style='margin:18px 0 8px;font-size:14px;font-weight:700;color:#111827;'>Danh sách câu hỏi làm sai / chưa đạt điểm tối đa ({$wrongCount} câu):</p>"
            . "<table style='width:100%;border-collapse:collapse;font-size:13px;'>"
            . "<thead><tr style='background:#FEF2F2;text-align:left;color:#991B1B;'>"
            . "<th style='padding:8px;'>Câu</th><th style='padding:8px;'>Chương</th><th style='padding:8px;'>Điểm</th><th style='padding:8px;'>Trạng thái</th>"
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

function buildInstructorCsvAttachment(array $exam, array $attempts): string
{
    $headers = [
        'MSSV', 'Họ tên', 'Email', 'Lớp',
        'Điểm Trắc nghiệm/Số', 'Điểm Tự luận', 'Tổng điểm gốc', 'Điểm Hệ 10',
        'Số lần rời màn hình', 'Tổng giây vắng', 'Điểm Tin Cậy (%)',
        'Cờ AI', 'Trạng thái', 'Trạng thái Email',
    ];

    $esc = static function (mixed $v): string {
        $s = $v === null ? '' : (string) $v;
        if (preg_match('/[",\n\r]/', $s) === 1) {
            return '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    };

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

// Direct HTTP Endpoint handling
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    applyCorsHeaders();
    $action = $_GET['action'] ?? 'list';
    $pdo = getDb();
    requireAdminAuth();

    if ($action === 'list') {
        $rows = $pdo->query('SELECT id, recipient, subject, kind, status, summary, csv_filename, error_message, created_at, sent_at FROM email_queue ORDER BY created_at DESC LIMIT 200')->fetchAll();
        jsonResponse(['ok' => true, 'logs' => $rows]);
    }

    if ($action === 'test') {
        $body = readJsonBody();
        $cfg = getAppConfig();
        $to = trim((string) ($body['to'] ?? $cfg['default_instructor_email']));
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            jsonError('Email người nhận không hợp lệ.', 400);
        }
        $html = "<div style='font-family:Arial,sans-serif;padding:20px;border:1px solid #0F766E;border-radius:8px;'>"
            . "<h3 style='color:#0F766E;margin-top:0;'>VNEconomics Testing Platform — SMTP Test Thành Công</h3>"
            . "<p>Thư kiểm tra kết nối SMTP/Mailer được gửi lúc <strong>" . nowIso() . "</strong>.</p></div>";

        $res = enqueueAndSendEmail(
            $pdo,
            $to,
            '[VNEconomics] Kiểm tra cấu hình gửi Email hệ thống thi',
            $html,
            'TEST_MAIL',
            'Email kiểm tra cấu hình SMTP từ Admin Dashboard',
            null,
            null,
            true
        );
        jsonResponse(['ok' => $res['status'] === 'SENT', 'result' => $res]);
    }

    if ($action === 'retry') {
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
