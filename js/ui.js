import { api } from './api.js';
import { getCurrentUser } from './auth.js';
import { formatDate, formatCurrency, debounce, showToast, setLoading, exportToCSV, getTodayDate } from './utils.js';

const getMonthStr = () => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${m}`;
};

// State
let state = {
    page: 1,
    limit: 20,
    search: '',
    category: '',
    date: '',
    sortBy: 'date-desc',
    view: 'expenses',
    expenses: [],
    totalCount: 0,
    chart: null,
    logPage: 1,
    logTotalCount: 0,
    householdToken: localStorage.getItem('household_token') || '',
    selectedMonth: getMonthStr(),
    recurringExpenses: [],
    monthlyBudget: 0,
    shoppingThreshold: 5000,
    savingsGoal: 0,
    reportEmail: '',
    yearlyChart: null,
    dowChart: null,
    bannerDismissed: false,
    activeTag: ''
};

// Elements
const els = {
    expenseList: document.getElementById('expense-list'),
    totalMonth: document.getElementById('total-month'),
    totalToday: document.getElementById('total-today'),
    pageInfo: document.getElementById('page-info'),
    prevBtn: document.getElementById('prev-page'),
    nextBtn: document.getElementById('next-page'),
    expenseModal: document.getElementById('expense-modal'),
    deleteModal: document.getElementById('delete-modal'),
    expenseForm: document.getElementById('expense-form'),
    categoryBreakdown: document.getElementById('category-breakdown'),
    activityList: document.getElementById('activity-list'),
    logPageInfo: document.getElementById('log-page-info'),
    prevLogsBtn: document.getElementById('prev-logs'),
    nextLogsBtn: document.getElementById('next-logs'),
    householdView: document.getElementById('household-view'),
    householdInput: document.getElementById('household-key-input'),
    saveKeyBtn: document.getElementById('save-key-btn'),
    keyError: document.getElementById('key-error'),
    loadingOverlay: document.getElementById('loading-overlay'),
    
    // New Budget & Recurring Elements
    budgetSpentText: document.getElementById('budget-spent-text'),
    budgetLimitText: document.getElementById('budget-limit-text'),
    budgetProgressFill: document.getElementById('budget-progress-fill'),
    recurringList: document.getElementById('recurring-list'),
    recurringModal: document.getElementById('recurring-modal'),
    recurringForm: document.getElementById('recurring-form'),
    budgetModal: document.getElementById('budget-modal'),
    budgetForm: document.getElementById('budget-form'),
    setBudgetBtn: document.getElementById('set-budget-btn'),
    addRecurringBtn: document.getElementById('add-recurring-btn'),
    yearlyChartYear: document.getElementById('yearly-chart-year'),
    overspendModal: document.getElementById('overspend-modal'),
    overspendMessage: document.getElementById('overspend-message'),
    overspendReasonGroup: document.getElementById('overspend-reason-group'),
    overspendReason: document.getElementById('overspend-reason'),
    overspendCancelBtn: document.getElementById('overspend-cancel-btn'),
    overspendProceedBtn: document.getElementById('overspend-proceed-btn')
};

let pendingExpense = null;
let pendingExpenseId = null;

// Persistence
const loadState = () => {
    const saved = localStorage.getItem('expense_tracker_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed };
        // Sync UI inputs with state
        document.getElementById('search-input').value = state.search;
        document.getElementById('filter-category').value = state.category;
        document.getElementById('filter-date').value = state.date;
        document.getElementById('sort-by').value = state.sortBy;
        document.getElementById('items-per-page').value = state.limit;
        
        if (!state.selectedMonth) state.selectedMonth = getMonthStr();
        document.getElementById('global-month').value = state.selectedMonth;
        
        const activeTab = document.querySelector(`.tab-btn[data-tab="${state.view}"]`);
        if (activeTab) setActiveTab(activeTab);
    }
};

const saveState = () => {
    localStorage.setItem('expense_tracker_state', JSON.stringify({
        limit: state.limit,
        search: state.search,
        category: state.category,
        date: state.date,
        sortBy: state.sortBy,
        view: state.view,
        selectedMonth: state.selectedMonth
    }));
};

// Rendering
// ── Utility: Parse hashtags from notes ──────────────────────
const parseTags = (notes) => {
    if (!notes) return [];
    const matches = notes.match(/#(\w+)/g);
    return matches ? [...new Set(matches)] : [];
};

// ── Feature 1: Budget Warning Banner ────────────────────────
const renderBudgetBanner = (perc, totalMonth, budget) => {
    const banner = document.getElementById('budget-warning-banner');
    const msg = document.getElementById('banner-message');
    if (!banner || state.bannerDismissed) return;
    
    if (perc >= 100) {
        banner.className = 'budget-banner critical';
        msg.textContent = `🚨 Budget exceeded! Spent ${formatCurrency(totalMonth)} of ${formatCurrency(budget)} this month.`;
        banner.classList.remove('hidden');
    } else if (perc >= 80) {
        banner.className = 'budget-banner warning';
        msg.textContent = `⚠️ You've used ${perc.toFixed(0)}% of your budget. Only ${formatCurrency(budget - totalMonth)} remaining.`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
};

