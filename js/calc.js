import { FREQUENCIES } from './config.js';

export function normalizeToMonthly(amount, freqKey) {
    if (!amount || isNaN(amount)) return 0;
    const f = FREQUENCIES[freqKey] || FREQUENCIES['monthly'];
    return amount * f.mult;
}

function calculateProgressiveTax(taxableIncome, brackets) {
    let tax = 0;
    let previousCap = 0;
    for (let bracket of brackets) {
        if (taxableIncome > previousCap) {
            const taxableInThisBracket = Math.min(taxableIncome, bracket.cap) - previousCap;
            tax += taxableInThisBracket * bracket.rate;
            previousCap = bracket.cap;
        } else { break; }
    }
    return tax;
}

export function calculateFederal(grossAnnual, filingStatus, taxData) {
    const fedData = taxData.federal;
    const status = (filingStatus === 'married') ? 'married' : 'single';
    const deduction = fedData.standard_deduction[status];
    const fica = grossAnnual * fedData.fica_rate;
    const taxableIncome = Math.max(0, grossAnnual - deduction);
    const brackets = fedData.brackets[status];
    const fedTax = calculateProgressiveTax(taxableIncome, brackets);
    return { fica_annual: fica, fed_annual: fedTax, total_annual: fica + fedTax };
}

/**
 * Calculates State Tax using real brackets.
 */
export function calculateState(grossAnnual, stateCode, taxData, filingStatus = 'single') {
    const code = stateCode ? stateCode.toUpperCase() : 'US';
    if (!taxData.states || !taxData.states[code]) return 0;

    const state = taxData.states[code];
    const status = filingStatus === 'married' ? 'married' : 'single';
    
    const deduction = state.deductions[status] || 0;
    const brackets = state.brackets[status] || [];

    const taxable = Math.max(0, grossAnnual - deduction);
    
    // Use the internal helper function
    // Note: ensure calculateProgressiveTax is available in scope (it is in the file)
    return calculateProgressiveTax(taxable, brackets);
}

export function calculateSafeMedical(monthlyPremium, oopMax) {
    const monthlyRisk = oopMax / 12;
    return monthlyPremium + monthlyRisk;
}

export function calculateBudget(userInput, taxData, geoData) {
    const grossMonthly = normalizeToMonthly(userInput.income, userInput.income_frequency);
    const grossAnnual = grossMonthly * 12;

    const fedResult = calculateFederal(grossAnnual, userInput.filing_status, taxData);
    const stateTaxAnnual = calculateState(grossAnnual, userInput.state, taxData, userInput.filing_status);
    const totalTaxMonthly = (fedResult.total_annual + stateTaxAnnual) / 12;

    const netMonthly = grossMonthly - totalTaxMonthly;

    let totalBills = 0;
    const billsBreakdown = [];

    // 1. Process Bills
    userInput.bills.forEach(bill => {
        const monthlyCost = normalizeToMonthly(bill.amount, bill.frequency);
        totalBills += monthlyCost;
        billsBreakdown.push({ 
            name: bill.name, 
            category: bill.category, 
            key: bill.key, 
            monthly_cost: monthlyCost 
        });
    });

    // 2. Process Health
    const safeMedical = calculateSafeMedical(userInput.medical_premium, userInput.medical_oop_max);
    totalBills += safeMedical;
    
    // Add Health to breakdown (for Graph)
    if (userInput.medical_premium > 0) {
        billsBreakdown.push({
            name: 'Health Premium',
            category: 'health',
            monthly_cost: userInput.medical_premium
        });
    }
    if (safeMedical - userInput.medical_premium > 0) {
        billsBreakdown.push({
            name: 'Health Risk Buffer',
            category: 'health',
            monthly_cost: safeMedical - userInput.medical_premium
        });
    }

    // 3. INSIGHTS GENERATION
    const stateStats = geoData.states[userInput.state] || geoData.national;
    const insights = [];

    // Helper for generating insight objects
    const checkStat = (label, userVal, geoKey) => {
        const avg = stateStats[geoKey] || 0;
        if (userVal > 0 && avg > 0) {
            const diff = (userVal - avg) / avg;
            const pct = Math.round(Math.abs(diff) * 100);
            if (diff > 0.15) {
                insights.push({ type: 'warn', msg: `${label} is ${pct}% above avg.` });
            } else if (diff < -0.15) {
                insights.push({ type: 'good', msg: `${label} is ${pct}% below avg.` });
            }
        }
    };

    // Check Housing
    const housingKey = userInput.housing_type === 'own' ? 'housing_mortgage' : 'housing_rent';
    checkStat('Housing', userInput.housing_cost, housingKey);

    // Check Health Premium
    checkStat('Health Ins.', userInput.medical_premium, 'health_insurance');

    // Check All Bills
    userInput.bills.forEach(bill => {
        if (bill.key) {
            const monthly = normalizeToMonthly(bill.amount, bill.frequency);
            checkStat(bill.name, monthly, bill.key);
        }
    });

    const discretionary = netMonthly - userInput.housing_cost - totalBills;

    return {
        income: { gross_monthly: grossMonthly, net_monthly: netMonthly },
        taxes: { monthly_total: totalTaxMonthly },
        spending: {
            total_fixed: totalBills,
            housing: userInput.housing_cost,
            discretionary: discretionary,
            breakdown: billsBreakdown
        },
        insights: insights
    };
}