-- =====================================================================
-- ICT Services Division - Application for Compensatory Time-Off (CTO)
-- Table: ctoapplications   (MariaDB 10.4+ / MySQL 8+)
--
-- One row per application. The row is inserted when the applicant
-- submits (Section A) and updated at each step of the approval chain
-- (Section B: stream lead, technical lead; Section C: approver).
-- All DATETIME values are stored in UTC; DATE values are Trinidad and Tobago dates.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ctoapplications (
  id                        INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  reference                 VARCHAR(20)       CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'e.g. CTO-260930-YU27',
  status                    ENUM('stream_lead','technical_lead','approval','approved','not_approved')
                                              NOT NULL DEFAULT 'stream_lead' COMMENT 'Current step, or final outcome',

  -- Section A: applicant
  applicant_name            VARCHAR(80)       NOT NULL,
  applicant_position        VARCHAR(80)       NOT NULL,
  applicant_email           VARCHAR(120)      NOT NULL,
  request_date              DATE              NOT NULL COMMENT 'Date the form was filled in',
  days_requested            TINYINT UNSIGNED  NOT NULL COMMENT '1-60 working days',
  cto_start_date            DATE              NOT NULL,
  cto_end_date              DATE              NOT NULL COMMENT 'Last working day of leave',
  resume_date               DATE              NOT NULL COMMENT 'First working day back',
  outside_country           BOOLEAN           NOT NULL,
  stream                    ENUM('administration','networking-infrastructure','service-delivery-support','solutions-development') NOT NULL,

  -- Section B: stream lead
  stream_lead_name          VARCHAR(80)       NOT NULL,
  stream_lead_email         VARCHAR(120)      NOT NULL,
  stream_lead_decision      ENUM('recommended','not_recommended') NULL,
  stream_lead_remarks       VARCHAR(500)      NULL,
  stream_lead_decided_at    DATETIME(3)       NULL,

  -- Section B: technical lead (CTO leave eligibility)
  technical_lead_name       VARCHAR(80)       NOT NULL,
  technical_lead_email      VARCHAR(120)      NOT NULL,
  total_accumulated         DECIMAL(5,1)      NULL COMMENT 'Days, whole or half',
  total_taken               DECIMAL(5,1)      NULL,
  total_available           DECIMAL(5,1)      NULL COMMENT 'accumulated - taken',
  technical_lead_decision   ENUM('recommended','not_recommended') NULL,
  technical_lead_remarks    VARCHAR(500)      NULL,
  technical_lead_decided_at DATETIME(3)       NULL,

  -- Section C: approval
  approver_name             VARCHAR(80)       NOT NULL,
  approver_email            VARCHAR(120)      NOT NULL,
  approver_decision         ENUM('approved','not_approved') NULL,
  approver_remarks          VARCHAR(500)      NULL,
  approver_decided_at       DATETIME(3)       NULL,

  -- Secret link tokens (one per role, sent in the emails)
  token_applicant           CHAR(32)          CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_stream_lead         CHAR(32)          CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_technical_lead      CHAR(32)          CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_approver            CHAR(32)          CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  -- Audit trail
  history                   JSON              NOT NULL COMMENT 'List of {at, event, by}',
  notifications             JSON              NOT NULL COMMENT 'Emails sent/queued for this application',

  created_at                DATETIME(3)       NOT NULL,
  updated_at                DATETIME(3)       NOT NULL,
  completed_at              DATETIME(3)       NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_ctoapplications_reference (reference),
  KEY ix_ctoapplications_status (status),
  KEY ix_ctoapplications_applicant_email (applicant_email),
  KEY ix_ctoapplications_stream (stream),
  KEY ix_ctoapplications_start_date (cto_start_date),
  KEY ix_ctoapplications_created_at (created_at),
  CONSTRAINT ck_ctoapplications_days CHECK (days_requested BETWEEN 1 AND 60),
  CONSTRAINT ck_ctoapplications_dates CHECK (cto_end_date >= cto_start_date),
  CONSTRAINT ck_ctoapplications_balance CHECK (total_taken IS NULL OR total_accumulated IS NULL OR total_taken <= total_accumulated)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='ICT Services Division - CTO applications';

-- Suggested app account (adjust host and password):
-- CREATE USER 'cto_app'@'%' IDENTIFIED BY 'change-me';
-- GRANT SELECT, INSERT, UPDATE ON your_database.ctoapplications TO 'cto_app'@'%';