// ── Feature 4: Savings Progress Ring ────────────────────────
const renderSavingsRing = (totalMonth, budget, savingsGoal) => {
    const ringFill = document.getElementById('ring-fill');
    const centerText = document.getElementById('ring-center-text');
    const statusEl = document.getElementById('savings-status');
    const subEl = document.getElementById('savings-sub');
    if (!ringFill) return;
    
    const CIRCUMFERENCE = 314.16; // 2π × 50
    const saved = Math.max(0, budget - totalMonth);
    
    centerText.textContent = formatCurrency(saved);
    
    if (savingsGoal <= 0) {
        ringFill.style.strokeDashoffset = CIRCUMFERENCE;
        statusEl.textContent = 'Set a savings goal in Settings';
        subEl.textContent = '';
        return;
    }
    
    const ratio = Math.min(saved / savingsGoal, 1);
    const offset = CIRCUMFERENCE - ratio * CIRCUMFERENCE;
    ringFill.style.strokeDashoffset = offset;
    
    if (saved <= 0) {
        ringFill.style.stroke = '#ef4444';
        statusEl.textContent = 'Over budget — ₹0 saved this month';
        subEl.textContent = `Goal: ${formatCurrency(savingsGoal)}`;
    } else if (ratio >= 1) {
        ringFill.style.stroke = '#4ade80';
        statusEl.textContent = `🎉 Savings goal reached!`;
        subEl.textContent = `Saved ${formatCurrency(saved)} of ${formatCurrency(savingsGoal)}`;
    } else {
        ringFill.style.stroke = '#4ade80';
        statusEl.textContent = `Saved ${formatCurrency(saved)} of ${formatCurrency(savingsGoal)}`;
        subEl.textContent = `${(ratio * 100).toFixed(0)}% of your goal achieved`;
    }
};

// ── Feature 5: Day-of-Week Chart ────────────────────────────
export const renderDayOfWeekChart = async () => {
    if (!state.householdToken) return;
    try {
        const avgByDow = await api.getDayOfWeekData(state.householdToken, 3);
        // Re-order: Mon(1)…Sun(0) for a Mon-first display
        const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const values = [avgByDow[1], avgByDow[2], avgByDow[3], avgByDow[4], avgByDow[5], avgByDow[6], avgByDow[0]];
        
        const maxVal = Math.max(...values);
        const bgColors = values.map(v => v === maxVal && maxVal > 0 ? '#f97316' : 'rgba(139,92,246,0.55)');
        
        const ctx = document.getElementById('day-of-week-chart').getContext('2d');
        if (state.dowChart) state.dowChart.destroy();
        
        state.dowChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data: values, backgroundColor: bgColors, borderRadius: 6, borderSkipped: false }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => `Avg: ${formatCurrency(ctx.raw)}` },
                        backgroundColor: '#1e293b',
                        titleFont: { family: 'Outfit' },
                        bodyFont: { family: 'Outfit' }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
        
        // Update insight text
        const insight = document.getElementById('dow-insight');
        if (insight && maxVal > 0) {
            const maxIdx = values.indexOf(maxVal);
            insight.textContent = `You spend most on ${labels[maxIdx]}s (avg ${formatCurrency(maxVal)})`;
        }
    } catch (err) {
        console.error('Day-of-week chart error', err);
    }
};

export const renderSummary = async () => {
    if (!state.householdToken) return;
    try {
        const settings = await api.getSettings(state.householdToken);
        if (settings) {
            state.monthlyBudget = parseFloat(settings.monthly_budget) || 0;
            state.shoppingThreshold = parseFloat(settings.shopping_threshold) || 5000;
            state.savingsGoal = parseFloat(settings.savings_goal) || 0;
            state.reportEmail = settings.report_email || '';
        }

        const { totalMonth, totalToday, breakdown } = await api.getSummary(state.householdToken, state.selectedMonth);
        els.totalMonth.textContent = formatCurrency(totalMonth);
        els.totalToday.textContent = formatCurrency(totalToday);

        if (els.budgetLimitText) {
            els.budgetLimitText.textContent = `of ${formatCurrency(state.monthlyBudget)}`;
            els.budgetSpentText.textContent = `${formatCurrency(totalMonth)} spent`;
            
            if (state.monthlyBudget > 0) {
                const perc = (totalMonth / state.monthlyBudget) * 100;
                els.budgetProgressFill.style.width = `${Math.min(perc, 100)}%`;
                if (perc < 80) els.budgetProgressFill.style.backgroundColor = '#4ade80';
                else if (perc < 100) els.budgetProgressFill.style.backgroundColor = '#f97316';
                else els.budgetProgressFill.style.backgroundColor = '#ef4444';
                renderBudgetBanner(perc, totalMonth, state.monthlyBudget);
            } else {
                els.budgetProgressFill.style.width = `0%`;
            }
        }
        
        // Render breakdown in reports tab
        els.categoryBreakdown.innerHTML = Object.entries(breakdown).length 
            ? Object.entries(breakdown).map(([cat, amount]) => `
                <div class="breakdown-item">
                    <span class="category-badge">${cat}</span>
                    <span class="amount">${formatCurrency(amount)}</span>
                </div>
            `).join('')
            : '<p class="empty-state">No data for this month.</p>';

        renderYearlyChart();
        renderDayOfWeekChart();
        renderSavingsRing(totalMonth, state.monthlyBudget, state.savingsGoal);
    } catch (error) {
        console.error('Summary error:', error);
    }
};

