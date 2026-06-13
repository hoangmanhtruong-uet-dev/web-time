CREATE DATABASE IF NOT EXISTS web_time
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE web_time;

CREATE TABLE IF NOT EXISTS schedule_events (
  id VARCHAR(80) PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  event_date DATE NOT NULL,
  event_type ENUM('school', 'personal') NOT NULL DEFAULT 'school',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  location VARCHAR(180) NOT NULL DEFAULT '',
  teacher VARCHAR(180) NOT NULL DEFAULT '',
  done TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_schedule_events_time (starts_at),
  INDEX idx_schedule_events_week (event_date, start_time),
  INDEX idx_schedule_events_done (done)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint VARCHAR(500) PRIMARY KEY,
  subscription_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sent_reminders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(80) NOT NULL,
  reminder_type VARCHAR(40) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sent_reminder (event_id, reminder_type),
  CONSTRAINT fk_sent_reminders_event
    FOREIGN KEY (event_id)
    REFERENCES schedule_events(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
