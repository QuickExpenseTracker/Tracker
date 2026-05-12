import { api } from './api.js';
import { getCurrentUser } from './auth.js';
import { formatDate, formatCurrency, debounce, showToast, setLoading, exportToCSV, getTodayDate } from './utils.js';

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
    totalCount: 0
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
    loadingOverlay: document.getElementById('loading-overlay')
};

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
        view: state.view
    }));
};

// Rendering
export const renderSummary = async () => {
    const user = getCurrentUser();
    if (!user) return;
    try {
        const { totalMonth, totalToday, breakdown } = await api.getSummary(user.email);
        els.totalMonth.textContent = formatCurrency(totalMonth);
        els.totalToday.textContent = formatCurrency(totalToday);
        
        // Render breakdown in reports tab
        els.categoryBreakdown.innerHTML = Object.entries(breakdown).length 
            ? Object.entries(breakdown).map(([cat, amount]) => `
                <div class="breakdown-item">
                    <span class="category-badge">${cat}</span>
                    <span class="amount">${formatCurrency(amount)}</span>
                </div>
            `).join('')
            : '<p class="empty-state">No data for this month.</p>';
    } catch (error) {
        console.error('Summary error:', error);
    }
};

export const renderExpenses = async () => {
    const user = getCurrentUser();
    if (!user) return;
    
    setLoading(true);
    try {
        const { data, totalCount } = await api.fetchExpenses({
            userId: user.email,
            page: state.page,
            limit: state.limit,
            search: state.search,
            category: state.category,
            date: state.date,
            sortBy: state.sortBy
        });
        
        state.expenses = data;
        state.totalCount = totalCount;
        
        els.expenseList.innerHTML = data.length 
            ? data.map(item => `
                <div class="expense-card">
                    <div class="expense-info">
                        <div class="expense-title">${item.title}</div>
                        <div class="expense-meta">
                            <span class="category-badge">${item.category}</span>
                            <span>${formatDate(item.date)}</span>
                        </div>
                        ${item.notes ? `<div class="expense-meta" style="margin-top:4px; font-style:italic">${item.notes}</div>` : ''}
                    </div>
                    <div class="expense-amount-actions">
                        <div class="expense-amount">${formatCurrency(item.amount)}</div>
                        <div class="expense-actions">
                            <button class="btn btn-outline btn-sm edit-btn" data-id="${item.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline btn-sm delete-btn" data-id="${item.id}">
                                <i class="fas fa-trash text-danger"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')
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
    const user = getCurrentUser();
    if (!user) return;
    try {
        const logs = await api.fetchLogs(user.email);
        els.activityList.innerHTML = logs.length 
            ? logs.map(log => `
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
    } catch (error) {
        console.error('Logs error:', error);
    }
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
    
    if (tabId === 'expenses') renderExpenses();
    if (tabId === 'reports') renderSummary();
    if (tabId === 'logs') renderLogs();
};

export const initUI = () => {
    loadState();
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => setActiveTab(btn));
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

    // Export
    document.getElementById('export-csv').addEventListener('click', () => {
        const filename = `expense-report-${new Date().toISOString().split('T')[0]}.csv`;
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
        } else {
            document.getElementById('modal-title').textContent = 'Add Expense';
            els.expenseForm.reset();
            document.getElementById('expense-id').value = '';
            document.getElementById('date').value = getTodayDate();
        }
        // Auto-focus first input
        setTimeout(() => document.getElementById('title').focus(), 100);
    };

    const closeModal = (modal) => {
        modal.classList.remove('show');
    };

    document.getElementById('add-expense-btn').addEventListener('click', () => openModal(els.expenseModal));
    
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.modal'));
        });
    });

    // Event Delegation for List actions
    els.expenseList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        
        if (editBtn) openModal(els.expenseModal, editBtn.dataset.id);
        if (deleteBtn) {
            window.deleteId = deleteBtn.dataset.id;
            els.deleteModal.classList.add('show');
        }
    });

    // Form Submission
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
            created_by: user.email
        };

        if (!expense.title || expense.amount <= 0) {
            showToast('Invalid input', true);
            return;
        }

        // Prevent Duplicate Check (Simple warning)
        const isDuplicate = state.expenses.some(e => 
            e.title.toLowerCase() === expense.title.toLowerCase() && 
            e.date === expense.date && 
            e.id !== id
        );
        if (isDuplicate && !confirm('An expense with the same title and date already exists. Continue?')) {
            return;
        }

        setLoading(true);
        try {
            if (id) {
                await api.updateExpense(id, expense);
                await api.addLog({
                    action_type: 'updated',
                    item_title: expense.title,
                    user_name: user.displayName || user.email,
                    created_by: user.email
                });
                showToast('Expense updated!');
            } else {
                await api.addExpense(expense);
                await api.addLog({
                    action_type: 'added',
                    item_title: expense.title,
                    user_name: user.displayName || user.email,
                    created_by: user.email
                });
                showToast('Expense added!');
            }
            closeModal(els.expenseModal);
            renderExpenses();
            renderSummary();
        } catch (error) {
            showToast('Error saving expense', true);
        } finally {
            setLoading(false);
        }
    });

    // Delete Confirmation
    document.getElementById('confirm-delete').addEventListener('click', async () => {
        const id = window.deleteId;
        const user = getCurrentUser();
        const expense = state.expenses.find(e => e.id === id);
        
        setLoading(true);
        try {
            await api.deleteExpense(id);
            if (expense) {
                await api.addLog({
                    action_type: 'deleted',
                    item_title: expense.title,
                    user_name: user.displayName || user.email,
                    created_by: user.email
                });
            }
            showToast('Expense deleted!');
            closeModal(els.deleteModal);
            renderExpenses();
            renderSummary();
        } catch (error) {
            showToast('Error deleting expense', true);
        } finally {
            setLoading(false);
        }
    });
};