export const renderYearlyChart = async () => {
    if (!state.householdToken) return;
    try {
        const year = els.yearlyChartYear.value;
        const monthlyTotals = await api.getYearlyData(state.householdToken, year);
        const budgetThreshold = state.monthlyBudget || 0;

        const ctx = document.getElementById('yearly-expense-chart').getContext('2d');
        if (state.yearlyChart) {
            state.yearlyChart.destroy();
        }

        const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const bgColors = monthlyTotals.map(amount => {
            if (budgetThreshold > 0) {
                if (amount > budgetThreshold) return '#ef4444'; // Red
                // Due to floating point math, exact equality is rare, but if they hit it perfectly, use green.
                // Otherwise use blue for under budget.
                if (Math.abs(amount - budgetThreshold) < 0.01) return '#22c55e'; // Green
                return '#0ea5e9'; // Blue
            }
            return '#0ea5e9'; // Blue by default
        });

        const datasets = [{
            type: 'bar',
            label: 'Monthly Expenses',
            data: monthlyTotals,
            backgroundColor: bgColors,
            borderColor: '#1e293b',
            borderWidth: 2,
            borderRadius: 4
        }];

        if (budgetThreshold > 0) {
            datasets.push({
                type: 'line',
                label: 'Budget Threshold',
                data: Array(12).fill(budgetThreshold),
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                order: 0
            });
        }

        state.yearlyChart = new Chart(ctx, {
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#1e293b',
                        titleFont: { family: 'Outfit' },
                        bodyFont: { family: 'Outfit' }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 10 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8', font: { size: 10 } }
                    }
                }
            }
        });
    } catch (err) {
        console.error('Error rendering yearly chart', err);
    }
};

const renderChart = (dailyTotals) => {
    const ctx = document.getElementById('expense-chart').getContext('2d');
    const labels = Object.keys(dailyTotals);
    const data = Object.values(dailyTotals);

    if (state.chart) {
        state.chart.destroy();
    }

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(date => new Date(date).getDate()),
            datasets: [{
                label: 'Daily Expenses (₹)',
                data: data,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#8b5cf6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1e293b',
                    titleFont: { family: 'Outfit' },
                    bodyFont: { family: 'Outfit' }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            }
        }
    });
};

export const renderAnalytics = async () => {
    if (!state.householdToken) return;
    
    try {
        const { totalLastMonth, totalYesterday, dailyTotals } = await api.getComparison(state.householdToken, state.selectedMonth);
        
        // Month comparison
        const monthRes = await api.getSummary(state.householdToken, state.selectedMonth);
        const thisMonthTotal = monthRes.totalMonth;
        const monthDiff = thisMonthTotal - totalLastMonth;
        const monthPerc = totalLastMonth ? (monthDiff / totalLastMonth * 100).toFixed(0) : (thisMonthTotal ? 100 : 0);
        
        const mBadge = document.getElementById('month-diff');
        mBadge.textContent = `${monthPerc > 0 ? '+' : ''}${monthPerc}%`;
        mBadge.className = `diff-badge ${monthPerc > 0 ? 'up' : 'down'}`;

        // Today comparison
        const todayTotal = monthRes.totalToday;
        const todayDiff = todayTotal - totalYesterday;
        const todayPerc = totalYesterday ? (todayDiff / totalYesterday * 100).toFixed(0) : (todayTotal ? 100 : 0);
        
        const tBadge = document.getElementById('today-diff');
        tBadge.textContent = `${todayPerc > 0 ? '+' : ''}${todayPerc}%`;
        tBadge.className = `diff-badge ${todayPerc > 0 ? 'up' : 'down'}`;

        // Hide daily card if not viewing the current real-world month
        const isCurrentMonth = state.selectedMonth === getMonthStr();
        const dailyCard = document.getElementById('daily-summary-card');
        if (dailyCard) {
            dailyCard.style.display = isCurrentMonth ? 'flex' : 'none';
        }

        // Chart
        renderChart(dailyTotals);
    } catch (error) {
        console.error('Analytics error:', error);
    }
};

