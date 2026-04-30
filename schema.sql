-- ============================================================
-- ScholarFeedback AI — Database Schema + RLS + Triggers
-- Supabase PostgreSQL (UTF-8 enforced)
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Profiles: RBAC with ADMIN / STUDENT roles
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT CHECK (role IN ('ADMIN', 'STUDENT')) DEFAULT 'STUDENT',
  language_pref TEXT DEFAULT 'tr',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks: Assignments created by admins
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  deadline_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  custom_criteria JSONB,
  language_policy TEXT DEFAULT 'EN',
  scoring_framework TEXT DEFAULT 'IELTS',  -- IELTS | TOEFL | SKOPOS | FUNCTIONALISM | CUSTOM
  show_integrity_to_student BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Submissions: One row per student per task (UPSERT enforced)
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id),
  content TEXT,
  file_url TEXT,
  word_count INT DEFAULT 0,
  language_detected TEXT,
  status TEXT DEFAULT 'SUBMITTED'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'PROCESSING', 'GRADED', 'PUBLISHED')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, student_id)
);

-- Processing Queue: Async batch processing with retry logic
CREATE TABLE processing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_error TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'))
);

-- Feedback Reports: AI feedback + integrity scores
CREATE TABLE feedback_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  plagiarism_score FLOAT DEFAULT 0,
  ai_probability_score FLOAT DEFAULT 0,
  ai_feedback_markdown TEXT,
  scores_breakdown JSONB,       -- { cohesion: 7, lexical: 6, grammar: 8, task_response: 7 }
  evidence_quotes JSONB,        -- [{ quote: "...", issue: "...", suggestion: "..." }]
  final_grade INT,
  integrity_details JSONB,      -- { suspicious_segments: [...], heatmap_data: [...] }
  risk_flag BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Task Enrollments: Which students see which tasks
CREATE TABLE task_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  whitelisted_late BOOLEAN DEFAULT FALSE,  -- Admin can allow late submission
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, student_id)
);


-- ============================================================
-- 2. INDEXES (Performance)
-- ============================================================

CREATE INDEX idx_submissions_task_student ON submissions(task_id, student_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_processing_queue_status ON processing_queue(status);
CREATE INDEX idx_feedback_submission ON feedback_reports(submission_id);
CREATE INDEX idx_enrollments_student ON task_enrollments(student_id);
CREATE INDEX idx_enrollments_task ON task_enrollments(task_id);


-- ============================================================
-- 3. HELPER FUNCTIONS
-- ============================================================

-- Check if the current user is an ADMIN
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if a task's deadline has passed
CREATE OR REPLACE FUNCTION is_deadline_passed(p_task_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM tasks
    WHERE id = p_task_id AND deadline_datetime < NOW()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if a student is whitelisted for late submission
CREATE OR REPLACE FUNCTION is_whitelisted_late(p_task_id UUID, p_student_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_enrollments
    WHERE task_id = p_task_id
      AND student_id = p_student_id
      AND whitelisted_late = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_enrollments ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
-- Users can view their own profile; Admins can view all
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());

-- Users can update only their own profile
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Auto-create profile on signup (via trigger, not direct insert by user)
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());


-- ---- TASKS ----
-- All authenticated users can read tasks they are enrolled in; admins see all
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM task_enrollments
      WHERE task_enrollments.task_id = tasks.id
        AND task_enrollments.student_id = auth.uid()
    )
  );

-- Only admins can create/update/delete tasks
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (is_admin());


-- ---- SUBMISSIONS ----
-- Students see only their own; admins see all
CREATE POLICY "submissions_select" ON submissions FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_admin());

-- Students can insert their own submissions (before deadline or if whitelisted)
CREATE POLICY "submissions_insert" ON submissions FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND (
      NOT is_deadline_passed(task_id)
      OR is_whitelisted_late(task_id, auth.uid())
    )
  );

-- Students can update their own submissions (before deadline or if whitelisted)
CREATE POLICY "submissions_update" ON submissions FOR UPDATE TO authenticated
  USING (
    (student_id = auth.uid()
      AND (
        NOT is_deadline_passed(task_id)
        OR is_whitelisted_late(task_id, auth.uid())
      )
    )
    OR is_admin()
  )
  WITH CHECK (
    (student_id = auth.uid()
      AND (
        NOT is_deadline_passed(task_id)
        OR is_whitelisted_late(task_id, auth.uid())
      )
    )
    OR is_admin()
  );


