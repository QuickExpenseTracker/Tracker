-- Create the expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by TEXT NOT NULL, -- User email or UID from Firebase
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type TEXT NOT NULL, -- 'added', 'updated', 'deleted'
    item_title TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_name TEXT NOT NULL,
    created_by TEXT NOT NULL -- User email or UID from Firebase
);

-- Enable Row Level Security (RLS)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Create policies for expenses (Users can only see/edit their own data)
CREATE POLICY "Users can manage their own expenses" ON expenses
    FOR ALL
    USING (created_by = (select auth.email()::text) OR created_by = (select auth.uid()::text));

-- Create policies for activity_log
CREATE POLICY "Users can manage their own logs" ON activity_log
    FOR ALL
    USING (created_by = (select auth.email()::text) OR created_by = (select auth.uid()::text));

-- Indices for performance
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_logs_created_by ON activity_log(created_by);
