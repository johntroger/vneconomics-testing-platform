<?php
/**
 * VNEconomics Testing Platform - Configuration Template
 * Copy this file outside webroot (e.g. ../config.php or ../../config.php) on Plesk
 * and fill in production database, HMAC secret, admin passcode, and SMTP credentials.
 */
return [
    // 'sqlite' (zero-setup WAL mode outside webroot) or 'mysql'
    'db_driver' => 'mysql',

    // Used when db_driver === 'sqlite'. Leave empty to auto-place in ../../.exam_data/vne_testing.sqlite
    'sqlite_path' => '',

    // Used when db_driver === 'mysql' (Plesk WordPress / App DB)
    'mysql' => [
        'host' => 'localhost',
        'port' => 3306,
        'dbname' => 'vne35060_wp_udx1z',
        'charset' => 'utf8mb4',
        'username' => 'REPLACE_WITH_DB_USER',
        'password' => 'REPLACE_WITH_DB_PASSWORD',
    ],

    // Admin login passcodes (change on production)
    'admin_passcodes' => [
        'vne2026',
        '8888',
    ],

    // Generate a 64-char random hex string for production HMAC token signing
    'hmac_secret' => 'REPLACE_WITH_LONG_RANDOM_SECRET_KEY_2026',

    // Allowed CORS origins
    'cors_origins' => [
        'https://staging-store.vneconomics.com',
        'https://vneconomics.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ],

    // Default instructor email for aggregate CSV reports
    'default_instructor_email' => 'giangvien@vneconomics.com',

    // Google OAuth 2.0 Web Client ID (for "Đăng nhập bằng Google" on /admin)
    // Get from Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs
    'google_client_id' => '',

    // SMTP configuration (native TLS/SSL socket client in mailer.php, falls back to mail())
    'smtp' => [
        'enabled' => false,
        'host' => 'smtp.gmail.com',
        'port' => 465,
        'encryption' => 'ssl', // 'ssl' (465), 'tls' (587), or 'none'
        'username' => '',
        'password' => '',
        'from_email' => 'noreply@vneconomics.com',
        'from_name' => 'VNEconomics Testing Platform',
        'timeout' => 12,
    ],
];
