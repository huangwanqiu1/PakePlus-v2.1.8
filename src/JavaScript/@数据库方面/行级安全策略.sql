-- Supabase Row Level Security (RLS) Policies
-- 为所有表启用行级安全策略

-- ============================================
-- 0. 辅助函数（用于打破循环依赖）
-- ============================================

-- 检查用户是否是项目的所有者（使用 SECURITY DEFINER 打破循环依赖）
CREATE OR REPLACE FUNCTION is_project_owner(project_uuid VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE project_id = project_uuid
    AND user_id = auth.uid()
  );
$$;

-- 检查用户是否是项目的成员（带班）
CREATE OR REPLACE FUNCTION is_project_member(project_uuid VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_projects
    WHERE project_id = project_uuid
    AND user_id = auth.uid()
  );
$$;

-- 检查手机号是否已注册（用于登录验证）
CREATE OR REPLACE FUNCTION check_phone_exists(phone_number VARCHAR)
RETURNS TABLE(user_id UUID, email VARCHAR, login_name VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, email, login_name
  FROM users
  WHERE phone = phone_number
  LIMIT 1;
$$;

-- 检查邮箱是否已注册（用于注册验证）
CREATE OR REPLACE FUNCTION check_email_exists(email_address VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE email = email_address
  );
$$;

-- 批量检查手机号是否已注册（用于添加带班时筛选已注册用户）
-- 只返回手机号，不返回其他敏感信息
CREATE OR REPLACE FUNCTION get_registered_phones(phone_list VARCHAR[])
RETURNS TABLE(phone VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.phone
  FROM users u
  WHERE u.phone = ANY(phone_list);
$$;

-- 根据手机号列表获取用户ID和手机号（用于添加带班）
-- 只返回必要字段，不返回敏感信息
CREATE OR REPLACE FUNCTION get_users_by_phones(phone_list VARCHAR[])
RETURNS TABLE(user_id UUID, phone VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.user_id, u.phone
  FROM users u
  WHERE u.phone = ANY(phone_list);
$$;

-- 注册新用户（用于注册流程，绕过 RLS）
CREATE OR REPLACE FUNCTION register_user(
  p_phone VARCHAR,
  p_email VARCHAR,
  p_login_name VARCHAR,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO users (phone, email, login_name, user_id)
  VALUES (p_phone, p_email, p_login_name, p_user_id);
$$;

-- 检查当前用户是否可以访问目标用户的信息（同一项目的成员）
CREATE OR REPLACE FUNCTION can_access_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- 可以访问自己的信息
  SELECT 
    target_user_id = auth.uid() OR
    -- 或者目标用户和当前用户在同一个项目中
    EXISTS (
      SELECT 1 FROM user_projects up1
      WHERE up1.user_id = target_user_id
      AND EXISTS (
        SELECT 1 FROM user_projects up2
        WHERE up2.project_id = up1.project_id
        AND up2.user_id = auth.uid()
      )
    )
    -- 或者当前用户是目标用户所在项目的所有者
    OR EXISTS (
      SELECT 1 FROM user_projects up
      JOIN projects p ON p.project_id = up.project_id
      WHERE up.user_id = target_user_id
      AND p.user_id = auth.uid()
    );
$$;

-- ============================================
-- 1. users 表策略
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 允许所有用户插入（包括未认证用户，用于注册）
CREATE POLICY "users_allow_insert" ON public.users
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- 已认证用户可以查询：
-- 1. 自己的记录
-- 2. 同一项目的其他成员记录
CREATE POLICY "users_allow_select" ON public.users
FOR SELECT TO authenticated
USING (can_access_user(user_id));

-- 允许已认证用户更新自己的记录
CREATE POLICY "users_allow_update" ON public.users
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 只有用户本人允许删除自己的账户
CREATE POLICY "users_allow_delete_own" ON public.users
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- 2. projects 表策略
-- ============================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 允许所有用户插入
CREATE POLICY "projects_allow_insert" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (true);

-- user_id创建的和被授权的用户允许查询
CREATE POLICY "projects_allow_select" ON public.projects
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR
  is_project_member(project_id)
);

-- user_id创建的和被授权的用户允许更新
CREATE POLICY "projects_allow_update" ON public.projects
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid() OR
  is_project_member(project_id)
)
WITH CHECK (
  user_id = auth.uid() OR
  is_project_member(project_id)
);

-- 只有user_id创建的用户允许删除
CREATE POLICY "projects_allow_delete_own" ON public.projects
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================
-- 3. user_projects 表策略
-- ============================================
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

-- 允许用户查询自己的记录，也允许项目所有者查询该项目的所有带班人员
CREATE POLICY "user_projects_allow_select" ON public.user_projects
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR
  is_project_owner(project_id)
);

-- 项目所有者可以为项目添加任何用户，用户也可以添加自己
CREATE POLICY "user_projects_allow_insert" ON public.user_projects
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() OR
  is_project_owner(project_id)
);

-- 项目所有者可以更新项目的任何用户权限，用户也可以更新自己的记录
CREATE POLICY "user_projects_allow_update" ON public.user_projects
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid() OR
  is_project_owner(project_id)
)
WITH CHECK (
  user_id = auth.uid() OR
  is_project_owner(project_id)
);

