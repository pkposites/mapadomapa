-- Disparos automáticos inicialmente desativados; códigos de segurança continuam independentes.
CREATE TABLE email_template_settings (
 kind text PRIMARY KEY,
 enabled boolean NOT NULL DEFAULT false,
 enabled_at timestamptz
);
INSERT INTO email_template_settings(kind) VALUES
 ('welcome'),('approved'),('install'),('payment_pending'),('payment_expired'),('payment_paid'),
 ('payment_cancelled'),('payment_refund'),('offer'),('renewal'),('request');
ALTER TABLE email_outbox ADD COLUMN template_kind text REFERENCES email_template_settings(kind);
CREATE TABLE email_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 offers boolean NOT NULL DEFAULT false,
 install_reminder boolean NOT NULL DEFAULT false,
 installed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
