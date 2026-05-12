-- Create the expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by TEXT NOT NULL, -- User email who added the entry
    household_token TEXT NOT NULL, -- Shared key for group access
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_type TEXT NOT NULL,
    item_title TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    household_token TEXT NOT NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_expenses_household ON expenses(household_token);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_logs_household ON activity_log(household_token);

-- Migration for existing tables (Run these if tables already exist)
-- ALTER TABLE expenses ADD COLUMN household_token TEXT;
-- ALTER TABLE activity_log ADD COLUMN household_token TEXT;
