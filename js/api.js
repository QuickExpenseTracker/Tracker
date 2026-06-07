import { CONFIG } from './config.js';

const { URL, SERVICE_ROLE } = CONFIG.SUPABASE;

const headers = {
    'apikey': SERVICE_ROLE,
    'Authorization': `Bearer ${SERVICE_ROLE}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

export const api = {
    async fetchExpenses({ householdId, page = 1, limit = 20, search = '', category = '', date = '', sortBy = 'date-desc', monthStr = '' }) {
        const offset = (page - 1) * limit;
        let query = `${URL}/rest/v1/expenses?household_token=eq.${householdId}&select=*&limit=${limit}&offset=${offset}`;

        if (monthStr && !date) {
            const [year, month] = monthStr.split('-');
            const startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
            query += `&date=gte.${startOfMonth}&date=lte.${endOfMonth}`;
        }

        if (search) query += `&title=ilike.*${search}*`;
        if (category) query += `&category=eq.${category}`;
        if (date) query += `&date=eq.${date}`;

        const [column, order] = sortBy.split('-');
        query += `&order=${column}.${order}`;

        const response = await fetch(query, { headers });
        if (!response.ok) throw new Error('Failed to fetch expenses');
        
        const countHeader = response.headers.get('content-range');
        const totalCount = countHeader ? parseInt(countHeader.split('/')[1]) : 0;
        
        return {
            data: await response.json(),
            totalCount
        };
    },

    async addExpense(expense) {
        const response = await fetch(`${URL}/rest/v1/expenses`, {
            method: 'POST',
            headers,
            body: JSON.stringify(expense)
        });
        if (!response.ok) throw new Error('Failed to add expense');
        return await response.json();
    },

    async updateExpense(id, expense) {
        const response = await fetch(`${URL}/rest/v1/expenses?id=eq.${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(expense)
        });
        if (!response.ok) throw new Error('Failed to update expense');
        return await response.json();
    },

    async deleteExpense(id) {
        const response = await fetch(`${URL}/rest/v1/expenses?id=eq.${id}`, {
            method: 'DELETE',
            headers
        });
        if (!response.ok) throw new Error('Failed to delete expense');
        return true;
    },

    async getSummary(householdId, monthStr) {
        let startOfMonth, endOfMonth;
        const todayStr = new Date().toISOString().split('T')[0];

        if (monthStr) {
            const [year, month] = monthStr.split('-');
            startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
            endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];
        } else {
            const now = new Date();
            startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        }

        // Month total
        const monthRes = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=gte.${startOfMonth}&date=lte.${endOfMonth}&select=amount`, { headers });
        const monthData = await monthRes.json();
        const totalMonth = monthData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

        // Today total (only accurate for current month, but kept for UI structure)
        const todayRes = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=eq.${todayStr}&select=amount`, { headers });
        const todayData = await todayRes.json();
        const totalToday = todayData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

        // Category breakdown
        const categoryRes = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=gte.${startOfMonth}&date=lte.${endOfMonth}&select=category,amount`, { headers });
        const categoryData = await categoryRes.json();
        const breakdown = categoryData.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

        return { totalMonth, totalToday, breakdown };
    },

    async getComparison(householdId, monthStr) {
        let startOfSelectedMonth, startOfPreviousMonth, endOfPreviousMonth, startOfSelectedMonthStr, endOfSelectedMonthStr;
        const now = new Date();
        
        if (monthStr) {
            const [year, month] = monthStr.split('-');
            startOfSelectedMonth = new Date(year, month - 1, 1);
            startOfPreviousMonth = new Date(year, month - 2, 1).toISOString().split('T')[0];
            endOfPreviousMonth = new Date(year, month - 1, 0).toISOString().split('T')[0];
        } else {
            startOfSelectedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
            endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        }

        startOfSelectedMonthStr = startOfSelectedMonth.toISOString().split('T')[0];
        endOfSelectedMonthStr = new Date(startOfSelectedMonth.getFullYear(), startOfSelectedMonth.getMonth() + 1, 0).toISOString().split('T')[0];

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Previous month total
        const lastMonthRes = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=gte.${startOfPreviousMonth}&date=lte.${endOfPreviousMonth}&select=amount`, { headers });
        const lastMonthData = await lastMonthRes.json();
        const totalLastMonth = lastMonthData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

        // Yesterday total
        const yesterdayRes = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=eq.${yesterdayStr}&select=amount`, { headers });
        const yesterdayData = await yesterdayRes.json();
        const totalYesterday = yesterdayData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

        // Daily data for the selected month chart
        const chartRes = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=gte.${startOfSelectedMonthStr}&date=lte.${endOfSelectedMonthStr}&select=date,amount&order=date.asc`, { headers });
        const chartDataRaw = await chartRes.json();
        
        const dailyTotals = chartDataRaw.reduce((acc, item) => {
            acc[item.date] = (acc[item.date] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

        return { totalLastMonth, totalYesterday, dailyTotals };
    },

    async getYearlyData(householdId, year) {
        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;
        const response = await fetch(`${URL}/rest/v1/expenses?household_token=eq.${householdId}&date=gte.${startOfYear}&date=lte.${endOfYear}&select=date,amount`, { headers });
        if (!response.ok) throw new Error('Failed to fetch yearly data');
        
        const raw = await response.json();
        // Group by month
        const monthlyTotals = Array(12).fill(0);
        raw.forEach(item => {
            const date = new Date(item.date);
            const monthIndex = date.getMonth(); // 0-11
            monthlyTotals[monthIndex] += parseFloat(item.amount);
        });
        
        return monthlyTotals;
    },

    async addLog(log) {
        const response = await fetch(`${URL}/rest/v1/activity_log`, {
            method: 'POST',
            headers,
            body: JSON.stringify(log)
        });
        return response.ok;
    },

    async fetchLogs({ householdId, page = 1, limit = 20 }) {
        const offset = (page - 1) * limit;
        const response = await fetch(`${URL}/rest/v1/activity_log?household_token=eq.${householdId}&order=timestamp.desc&limit=${limit}&offset=${offset}`, { headers });
        if (!response.ok) throw new Error('Failed to fetch logs');
        
        const countHeader = response.headers.get('content-range');
        const totalCount = countHeader ? parseInt(countHeader.split('/')[1]) : 0;
        
        return {
            data: await response.json(),
            totalCount
        };
    },

    // --- Budget & Settings ---
    async getSettings(householdId) {
        const response = await fetch(`${URL}/rest/v1/household_settings?household_token=eq.${householdId}`, { headers });
        const data = await response.json();
        return data.length ? data[0] : null;
    },

    async updateBudget(householdId, amount) {
        const payload = { household_token: householdId, monthly_budget: amount, updated_at: new Date().toISOString() };
        const response = await fetch(`${URL}/rest/v1/household_settings`, {
            method: 'POST', // UPSERT logic
            headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Failed to update budget');
        return true;
    },

    // --- Recurring Expenses ---
    async getRecurring(householdId) {
        const response = await fetch(`${URL}/rest/v1/recurring_expenses?household_token=eq.${householdId}&order=created_at.desc`, { headers });
        if (!response.ok) throw new Error('Failed to fetch recurring expenses');
        return await response.json();
    },

    async addRecurring(recurring) {
        const response = await fetch(`${URL}/rest/v1/recurring_expenses`, {
            method: 'POST',
            headers,
            body: JSON.stringify(recurring)
        });
        if (!response.ok) throw new Error('Failed to add recurring expense');
        return await response.json();
    },

    async updateRecurring(id, recurring) {
        const response = await fetch(`${URL}/rest/v1/recurring_expenses?id=eq.${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(recurring)
        });
        if (!response.ok) throw new Error('Failed to update recurring expense');
        return await response.json();
    },

    async deleteRecurring(id) {
        const response = await fetch(`${URL}/rest/v1/recurring_expenses?id=eq.${id}`, {
            method: 'DELETE',
            headers
        });
        if (!response.ok) throw new Error('Failed to delete recurring expense');
        return true;
    }
};