-- 项目所有者可以删除项目的任何用户，用户也可以删除自己的记录
CREATE POLICY "user_projects_allow_delete" ON public.user_projects
FOR DELETE TO authenticated
USING (
  user_id = auth.uid() OR
  is_project_owner(project_id)
);

-- ============================================
-- 4. attendance_records 表策略
-- ============================================
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "attendance_records_allow_select" ON public.attendance_records
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = attendance_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者可以插入，被授权的用户根据perm_add_work_record决定
CREATE POLICY "attendance_records_allow_insert" ON public.attendance_records
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = attendance_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_add_work_record = true
         ))
  )
);

-- 项目创建者可以更新，被授权的用户根据perm_edit_work_record决定
CREATE POLICY "attendance_records_allow_update" ON public.attendance_records
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = attendance_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_work_record = true
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = attendance_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_work_record = true
         ))
  )
);

-- 项目创建者可以删除，被授权的用户根据perm_delete_work_record决定
CREATE POLICY "attendance_records_allow_delete" ON public.attendance_records
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = attendance_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_delete_work_record = true
         ))
  )
);

-- ============================================
-- 5. settlement_records 表策略
-- ============================================
ALTER TABLE public.settlement_records ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "settlement_records_allow_select" ON public.settlement_records
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = settlement_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者可以插入，被授权的用户根据perm_add_settlement决定
CREATE POLICY "settlement_records_allow_insert" ON public.settlement_records
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = settlement_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_add_settlement = true
         ))
  )
);

-- 项目创建者可以更新，被授权的用户根据perm_edit_settlement决定
CREATE POLICY "settlement_records_allow_update" ON public.settlement_records
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = settlement_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_settlement = true
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = settlement_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_settlement = true
         ))
  )
);

-- 项目创建者可以删除，被授权的用户根据perm_delete_settlement决定
CREATE POLICY "settlement_records_allow_delete" ON public.settlement_records
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = settlement_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_delete_settlement = true
         ))
  )
);

-- ============================================
-- 6. project_expenses 表策略
-- ============================================
ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "project_expenses_allow_select" ON public.project_expenses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_expenses.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者可以插入，被授权的用户根据perm_add_expense决定
CREATE POLICY "project_expenses_allow_insert" ON public.project_expenses
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_expenses.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_add_expense = true
         ))
  )
);

-- 项目创建者可以更新，被授权的用户根据perm_edit_expense决定
CREATE POLICY "project_expenses_allow_update" ON public.project_expenses
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_expenses.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_expense = true
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_expenses.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_expense = true
         ))
  )
);

-- 项目创建者可以删除，被授权的用户根据perm_delete_expense决定
CREATE POLICY "project_expenses_allow_delete" ON public.project_expenses
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_expenses.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_delete_expense = true
         ))
  )
);

-- ============================================
-- 7. project_income 表策略
-- ============================================
ALTER TABLE public.project_income ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "project_income_allow_select" ON public.project_income
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_income.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者可以插入，被授权的用户根据perm_add_income决定
CREATE POLICY "project_income_allow_insert" ON public.project_income
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_income.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_add_income = true
         ))
  )
);

-- 项目创建者可以更新，被授权的用户根据perm_edit_income决定
CREATE POLICY "project_income_allow_update" ON public.project_income
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_income.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_income = true
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_income.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_edit_income = true
         ))
  )
);

-- 项目创建者可以删除，被授权的用户根据perm_delete_income决定
CREATE POLICY "project_income_allow_delete" ON public.project_income
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = project_income.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
           AND user_projects.perm_delete_income = true
         ))
  )
);

-- ============================================
-- 8. employees 表策略（基于项目的权限控制）
-- ============================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "employees_allow_select" ON public.employees
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = employees.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以插入
CREATE POLICY "employees_allow_insert" ON public.employees
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = employees.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以更新
CREATE POLICY "employees_allow_update" ON public.employees
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = employees.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = employees.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以删除
CREATE POLICY "employees_allow_delete" ON public.employees
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = employees.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- ============================================
-- 9. construction_logs 表策略（基于项目的权限控制）
-- ============================================
ALTER TABLE public.construction_logs ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "construction_logs_allow_select" ON public.construction_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = construction_logs.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以插入
CREATE POLICY "construction_logs_allow_insert" ON public.construction_logs
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = construction_logs.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以更新
CREATE POLICY "construction_logs_allow_update" ON public.construction_logs
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = construction_logs.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = construction_logs.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以删除
CREATE POLICY "construction_logs_allow_delete" ON public.construction_logs
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = construction_logs.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- ============================================
-- 10. work_records 表策略（基于项目的权限控制）
-- ============================================
ALTER TABLE public.work_records ENABLE ROW LEVEL SECURITY;

-- 项目创建者和被授权的用户都可以查询
CREATE POLICY "work_records_allow_select" ON public.work_records
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = work_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以插入
CREATE POLICY "work_records_allow_insert" ON public.work_records
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = work_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以更新
CREATE POLICY "work_records_allow_update" ON public.work_records
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = work_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = work_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- 项目创建者和被授权的用户都可以删除
CREATE POLICY "work_records_allow_delete" ON public.work_records
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.project_id = work_records.project_id
    AND (projects.user_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM public.user_projects
           WHERE user_projects.project_id = projects.project_id
           AND user_projects.user_id = auth.uid()
         ))
  )
);

-- ============================================
-- 完成：所有表的RLS策略已创建
-- ============================================