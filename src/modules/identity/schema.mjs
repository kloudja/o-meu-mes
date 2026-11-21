// Additive migration. Existing financial tables, IDs and receipts stay in their original scope.
export const identitySchema = `
CREATE TABLE identity_control(id INTEGER PRIMARY KEY CHECK(id=1), restored INTEGER NOT NULL CHECK(restored IN(0,1))) STRICT;
INSERT INTO identity_control VALUES(1,0);
CREATE TABLE users(id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE, pending_email TEXT, verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN(0,1)),
 country TEXT NOT NULL CHECK(country='PT'), interface_locale TEXT NOT NULL DEFAULT 'pt-PT',
 communication_locale TEXT NOT NULL DEFAULT 'pt-PT', adult_at INTEGER NOT NULL, created INTEGER NOT NULL) STRICT;
CREATE TABLE credentials(user_id TEXT PRIMARY KEY REFERENCES users ON DELETE CASCADE, password_hash TEXT NOT NULL,
 totp TEXT, last_step INTEGER NOT NULL DEFAULT -1) STRICT;
CREATE TABLE documents(kind TEXT NOT NULL, version TEXT NOT NULL, country TEXT NOT NULL, locale TEXT NOT NULL,
 effective TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(kind,version,country,locale)) STRICT;
INSERT INTO documents VALUES
 ('terms','dev-1','PT','pt-PT','2026-11-18','Termos de utilização','Versão de desenvolvimento para o registo local de adultos residentes em Portugal. Os espaços financeiros ainda não estão disponíveis.'),
 ('privacy','dev-1','PT','pt-PT','2026-11-18','Privacidade','Versão de desenvolvimento. O registo guarda o nome, email, país, declaração de maioridade e versão dos termos aceite. A sessão usa um cookie de autenticação. As comunicações servem a confirmação e segurança da conta. O contacto do responsável e o procedimento para exercer direitos aguardam aprovação antes da abertura pública.');
CREATE TABLE acceptances(user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE, kind TEXT NOT NULL, version TEXT NOT NULL,
 country TEXT NOT NULL, locale TEXT NOT NULL, accepted_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,kind,version,country,locale), FOREIGN KEY(kind,version,country,locale) REFERENCES documents) STRICT;
CREATE TABLE sessions(id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
 scope TEXT NOT NULL CHECK(scope IN('pending','account','replace')), created INTEGER NOT NULL, active INTEGER NOT NULL,
 expires INTEGER NOT NULL, remembered INTEGER NOT NULL CHECK(remembered IN(0,1)), authenticated INTEGER NOT NULL,
 enrollment TEXT, enrollment_until INTEGER) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE registration_intents(user_id TEXT PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 digest TEXT NOT NULL, expires INTEGER NOT NULL) STRICT;
CREATE TABLE recovery_codes(digest TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE) STRICT;
CREATE TABLE challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('verify','reset','email','recoverEmail')), target TEXT NOT NULL, digest TEXT NOT NULL UNIQUE,
 expires INTEGER NOT NULL, UNIQUE(user_id,kind)) STRICT;
CREATE TABLE mail_jobs(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
 challenge TEXT REFERENCES challenges ON DELETE CASCADE, kind TEXT NOT NULL, payload TEXT,
 locale TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','sending','accepted','deferred','failed','delivered')),
 attempts INTEGER NOT NULL DEFAULT 0, available INTEGER NOT NULL, created INTEGER NOT NULL, priority INTEGER NOT NULL,
 provider_id TEXT) STRICT;
CREATE INDEX mail_due ON mail_jobs(status,available,priority);
CREATE TABLE auth_limits(id TEXT PRIMARY KEY, started INTEGER NOT NULL, count INTEGER NOT NULL) STRICT;
`;
