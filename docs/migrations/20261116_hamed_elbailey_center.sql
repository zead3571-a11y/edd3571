-- Migration: Replace legacy demo center ('center-1') with 'سنتر حامد البيلي' ('center-hamed-elbailey')
-- Idempotent, transactional, zero plaintext passwords (salted SHA-256 hashes only).

BEGIN;

-- 1) Schema extensions for Guardians, Per-Session Teacher Compensation, and Student Accounts
ALTER TABLE centers
  ALTER COLUMN phone SET DEFAULT '',
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS teacher_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS student_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS guardian_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS password_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS password_salt TEXT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('مالك', 'مدير', 'محاسب', 'ريسبشن', 'مدرس', 'ولي أمر', 'طالب'));

ALTER TABLE users
  ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_center_id_phone_key;

ALTER TABLE teachers
  ALTER COLUMN phone SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS per_session_amount NUMERIC(10,2) NULL;

ALTER TABLE teachers
  DROP CONSTRAINT IF EXISTS teachers_compensation_type_check;
ALTER TABLE teachers
  ADD CONSTRAINT teachers_compensation_type_check
  CHECK (compensation_type IN ('percent', 'rent', 'per_session'));

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 400,
  ALTER COLUMN parent_phone SET DEFAULT '';

ALTER TABLE invoices
  ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE payments
  ALTER COLUMN group_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  user_id TEXT NULL,
  name TEXT NOT NULL,
  email TEXT NULL,
  phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_guardians (
  id TEXT PRIMARY KEY,
  center_id TEXT NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  guardian_user_id TEXT NULL,
  relationship TEXT NOT NULL DEFAULT 'ولي أمر',
  UNIQUE (student_id, guardian_id)
);

-- 2) Remove legacy demo center ('center-1') safely with ON DELETE CASCADE
DELETE FROM centers WHERE id = 'center-1';

-- 3) Insert 'سنتر حامد البيلي' center
INSERT INTO centers (id, name, governorate, city, address, phone, stages, current_plan_id)
VALUES (
  'center-hamed-elbailey',
  'سنتر حامد البيلي',
  'القاهرة',
  'القاهرة',
  '',
  '',
  ARRAY['الصف الأول الثانوي', 'الصف الثاني الثانوي', 'الصف الثالث الثانوي', 'الصف الأول الإعدادي', 'الصف الثاني الإعدادي', 'الصف الثالث الإعدادي'],
  'pro'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  current_plan_id = EXCLUDED.current_plan_id;

-- 4) Insert 3 Teachers (200 EGP per completed session)
INSERT INTO teachers (id, center_id, name, phone, subjects, compensation_type, per_session_amount, has_login_access, color)
VALUES
  ('t-mohamed', 'center-hamed-elbailey', 'محمد عماد', '', ARRAY['مادة التخصص'], 'per_session', 200, true, '#0F766E'),
  ('t-ahmed', 'center-hamed-elbailey', 'أحمد جاويش', '', ARRAY['مادة التخصص'], 'per_session', 200, true, '#1D4ED8'),
  ('t-fares', 'center-hamed-elbailey', 'فارس أوسا', '', ARRAY['مادة التخصص'], 'per_session', 200, true, '#B45309')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  compensation_type = EXCLUDED.compensation_type,
  per_session_amount = EXCLUDED.per_session_amount;

-- 5) Insert 2 Students (400 EGP expected monthly fee each)
INSERT INTO students (id, center_id, code, full_name, stage, phone, parent_name, parent_phone, monthly_fee, standing_discount, status, user_id)
VALUES
  ('st-mahmoud', 'center-hamed-elbailey', 'S-000101', 'محمود ميمي', 'الصف الثالث الثانوي', '', 'ميمي البنا', '', 400, 0, 'active', 'u-mahmoud'),
  ('st-faisal', 'center-hamed-elbailey', 'S-000102', 'فيصل إمام', 'الصف الثالث الثانوي', '', 'إبراهيم إمام', '', 400, 0, 'active', 'u-faisal')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  parent_name = EXCLUDED.parent_name,
  monthly_fee = EXCLUDED.monthly_fee;

-- 6) Insert 2 Guardians & Links
INSERT INTO guardians (id, center_id, user_id, name, email, phone)
VALUES
  ('g-mimi', 'center-hamed-elbailey', 'u-mimi', 'ميمي البنا', 'mimi@hamed-elbailey.demo', ''),
  ('g-ibrahim', 'center-hamed-elbailey', 'u-ibrahim', 'إبراهيم إمام', 'ibrahim@hamed-elbailey.demo', '')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email;

INSERT INTO student_guardians (id, center_id, student_id, guardian_id, guardian_user_id, relationship)
VALUES
  ('sg-1', 'center-hamed-elbailey', 'st-mahmoud', 'g-mimi', 'u-mimi', 'ولي أمر'),
  ('sg-2', 'center-hamed-elbailey', 'st-faisal', 'g-ibrahim', 'u-ibrahim', 'ولي أمر')
ON CONFLICT (id) DO NOTHING;

