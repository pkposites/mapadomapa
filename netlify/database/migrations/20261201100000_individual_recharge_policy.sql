ALTER TABLE request_access_settings ADD COLUMN pix_suspended boolean NOT NULL DEFAULT false;
CREATE TABLE request_access_overrides (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('required','free')),
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
