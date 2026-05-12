import { CONFIG } from './config.js';

const { URL, SERVICE_ROLE } = CONFIG.SUPABASE;

const headers = {
    'apikey': SERVICE_ROLE,
    'Authorization': `Bearer ${SERVICE_ROLE}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

export const api = {
    async fetchExpenses({ userId, page = 1, limit = 20, search = '', category = '', date = '', sortBy = 'date-desc' }) {
        const offset = (page - 1) * limit;
        let query = `${URL}/rest/v1/expenses?created_by=eq.${userId}&select=*&limit=${limit}&offset=${offset}`;

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

    async getSummary(userId) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const today = now.toISOString().split('T')[0];

        // Month total
        const monthRes = await fetch(`${URL}/rest/v1/expenses?created_by=eq.${userId}&date=gte.${startOfMonth}&select=amount`, { headers });
        const monthData = await monthRes.json();
        const totalMonth = monthData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

        // Today total
        const todayRes = await fetch(`${URL}/rest/v1/expenses?created_by=eq.${userId}&date=eq.${today}&select=amount`, { headers });
        const todayData = await todayRes.json();
        const totalToday = todayData.reduce((sum, item) => sum + parseFloat(item.amount), 0);

        // Category breakdown
        const categoryRes = await fetch(`${URL}/rest/v1/expenses?created_by=eq.${userId}&date=gte.${startOfMonth}&select=category,amount`, { headers });
        const categoryData = await categoryRes.json();
        const breakdown = categoryData.reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

        return { totalMonth, totalToday, breakdown };
    },

    async addLog(log) {
        const response = await fetch(`${URL}/rest/v1/activity_log`, {
            method: 'POST',
            headers,
            body: JSON.stringify(log)
        });
        return response.ok;
    },

    async fetchLogs(userId) {
        const response = await fetch(`${URL}/rest/v1/activity_log?created_by=eq.${userId}&order=timestamp.desc&limit=50`, { headers });
        if (!response.ok) throw new Error('Failed to fetch logs');
        return await response.json();
    }
};
