/**
 * CONFIGURATION & CONSTANTS
 * Source of truth for Categories, Colors, Math, and Branding.
 */

export const APP_META = {
    name: "Budgeter",       // Main Title
    suffix: "OS",         // Highlighted Suffix
    emoji: "💸",          // Used for Favicon
    filename: "budgeter" // Default CSV filename
};

export const FREQUENCIES = {
    'weekly': { label: 'Weekly', mult: 4.333 },
    'biweekly': { label: 'Bi-Weekly', mult: 2.166 },
    'semimonthly': { label: 'Semi-Monthly', mult: 2.0 },
    'monthly': { label: 'Monthly', mult: 1.0 },
    'quarterly': { label: 'Quarterly', mult: 1/3 },
    'biannual': { label: 'Bi-Annual (6mo)', mult: 1/6 },
    'annual': { label: 'Annual', mult: 1/12 }
};

export const CATEGORY_MAP = {
    'tax': { label: 'Taxes', color: 'var(--c-tax)', type: 'core' },
    'housing': { label: 'Housing', color: 'var(--c-housing)', type: 'core' },
    'health': { label: 'Health', color: 'var(--c-health)', type: 'core' },
    'pretax': { label: 'Pretax', color: 'var(--c-pretax)', type: 'core' },
    'food': { label: 'Food', color: 'var(--c-food)', type: 'flex' },
    'util': { label: 'Utilities', color: 'var(--c-util)', type: 'flex' },
    'bill': { label: 'Bills', color: 'var(--c-bill)', type: 'flex' },
    'debt': { label: 'Debt', color: 'var(--c-debt)', type: 'flex' },
    'leftover': { label: 'Leftover', color: 'var(--c-leftover)', type: 'calc' }
};

export const KNOWN_BILLS = [
    { key: 'electricity', label: 'Electricity', cat: 'util' },
    { key: 'water', label: 'Water/Sewer', cat: 'util' },
    { key: 'natural_gas', label: 'Heating (Gas)', cat: 'util' },
    { key: 'garbage', label: 'Garbage', cat: 'util' },
    { key: 'internet', label: 'Internet', cat: 'util' },
    { key: 'cell_phone', label: 'Cell Phone', cat: 'bill' },
    { key: 'food_at_home', label: 'Groceries', cat: 'food' },
    { key: 'food_away_from_home', label: 'Dining Out', cat: 'food' },
    { key: 'car_insurance', label: 'Car Insurance', cat: 'bill' },
    { key: 'car_payment', label: 'Car Payment', cat: 'debt' },
    { key: 'student_loan', label: 'Student Loan', cat: 'debt' },
    { key: 'life_insurance', label: 'Life Insurance', cat: 'bill' },
    { key: 'home_security', label: 'Home Security', cat: 'bill' },
    { key: 'streaming', label: 'Streaming Services', cat: 'bill' },
    { key: 'retirement', label: 'Retirement', cat: 'pretax' }
];