-- 7) Insert 10 Accounts (Salted SHA-256 hashes only; ZERO plaintext passwords stored)
INSERT INTO users (id, center_id, name, email, phone, role, status, teacher_id, student_id, guardian_id, password_salt, password_hash)
VALUES
  ('u-hamed', 'center-hamed-elbailey', 'مسيو حامد البيلي', 'hamed@hamed-elbailey.demo', '', 'مالك', 'active', NULL, NULL, NULL, 'hamed-elbailey-salt-owner-u1', '1da82d7deb7c363f56f3acaf7d4b2e779e163b02c6397ef40f3e5ef3fac4e2b0'),
  ('u-salma', 'center-hamed-elbailey', 'سلمى عمرو هيكل', 'salma@hamed-elbailey.demo', '', 'مدير', 'active', NULL, NULL, NULL, 'hamed-elbailey-salt-admin-u2', '266d6b12b6fcca65e20b926ed5fafcb430b737756920d2b94a620cacf361bac0'),
  ('u-mostafa', 'center-hamed-elbailey', 'مصطفى الفقي', 'mostafa@hamed-elbailey.demo', '', 'محاسب', 'active', NULL, NULL, NULL, 'hamed-elbailey-salt-acc-u3', '2b8d455ce75a0727fc1ce15ce79c9efe8c69421c7b16d3a102adcc00eb1fabd7'),
  ('u-mohamed', 'center-hamed-elbailey', 'محمد عماد', 'mohamed@hamed-elbailey.demo', '', 'مدرس', 'active', 't-mohamed', NULL, NULL, 'hamed-elbailey-salt-tch-mohamed', 'f348b8549ccbf751ca5ba41844571964d65007270653137aceafa7c01eab6422'),
  ('u-ahmed', 'center-hamed-elbailey', 'أحمد جاويش', 'ahmed@hamed-elbailey.demo', '', 'مدرس', 'active', 't-ahmed', NULL, NULL, 'hamed-elbailey-salt-tch-ahmed', '3ea975d244518150381e575170e9013d9d8a563f31778365cda8cd514ef515d4'),
  ('u-fares', 'center-hamed-elbailey', 'فارس أوسا', 'fares@hamed-elbailey.demo', '', 'مدرس', 'active', 't-fares', NULL, NULL, 'hamed-elbailey-salt-tch-fares', '3dc2da6380dbdb4e2e397608d5a04c72c37b7334eaa62c24fe0e35682b085331'),
  ('u-mahmoud', 'center-hamed-elbailey', 'محمود ميمي', 'mahmoud@hamed-elbailey.demo', '', 'طالب', 'active', NULL, 'st-mahmoud', NULL, 'hamed-elbailey-salt-stu-mahmoud', 'a40c5d9a66cf8e31422294ab416c52322371d951f43145fe7b0bd0eaaab43129'),
  ('u-faisal', 'center-hamed-elbailey', 'فيصل إمام', 'faisal@hamed-elbailey.demo', '', 'طالب', 'active', NULL, 'st-faisal', NULL, 'hamed-elbailey-salt-stu-faisal', 'f4b52a4e96c9cc84e3b8f9b25b4f50a828bcd21fa33e0735fc32a445c9bfa71c'),
  ('u-mimi', 'center-hamed-elbailey', 'ميمي البنا', 'mimi@hamed-elbailey.demo', '', 'ولي أمر', 'active', NULL, NULL, 'g-mimi', 'hamed-elbailey-salt-par-mimi', '370e524acfad5353e561a77d4c35bb4a4cbc398fd9832c0fc8db053d0d4bebe5'),
  ('u-ibrahim', 'center-hamed-elbailey', 'إبراهيم إمام', 'ibrahim@hamed-elbailey.demo', '', 'ولي أمر', 'active', NULL, NULL, 'g-ibrahim', 'hamed-elbailey-salt-par-ibrahim', '77b1dd812df7a3faf13e55795ff263fbd49076657137780f9ff34ec78566e6de')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  teacher_id = EXCLUDED.teacher_id,
  student_id = EXCLUDED.student_id,
  guardian_id = EXCLUDED.guardian_id;

-- 8) Insert 2 Initial Unpaid Monthly Invoices (400 EGP each = 800 EGP expected, 0 EGP collected)
INSERT INTO invoices (id, center_id, number, student_id, group_id, month, base_amount, discount_lines, net_amount, paid, due_date, status)
VALUES
  ('inv-101', 'center-hamed-elbailey', 'INV-202611-101', 'st-mahmoud', 'general', '2026-11', 400, '[]'::jsonb, 400, 0, '2026-11-01', 'pending'),
  ('inv-102', 'center-hamed-elbailey', 'INV-202611-102', 'st-faisal', 'general', '2026-11', 400, '[]'::jsonb, 400, 0, '2026-11-01', 'pending')
ON CONFLICT (id) DO UPDATE SET
  base_amount = EXCLUDED.base_amount,
  net_amount = EXCLUDED.net_amount,
  paid = EXCLUDED.paid,
  status = EXCLUDED.status;

-- 9) Row Level Security policies for Guardians & Student-Guardian links
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_guardians ON guardians;
CREATE POLICY tenant_isolation_guardians ON guardians
  FOR ALL USING (center_id = (SELECT center_id FROM auth_user_row()));

DROP POLICY IF EXISTS tenant_isolation_student_guardians ON student_guardians;
CREATE POLICY tenant_isolation_student_guardians ON student_guardians
  FOR ALL USING (center_id = (SELECT center_id FROM auth_user_row()));

DROP POLICY IF EXISTS parent_student_access ON students;
CREATE POLICY parent_student_access ON students
  FOR SELECT USING (
    center_id = (SELECT center_id FROM auth_user_row())
    AND (
      (SELECT role FROM auth_user_row()) NOT IN ('ولي أمر', 'طالب')
      OR id IN (
        SELECT sg.student_id FROM student_guardians sg
        WHERE sg.guardian_user_id = (SELECT id FROM auth_user_row())
           OR sg.guardian_id = (SELECT guardian_id FROM auth_user_row())
      )
      OR id = (SELECT student_id FROM auth_user_row())
    )
  );

COMMIT;