export const renderExpenses = async () => {
    if (!state.householdToken) return;
    
    setLoading(true);
    try {
        const { data, totalCount } = await api.fetchExpenses({
            householdId: state.householdToken,
            page: state.page,
            limit: state.limit,
            search: state.search,
            category: state.category,
            date: state.date,
            sortBy: state.sortBy,
            monthStr: state.selectedMonth
        });
        
        state.expenses = data;
        state.totalCount = totalCount;

        // ── Feature 3: Tag filter chips row ──
        const allTags = [];
        data.forEach(item => parseTags(item.notes).forEach(t => { if (!allTags.includes(t)) allTags.push(t); }));
        let tagFilterEl = document.getElementById('tag-filters');
        if (!tagFilterEl) {
            tagFilterEl = document.createElement('div');
            tagFilterEl.id = 'tag-filters';
            tagFilterEl.className = 'tag-filters';
            els.expenseList.parentNode.insertBefore(tagFilterEl, els.expenseList);
        }
        if (allTags.length > 0) {
            const clearBtn = state.activeTag ? `<span class="tag-pill active" data-tag="">✕ Clear</span>` : '';
            tagFilterEl.innerHTML = clearBtn + allTags.map(t =>
                `<span class="tag-pill ${t === state.activeTag ? 'active' : ''}" data-tag="${t}">${t}</span>`
            ).join('');
        } else {
            tagFilterEl.innerHTML = '';
        }
        tagFilterEl.onclick = (e) => {
            const pill = e.target.closest('.tag-pill');
            if (!pill) return;
            state.activeTag = pill.dataset.tag || '';
            renderExpenses();
        };

        // ── Filter by active tag ──
        const displayData = state.activeTag
            ? data.filter(item => parseTags(item.notes).includes(state.activeTag))
            : data;

        // ── Render cards ──
        els.expenseList.innerHTML = displayData.length
            ? displayData.map(item => {
                const tagPills = parseTags(item.notes);
                const tagHtml = tagPills.map(t => `<span class="tag-pill" data-tag="${t}">${t}</span>`).join('');
                return `
                <div class="expense-card">
                    <div class="expense-info">
                        <div class="expense-title">${item.title}</div>
                        <div class="expense-meta">
                            <span class="category-badge">${item.category}</span>
                            <span>${formatDate(item.date)}</span>
                        </div>
                        ${item.notes ? `<div class="expense-meta" style="margin-top:4px; font-style:italic">${item.notes}</div>` : ''}
                        ${tagHtml ? `<div style="margin-top:5px;">${tagHtml}</div>` : ''}
                    </div>
                    <div class="expense-amount-actions">
                        <div class="expense-amount">${formatCurrency(item.amount)}</div>
                        <div class="expense-actions">
                            <button class="clone-btn" data-id="${item.id}" title="Clone expense">📋</button>
                            <button class="btn btn-outline btn-sm edit-btn" data-id="${item.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline btn-sm delete-btn" data-id="${item.id}">
                                <i class="fas fa-trash text-danger"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            }).join('')
            : '<div class="empty-state">No expenses found</div>';
            
        updatePagination();
    } catch (error) {
        showToast('Error loading expenses', true);
    } finally {
        setLoading(false);
    }
};

const updatePagination = () => {
    const totalPages = Math.ceil(state.totalCount / state.limit) || 1;
    els.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
    els.prevBtn.disabled = state.page <= 1;
    els.nextBtn.disabled = state.page >= totalPages;
};

export const renderLogs = async () => {
    if (!state.householdToken) return;
    try {
        const { data, totalCount } = await api.fetchLogs({
            householdId: state.householdToken,
            page: state.logPage,
            limit: 20
        });
        
        state.logTotalCount = totalCount;
        
        els.activityList.innerHTML = data.length 
            ? data.map(log => `
                <div class="log-item">
                    <div class="log-header">
                        <span class="log-action ${log.action_type}">${log.action_type}</span>
                        <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="log-body">
                        <strong>${log.item_title}</strong> by ${log.user_name}
                    </div>
                </div>
            `).join('')
            : '<p class="empty-state">No activity logs yet.</p>';
            
        updateLogPagination();
    } catch (error) {
        console.error('Logs error:', error);
    }
};

export const processRecurring = async () => {
    if (!state.householdToken) return;
    try {
        const recurringList = await api.getRecurring(state.householdToken);
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const user = getCurrentUser();

        let generated = false;

        for (const item of recurringList) {
            const nextDue = new Date(item.next_due_date);
            if (today >= nextDue) {
                await api.addExpense({
                    title: item.title,
                    amount: item.amount,
                    category: item.category,
                    date: todayStr,
                    notes: `Auto-generated (${item.period})`,
                    created_by: user.email,
                    household_token: state.householdToken
                });
                
                let newDate = new Date(item.next_due_date);
                if (item.period === 'daily') newDate.setDate(newDate.getDate() + 1);
                else if (item.period === 'weekly') newDate.setDate(newDate.getDate() + 7);
                else if (item.period === 'monthly') newDate.setMonth(newDate.getMonth() + 1);
                else if (item.period === 'yearly') newDate.setFullYear(newDate.getFullYear() + 1);
                
                await api.updateRecurring(item.id, { next_due_date: newDate.toISOString().split('T')[0] });
                generated = true;
            }
        }
        
        if (generated) {
            showToast('Recurring expenses processed!');
            if (state.view === 'expenses') renderExpenses();
            if (state.view === 'reports') renderSummary();
            if (state.view === 'recurring') renderRecurring();
        }
    } catch(err) {
        console.error('Process recurring error', err);
    }
};

export const renderRecurring = async () => {
    if (!state.householdToken) return;
    setLoading(true);
    try {
        const data = await api.getRecurring(state.householdToken);
        state.recurringExpenses = data;
        els.recurringList.innerHTML = data.length 
            ? data.map(item => `
                <div class="expense-card">
                    <div class="expense-info">
                        <div class="expense-title">${item.title}</div>
                        <div class="expense-meta">
                            <span class="category-badge">${item.category}</span>
                            <span style="text-transform: capitalize;">Repeats ${item.period}</span>
                        </div>
                        <div class="expense-meta" style="margin-top:4px;">Next Due: ${formatDate(item.next_due_date)}</div>
                    </div>
                    <div class="expense-amount-actions">
                        <div class="expense-amount">${formatCurrency(item.amount)}</div>
                        <div class="expense-actions">
                            <button class="btn btn-outline btn-sm edit-recurring-btn" data-id="${item.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline btn-sm delete-recurring-btn" data-id="${item.id}">
                                <i class="fas fa-trash text-danger"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')
            : '<div class="empty-state">No active subscriptions</div>';
    } catch(err) {
        showToast('Error loading recurring', true);
    } finally {
        setLoading(false);
    }
};

const updateLogPagination = () => {
    const totalPages = Math.ceil(state.logTotalCount / 20) || 1;
    els.logPageInfo.textContent = `Page ${state.logPage} of ${totalPages}`;
    els.prevLogsBtn.disabled = state.logPage <= 1;
    els.nextLogsBtn.disabled = state.logPage >= totalPages;
};

// Events
const setActiveTab = (btn) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(`${tabId}-tab`).classList.add('active');
    state.view = tabId;
    saveState();
    
    if (tabId === 'expenses') {
        renderExpenses();
        renderAnalytics();
    }
    if (tabId === 'reports') renderSummary();
    if (tabId === 'logs') renderLogs();
    if (tabId === 'recurring') renderRecurring();
};

export const initUI = () => {
    loadState();
    setTimeout(processRecurring, 1500); // Process on load
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => setActiveTab(btn));
    });

    // Month picker
    document.getElementById('global-month').addEventListener('change', (e) => {
        state.selectedMonth = e.target.value;
        state.page = 1;
        saveState();
        renderExpenses();
        renderSummary();
        renderAnalytics();
    });

    els.yearlyChartYear.addEventListener('change', () => {
        renderYearlyChart();
    });

    // Filtering & Sorting
    document.getElementById('search-input').addEventListener('input', debounce((e) => {
        state.search = e.target.value;
        state.page = 1;
        saveState();
        renderExpenses();
    }, 400));

    document.getElementById('filter-category').addEventListener('change', (e) => {
        state.category = e.target.value;
        state.page = 1;
        saveState();
        renderExpenses();
    });

    document.getElementById('filter-date').addEventListener('change', (e) => {
        state.date = e.target.value;
        state.page = 1;
        saveState();
        renderExpenses();
    });

    document.getElementById('sort-by').addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        state.page = 1;
        saveState();
        renderExpenses();
    });

    document.getElementById('items-per-page').addEventListener('change', (e) => {
        state.limit = parseInt(e.target.value);
        state.page = 1;
        saveState();
        renderExpenses();
    });

    // Pagination
    els.prevBtn.addEventListener('click', () => {
        if (state.page > 1) {
            state.page--;
            renderExpenses();
        }
    });

    els.nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(state.totalCount / state.limit);
        if (state.page < totalPages) {
            state.page++;
            renderExpenses();
        }
    });

    // Log Pagination
    els.prevLogsBtn.addEventListener('click', () => {
        if (state.logPage > 1) {
            state.logPage--;
            renderLogs();
        }
    });

    els.nextLogsBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(state.logTotalCount / 20);
        if (state.logPage < totalPages) {
            state.logPage++;
            renderLogs();
        }
    });

    // Export
    document.getElementById('export-csv').addEventListener('click', () => {
        const filename = `expense-report-${state.selectedMonth || new Date().toISOString().split('T')[0]}.csv`;
        exportToCSV(state.expenses, filename);
        showToast('Exporting CSV...');
    });

    // Modal logic
    const openModal = (modal, id = null) => {
        modal.classList.add('show');
        if (id) {
            const expense = state.expenses.find(e => e.id === id);
            if (expense) {
                document.getElementById('modal-title').textContent = 'Edit Expense';
                document.getElementById('expense-id').value = expense.id;
                document.getElementById('title').value = expense.title;
                document.getElementById('amount').value = expense.amount;
                document.getElementById('category').value = expense.category;
                document.getElementById('date').value = expense.date;
                document.getElementById('notes').value = expense.notes || '';
            }
        } else if (modal === els.recurringModal) {
            document.getElementById('recurring-modal-title').textContent = 'New Subscription';
            els.recurringForm.reset();
            document.getElementById('recurring-id').value = '';
            document.getElementById('r-next-date').value = getTodayDate();
        }
        // Auto-focus first input
        setTimeout(() => {
            if (modal === els.expenseModal) document.getElementById('title').focus();
            if (modal === els.budgetModal) document.getElementById('budget-amount').focus();
            if (modal === els.recurringModal) document.getElementById('r-title').focus();
        }, 100);
    };

    const closeModal = (modal) => {
        modal.classList.remove('show');
    };

    // Feature 1: Banner dismiss
    document.getElementById('banner-dismiss').addEventListener('click', () => {
        state.bannerDismissed = true;
        document.getElementById('budget-warning-banner').classList.add('hidden');
    });

    document.getElementById('add-expense-btn').addEventListener('click', () => {
        document.getElementById('expense-form').reset();
        document.getElementById('expense-id').value = '';
        document.getElementById('modal-title').textContent = 'New Expense';
        document.getElementById('date').value = getTodayDate();
        document.getElementById('title-suggestions').classList.add('hidden');
        openModal(els.expenseModal);
    });

    els.setBudgetBtn.addEventListener('click', () => {
        document.getElementById('budget-amount').value = state.monthlyBudget || '';
        document.getElementById('shopping-threshold').value = state.shoppingThreshold || 5000;
        document.getElementById('savings-goal').value = state.savingsGoal || '';
        document.getElementById('report-email').value = state.reportEmail || '';
        document.getElementById('resend-api-key').value = localStorage.getItem('resend_api_key') || '';
        openModal(els.budgetModal);
    });
    els.addRecurringBtn.addEventListener('click', () => openModal(els.recurringModal));
    
    document.getElementById('switch-key-btn').addEventListener('click', () => {
        document.getElementById('main-view').classList.add('hidden');
        els.householdView.classList.remove('hidden');
        els.householdInput.value = state.householdToken;
        els.keyError.classList.add('hidden');
    });

    els.saveKeyBtn.addEventListener('click', () => {
        const key = els.householdInput.value.trim();
        if (key.length < 3) {
            els.keyError.classList.remove('hidden');
            return;
        }
        state.householdToken = key;
        localStorage.setItem('household_token', key);
        els.householdView.classList.add('hidden');
        document.getElementById('main-view').classList.remove('hidden');
        renderExpenses();
        renderAnalytics();
        showToast('Access Granted!');
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.modal'));
        });
    });

    // Event Delegation for List actions (edit, delete, clone)
    els.expenseList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        const cloneBtn = e.target.closest('.clone-btn');
        
        if (editBtn) openModal(els.expenseModal, editBtn.dataset.id);
        if (deleteBtn) {
            window.deleteId = deleteBtn.dataset.id;
            window.deleteType = 'expense';
            els.deleteModal.classList.add('show');
        }
        // Feature 2: Clone expense
        if (cloneBtn) {
            const expense = state.expenses.find(exp => exp.id === cloneBtn.dataset.id);
            if (expense) {
                document.getElementById('modal-title').textContent = 'Clone Expense';
                document.getElementById('expense-id').value = '';
                document.getElementById('title').value = expense.title;
                document.getElementById('amount').value = expense.amount;
                document.getElementById('category').value = expense.category;
                document.getElementById('date').value = getTodayDate();
                document.getElementById('notes').value = expense.notes || '';
                document.getElementById('title-suggestions').classList.add('hidden');
                openModal(els.expenseModal);
            }
        }
    });

    els.recurringList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-recurring-btn');
        const deleteBtn = e.target.closest('.delete-recurring-btn');
        
        if (editBtn) {
            const id = editBtn.dataset.id;
            const recurring = state.recurringExpenses.find(e => e.id === id);
            if (recurring) {
                document.getElementById('recurring-modal-title').textContent = 'Edit Subscription';
                document.getElementById('recurring-id').value = recurring.id;
                document.getElementById('r-title').value = recurring.title;
                document.getElementById('r-amount').value = recurring.amount;
                document.getElementById('r-category').value = recurring.category;
                document.getElementById('r-period').value = recurring.period;
                document.getElementById('r-next-date').value = recurring.next_due_date;
                openModal(els.recurringModal);
            }
        }
        if (deleteBtn) {
            window.deleteId = deleteBtn.dataset.id;
            window.deleteType = 'recurring';
            els.deleteModal.classList.add('show');
        }
    });

    // Feature 2: Smart Auto-fill title suggestions dropdown
    const suggestionsEl = document.getElementById('title-suggestions');
    let suggDebounceTimer = null;

    document.getElementById('title').addEventListener('input', async (e) => {
        clearTimeout(suggDebounceTimer);
        const val = e.target.value.trim();
        if (val.length < 2) { suggestionsEl.classList.add('hidden'); return; }

        suggDebounceTimer = setTimeout(async () => {
            const matches = await api.fetchAllExpensesMeta(state.householdToken, val);
            if (!matches.length) { suggestionsEl.classList.add('hidden'); return; }
            suggestionsEl.innerHTML = matches.map(m => `
                <div class="suggestion-item" data-title="${m.title}" data-amount="${m.amount}" data-category="${m.category}" data-notes="${m.notes || ''}">
                    <span>${m.title}</span>
                    <span class="suggestion-meta">${m.category} &bull; ₹${parseFloat(m.amount).toFixed(0)}</span>
                </div>`).join('');
            suggestionsEl.classList.remove('hidden');
        }, 300);
    });

    suggestionsEl.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        document.getElementById('title').value = item.dataset.title;
        document.getElementById('amount').value = item.dataset.amount;
        document.getElementById('category').value = item.dataset.category;
        if (item.dataset.notes) document.getElementById('notes').value = item.dataset.notes;
        suggestionsEl.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#title') && !e.target.closest('#title-suggestions')) {
            suggestionsEl.classList.add('hidden');
        }
    });

    document.getElementById('title').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') suggestionsEl.classList.add('hidden');
    });

    // Form Submission: Settings (all fields)
    els.budgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('budget-amount').value) || 0;
        const shopThresh = parseFloat(document.getElementById('shopping-threshold').value) || 5000;
        const savingsGoal = parseFloat(document.getElementById('savings-goal').value) || 0;
        const reportEmail = document.getElementById('report-email').value.trim();
        const resendKey = document.getElementById('resend-api-key').value.trim();

        // Save Resend key only in localStorage (never sent to DB for security)
        if (resendKey) localStorage.setItem('resend_api_key', resendKey);
        else localStorage.removeItem('resend_api_key');
        
        setLoading(true);
        try {
            await api.updateSettings(state.householdToken, amount, shopThresh, savingsGoal, reportEmail);
            state.monthlyBudget = amount;
            state.shoppingThreshold = shopThresh;
            state.savingsGoal = savingsGoal;
            state.reportEmail = reportEmail;
            // Reset banner dismissed so it rechecks with new budget
            state.bannerDismissed = false;
            showToast('Settings saved!');
            closeModal(els.budgetModal);
            renderSummary();
        } catch (err) {
            showToast('Error saving settings', true);
        } finally {
            setLoading(false);
        }
    });

    // Feature 6: Send Monthly Report Email
    document.getElementById('send-report-btn').addEventListener('click', async () => {
        const resendKey = localStorage.getItem('resend_api_key');
        if (!resendKey) {
            showToast('Add your Resend API key in Settings first', true);
            return;
        }
        if (!state.reportEmail) {
            showToast('Add a report email address in Settings first', true);
            return;
        }
        setLoading(true);
        try {
            await api.sendMonthlyReport(state.householdToken, state.selectedMonth, resendKey);
            showToast('📧 Monthly report sent to ' + state.reportEmail);
        } catch (err) {
            showToast('Email failed: ' + err.message, true);
        } finally {
            setLoading(false);
        }
    });

    // Form Submission: Recurring
    els.recurringForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = getCurrentUser();
        const id = document.getElementById('recurring-id').value;
        const recurring = {
            title: document.getElementById('r-title').value.trim(),
            amount: parseFloat(document.getElementById('r-amount').value),
            category: document.getElementById('r-category').value,
            period: document.getElementById('r-period').value,
            next_due_date: document.getElementById('r-next-date').value,
            created_by: user.email,
            household_token: state.householdToken
        };

        if (!recurring.title || recurring.amount <= 0) return;

        setLoading(true);
        try {
            if (id) {
                await api.updateRecurring(id, recurring);
                showToast('Subscription updated!');
            } else {
                await api.addRecurring(recurring);
                showToast('Subscription added!');
            }
            closeModal(els.recurringModal);
            renderRecurring();
        } catch (error) {
            showToast('Error saving subscription', true);
        } finally {
            setLoading(false);
        }
    });

    // Smart Alert Helper
    const checkOverspending = async (expense) => {
        const amount = parseFloat(expense.amount);
        const category = expense.category;
        const currentMonthStr = expense.date.substring(0, 7);

        if (category === 'Food') {
            const currentSpend = await api.getCategorySpend(state.householdToken, 'Food', currentMonthStr);
            const avgSpend = await api.getCategoryAverage(state.householdToken, 'Food', 2);
            if (avgSpend > 0 && (currentSpend + amount) > (avgSpend * 1.1)) {
                return { triggered: true, message: `You've spent a lot on Food this month! Your usual average is ₹${avgSpend.toFixed(0)}, but this purchase will bring you to ₹${(currentSpend + amount).toFixed(0)}. Are you sure?` };
            }
        } else if (category === 'Shopping') {
            const [year, month] = currentMonthStr.split('-');
            let lm = parseInt(month) - 1;
            let ly = parseInt(year);
            if (lm === 0) { lm = 12; ly--; }
            const lastMonthStr = `${ly}-${lm.toString().padStart(2, '0')}`;
            const lastMonthSpend = await api.getCategorySpend(state.householdToken, 'Shopping', lastMonthStr);
            if (lastMonthSpend > state.shoppingThreshold) {
                return { triggered: true, message: `You had a heavy shopping month last month (₹${lastMonthSpend.toFixed(0)}). Do you really need to shop again so soon?` };
            }
        }
        return { triggered: false };
    };

    // Final save after alert check
    const saveExpenseFinal = async (id, expense) => {
        const user = getCurrentUser();
        setLoading(true);
        try {
            if (id) {
                await api.updateExpense(id, expense);
                await api.addLog({ action_type: 'updated', item_title: expense.title, user_name: user.displayName || user.email, created_by: user.email, household_token: state.householdToken });
                showToast('Expense updated!');
            } else {
                await api.addExpense(expense);
                await api.addLog({ action_type: 'added', item_title: expense.title, user_name: user.displayName || user.email, created_by: user.email, household_token: state.householdToken });
                showToast('Expense added!');
            }
            closeModal(els.expenseModal);
            closeModal(els.overspendModal);
            renderExpenses();
            renderSummary();
            renderAnalytics();
        } catch (error) {
            showToast('Error saving expense', true);
        } finally {
            setLoading(false);
        }
    };

    // Form Submission: Expense (with Smart Alert Interception)
    els.expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = getCurrentUser();
        const id = document.getElementById('expense-id').value;
        const expense = {
            title: document.getElementById('title').value.trim(),
            amount: parseFloat(document.getElementById('amount').value),
            category: document.getElementById('category').value,
            date: document.getElementById('date').value,
            notes: document.getElementById('notes').value.trim(),
            created_by: user.email,
            household_token: state.householdToken
        };

        if (!expense.title || expense.amount <= 0) {
            showToast('Invalid input', true);
            return;
        }

        // Smart Alert: only fires on new expenses (not edits)
        if (!id) {
            setLoading(true);
            const check = await checkOverspending(expense);
            setLoading(false);
            if (check.triggered) {
                els.overspendMessage.textContent = check.message;
                els.overspendReasonGroup.classList.add('hidden');
                els.overspendReason.value = '';
                els.overspendProceedBtn.textContent = 'Yes, Proceed';
                pendingExpense = expense;
                pendingExpenseId = id;
                openModal(els.overspendModal);
                return;
            }
        }

        await saveExpenseFinal(id, expense);
    });

    // Overspend Modal: Proceed (2-step: show reason box first, then confirm)
    els.overspendProceedBtn.addEventListener('click', () => {
        if (els.overspendReasonGroup.classList.contains('hidden')) {
            els.overspendReasonGroup.classList.remove('hidden');
            els.overspendProceedBtn.textContent = 'Confirm & Save';
        } else {
            const reason = els.overspendReason.value.trim();
            if (!reason) { showToast('Please enter a reason to proceed.', true); return; }
            pendingExpense.notes = pendingExpense.notes
                ? `${pendingExpense.notes} | Reason: ${reason}`
                : `Reason: ${reason}`;
            saveExpenseFinal(pendingExpenseId, pendingExpense);
        }
    });

    // Overspend Modal: Cancel
    els.overspendCancelBtn.addEventListener('click', () => {
        pendingExpense = null;
        pendingExpenseId = null;
        closeModal(els.overspendModal);
        closeModal(els.expenseModal);
    });

    // Delete Confirmation
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        const id = window.deleteId;
        const user = getCurrentUser();
        
        setLoading(true);
        try {
            if (window.deleteType === 'recurring') {
                await api.deleteRecurring(id);
                showToast('Subscription deleted!');
                closeModal(els.deleteModal);
                renderRecurring();
            } else {
                const expense = state.expenses.find(e => e.id === id);
                await api.deleteExpense(id);
                if (expense) {
                    await api.addLog({
                        action_type: 'deleted',
                        item_title: expense.title,
                        user_name: user.displayName || user.email,
                        created_by: user.email,
                        household_token: state.householdToken
                    });
                }
                showToast('Expense deleted!');
                closeModal(els.deleteModal);
                renderExpenses();
                renderSummary();
                renderAnalytics();
            }
        } catch (error) {
            showToast('Error deleting record', true);
        } finally {
            setLoading(false);
        }
    });
};