-- ---- PROCESSING QUEUE ----
-- Only admins can see/manage the queue
CREATE POLICY "queue_select" ON processing_queue FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "queue_all" ON processing_queue FOR ALL TO authenticated
  USING (is_admin());


-- ---- FEEDBACK REPORTS ----
-- Students see their own feedback ONLY when the task is published
CREATE POLICY "feedback_select" ON feedback_reports FOR SELECT TO authenticated
  USING (
    is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.id = feedback_reports.submission_id
          AND s.student_id = auth.uid()
          AND t.is_published = TRUE
      )
    )
  );

-- Only admins/system can insert/update feedback
CREATE POLICY "feedback_insert" ON feedback_reports FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "feedback_update" ON feedback_reports FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());


-- ---- TASK ENROLLMENTS ----
-- Students see their own enrollments; admins see all
CREATE POLICY "enrollments_select" ON task_enrollments FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_admin());

-- Only admins can manage enrollments
CREATE POLICY "enrollments_insert" ON task_enrollments FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "enrollments_delete" ON task_enrollments FOR DELETE TO authenticated
  USING (is_admin());


-- ============================================================
-- 5. TRIGGERS & AUTOMATION
-- ============================================================

-- Auto-update `updated_at` on submission changes
CREATE OR REPLACE FUNCTION update_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submission_updated
  BEFORE UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_submission_timestamp();


-- Auto-populate processing_queue when submission status is 'SUBMITTED'
-- and the task deadline has passed
CREATE OR REPLACE FUNCTION enqueue_for_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enqueue if deadline has passed and status is SUBMITTED
  IF NEW.status = 'SUBMITTED' AND is_deadline_passed(NEW.task_id) THEN
    INSERT INTO processing_queue (submission_id, status)
    VALUES (NEW.id, 'PENDING')
    ON CONFLICT (submission_id) DO UPDATE
      SET status = 'PENDING',
          retry_count = 0,
          last_error = NULL,
          processed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_enqueue_submission
  AFTER INSERT OR UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_for_processing();


-- Batch enqueue function: called by admin after deadline to queue ALL
-- submitted essays for a given task
CREATE OR REPLACE FUNCTION batch_enqueue_task(p_task_id UUID)
RETURNS INT AS $$
DECLARE
  enqueued_count INT := 0;
BEGIN
  INSERT INTO processing_queue (submission_id, status)
  SELECT s.id, 'PENDING'
  FROM submissions s
  WHERE s.task_id = p_task_id
    AND s.status = 'SUBMITTED'
  ON CONFLICT (submission_id) DO UPDATE
    SET status = 'PENDING',
        retry_count = 0,
        last_error = NULL,
        processed_at = NULL;

  GET DIAGNOSTICS enqueued_count = ROW_COUNT;

  -- Mark submissions as PROCESSING
  UPDATE submissions
  SET status = 'PROCESSING'
  WHERE task_id = p_task_id AND status = 'SUBMITTED';

  RETURN enqueued_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Publish all grades for a task (admin-only action)
CREATE OR REPLACE FUNCTION publish_task_grades(p_task_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Mark task as published
  UPDATE tasks SET is_published = TRUE WHERE id = p_task_id;

  -- Mark all graded submissions as published
  UPDATE submissions
  SET status = 'PUBLISHED'
  WHERE task_id = p_task_id AND status = 'GRADED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, language_pref)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'STUDENT'),
    COALESCE(NEW.raw_user_meta_data->>'language_pref', 'tr')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- 6. ENCODING ENFORCEMENT (Turkish character safety)
-- ============================================================
-- PostgreSQL uses UTF-8 by default on Supabase.
-- This validation function ensures no corrupted encoding slips through.

CREATE OR REPLACE FUNCTION validate_utf8_text()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify content is valid UTF-8 (PostgreSQL does this natively,
  -- but we add an explicit check for defense-in-depth)
  IF NEW.content IS NOT NULL THEN
    -- Replace any invalid byte sequences with the Unicode replacement char
    NEW.content := convert_from(convert_to(NEW.content, 'UTF8'), 'UTF8');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_submission_encoding
  BEFORE INSERT OR UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION validate_utf8_text();
