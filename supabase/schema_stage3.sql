-- ============================================================
-- ScholarFeedback AI — Stage 3: Classes & Enrollments
-- Run AFTER the base schema.sql
-- ============================================================

-- Classes table (teacher creates classes with unique join codes)
CREATE TABLE classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  join_code VARCHAR(6) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student-Class Enrollment (many-to-many)
CREATE TABLE class_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

-- Associate tasks with classes
ALTER TABLE tasks ADD COLUMN class_id UUID REFERENCES classes(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_classes_teacher ON classes(teacher_id);
CREATE INDEX idx_classes_join_code ON classes(join_code);
CREATE INDEX idx_class_enrollments_student ON class_enrollments(student_id);
CREATE INDEX idx_class_enrollments_class ON class_enrollments(class_id);

-- ── RLS ──
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- Classes: Teachers manage own, students view enrolled
CREATE POLICY "classes_teacher_all" ON classes FOR ALL TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "classes_student_select" ON classes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_enrollments
      WHERE student_id = auth.uid() AND class_id = classes.id
    )
  );

-- Class Enrollments: users see own, teachers see their classes' enrollments
CREATE POLICY "class_enroll_select" ON class_enrollments FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM classes WHERE id = class_enrollments.class_id AND teacher_id = auth.uid()
    )
  );

-- Students can insert their own enrollment (join via code)
CREATE POLICY "class_enroll_insert" ON class_enrollments FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Teachers can delete enrollments from their classes
CREATE POLICY "class_enroll_delete" ON class_enrollments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes WHERE id = class_enrollments.class_id AND teacher_id = auth.uid()
    )
  );
