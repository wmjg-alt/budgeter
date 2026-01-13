import { calculateBudget, normalizeToMonthly } from './calc.js';
import { renderBillRow, renderViz, createFreqSelect } from './components.js';
import { FREQUENCIES, KNOWN_BILLS, APP_META } from './config.js';

// --- STATE ---
const APP_STATE = { 
    taxData: null, 
    geoData: null, 
    bills: [],
    introMode: false,
    introStateName: ''
};

const STORAGE_KEY = 'budget_os_data_v1';
const PREF_KEY = 'budget_os_remember_pref';

// --- DOM ELEMENTS ---
const UI = {
    inputs: {
        gross: document.getElementById('in-income'),
        incomeFreq: document.getElementById('in-freq'),
        state: document.getElementById('in-state'),
        filing: document.getElementById('in-filing'),
        housingType: document.getElementById('in-housing-type'),
        housingCost: document.getElementById('in-housing'),
        housingFreq: document.getElementById('in-housing-freq'),
        medPrem: document.getElementById('in-med-prem'),
        medPremFreq: document.getElementById('in-med-freq'),
        medOop: document.getElementById('in-med-oop'),
        remember: document.getElementById('btn-remember') // NEW
    },
    outputs: {
        discretionary: document.getElementById('out-discretionary'),
        totalFixed: document.getElementById('out-total-fixed'),
        status: document.getElementById('out-status-msg'),
        insights: document.getElementById('insight-box'),
        grossTxt: document.getElementById('txt-gross'),
        vizContainer: document.getElementById('viz-container')
    },
    billList: document.getElementById('bill-list'),
    btnAddBill: document.getElementById('btn-add-bill'),
    btnExport: document.getElementById('btn-export'),
    datalist: document.getElementById('known-bills')
};

// --- INITIALIZATION ---
async function init() {
    applyBranding();

    // 1. Inject UI Components
    UI.inputs.incomeFreq.innerHTML = createFreqSelect('annual');
    UI.inputs.housingFreq.innerHTML = createFreqSelect('monthly');
    UI.inputs.medPremFreq.innerHTML = createFreqSelect('monthly');
    populateDatalist();

    try {
        // 2. Fetch Data
        const [taxRes, geoRes] = await Promise.all([
            fetch('./data/tax_tables.json'),
            fetch('./data/geo_stats.json')
        ]);
        APP_STATE.taxData = await taxRes.json();
        APP_STATE.geoData = await geoRes.json();

        populateStateSelect();

        // 3. CHECK REMEMBER PREFERENCE
        const shouldRemember = localStorage.getItem(PREF_KEY) === 'true';
        UI.inputs.remember.checked = shouldRemember;

        let loaded = false;
        if (shouldRemember) {
            loaded = loadState(); // Try to load user data
        }

        // 4. Fallback to Random Profile if not remembering OR no save found
        if (!loaded) {
            loadRandomProfile();
        }
        
        attachEventListeners();
        updateDashboard();
        
        setTimeout(triggerGlobalBenchmark, 100);

    } catch (err) {
        console.error("Init Error:", err);
        UI.outputs.status.textContent = "Error loading data.";
        UI.outputs.status.style.color = "red";
    }
}

// --- BRANDING & EXPORT ---
function applyBranding() {
    document.title = `${APP_META.name}${APP_META.suffix}`;
    const h1 = document.querySelector('.logo-area h1');
    if (h1) h1.innerHTML = `${APP_META.name.toUpperCase()}<span class="highlight">${APP_META.suffix.toUpperCase()}</span>`;
    
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${APP_META.emoji}</text></svg>`;
    document.head.appendChild(link);
}

function populateDatalist() {
    UI.datalist.innerHTML = '';
    KNOWN_BILLS.forEach(kb => {
        const opt = document.createElement('option');
        opt.value = kb.label;
        UI.datalist.appendChild(opt);
    });
}

function exportCSV() {
    const user = gatherUserInputs();
    const res = calculateBudget(user, APP_STATE.taxData, APP_STATE.geoData);
    
    let rows = [];
    rows.push(['Category', 'Name', 'Input Amount', 'Frequency', 'Normalized Monthly']);
    rows.push(['Income', 'Gross Income', user.income, user.income_frequency, res.income.gross_monthly.toFixed(2)]);
    rows.push(['Income', 'Net Income (Post-Tax)', '-', '-', res.income.net_monthly.toFixed(2)]);
    rows.push(['Tax', 'Total Estimated Tax', '-', '-', res.taxes.monthly_total.toFixed(2)]);
    rows.push(['Housing', user.housing_type.toUpperCase(), user.housing_cost_raw, user.housing_freq, res.spending.housing.toFixed(2)]);
    rows.push(['Health', 'Premium', user.medical_premium_raw, UI.inputs.medPremFreq.querySelector('select').value, user.medical_premium.toFixed(2)]);
    rows.push(['Health', 'Max OOP (Annual)', user.medical_oop_max, 'Annual', (user.medical_oop_max/12).toFixed(2)]);
    
    APP_STATE.bills.forEach(b => {
        const monthly = normalizeToMonthly(b.amount, b.frequency);
        rows.push([b.category || 'Bill', b.name, b.amount, b.frequency, monthly.toFixed(2)]);
    });

    rows.push(['SUMMARY', 'Total Fixed Costs', '-', '-', res.spending.total_fixed.toFixed(2)]);
    rows.push(['SUMMARY', 'LEFTOVER CASH', '-', '-', res.spending.discretionary.toFixed(2)]);

    let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${APP_META.filename}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

// --- DATA LOGIC ---
function loadRandomProfile() {
    const codes = Object.keys(APP_STATE.geoData.states);
    const rndCode = codes[Math.floor(Math.random() * codes.length)];
    const stateData = APP_STATE.geoData.states[rndCode];
    
    UI.inputs.housingCost.value = stateData.housing_rent ? parseFloat(stateData.housing_rent.toFixed(2)) : 0;
    UI.inputs.medPrem.value = stateData.health_insurance ? parseFloat(stateData.health_insurance.toFixed(2)) : 0;

    const available = KNOWN_BILLS.filter(kb => stateData[kb.key]);
    const shuffled = available.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    // Clear existing bills first just in case
    APP_STATE.bills = [];
    UI.billList.innerHTML = '';

    // Add Randoms (Reverse order so they appear top-down)
    selected.forEach((kb, idx) => {
        addBill({
            id: Date.now() + idx,
            name: kb.label,
            amount: parseFloat(stateData[kb.key].toFixed(2)),
            frequency: 'monthly',
            category: kb.cat,
            key: kb.key
        }, false);
    });

    UI.inputs.state.value = 'US';
    APP_STATE.introMode = true;
    APP_STATE.introStateName = stateData.name;
}

function gatherUserInputs() {
    const user = {
        income: parseFloat(UI.inputs.gross.value) || 0,
        income_frequency: UI.inputs.incomeFreq.querySelector('select').value,
        state: UI.inputs.state.value,
        filing_status: UI.inputs.filing.value,
        housing_type: UI.inputs.housingType.value,
        housing_cost_raw: parseFloat(UI.inputs.housingCost.value) || 0,
        medical_premium_raw: parseFloat(UI.inputs.medPrem.value) || 0,
        housing_cost: parseFloat(UI.inputs.housingCost.value) || 0,
        housing_freq: UI.inputs.housingFreq.querySelector('select').value,
        medical_premium: parseFloat(UI.inputs.medPrem.value) || 0,
        medical_oop_max: parseFloat(UI.inputs.medOop.value) || 0,
        bills: APP_STATE.bills
    };
    user.housing_cost = normalizeToMonthly(user.housing_cost, user.housing_freq);
    user.medical_premium = normalizeToMonthly(user.medical_premium, UI.inputs.medPremFreq.querySelector('select').value);
    return user;
}

function populateStateSelect() {
    const states = APP_STATE.geoData.states;
    const select = UI.inputs.state;
    Object.keys(states).sort().forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${states[code].name} (${code})`;
        select.appendChild(option);
    });
}

function addBill(data = null, disableIntroFlag = true) {
    const bill = data || {
        id: Date.now(), name: '', amount: 0, frequency: 'monthly', category: 'bill'
    };

    APP_STATE.bills.unshift(bill);
    
    const row = renderBillRow(bill, 
        (id) => { 
            if(disableIntroFlag) disableIntro(); 
            APP_STATE.bills = APP_STATE.bills.filter(b => b.id !== id);
            document.getElementById(`row-${id}`).remove();
            updateDashboard();
        },
        (rowEl, geoKey, val) => { 
            if(disableIntroFlag) disableIntro(); 
            updateDashboard();
            if (rowEl) benchmarkRow(rowEl, geoKey, val); 
        }
    );
    
    UI.billList.prepend(row);
    
    if (data && data.key) benchmarkRow(row, data.key, data.amount);
}

function disableIntro() {
    if (APP_STATE.introMode) {
        APP_STATE.introMode = false;
        updateDashboard(); 
    }
}

// --- PERSISTENCE ---
function saveState() {
    // ONLY SAVE IF TOGGLE IS CHECKED
    if (!UI.inputs.remember.checked) return;

    const data = {
        gross: UI.inputs.gross.value,
        incomeFreq: UI.inputs.incomeFreq.querySelector('select').value,
        state: UI.inputs.state.value,
        filing: UI.inputs.filing.value,
        housingType: UI.inputs.housingType.value,
        housingCost: UI.inputs.housingCost.value,
        housingFreq: UI.inputs.housingFreq.querySelector('select').value,
        medPrem: UI.inputs.medPrem.value,
        medPremFreq: UI.inputs.medPremFreq.querySelector('select').value,
        medOop: UI.inputs.medOop.value,
        bills: APP_STATE.bills
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
        const data = JSON.parse(saved);
        UI.inputs.gross.value = data.gross;
        UI.inputs.incomeFreq.querySelector('select').value = data.incomeFreq;
        UI.inputs.state.value = data.state;
        UI.inputs.filing.value = data.filing;
        UI.inputs.housingType.value = data.housingType;
        UI.inputs.housingCost.value = data.housingCost;
        UI.inputs.housingFreq.querySelector('select').value = data.housingFreq;
        UI.inputs.medPrem.value = data.medPrem;
        UI.inputs.medPremFreq.querySelector('select').value = data.medPremFreq;
        UI.inputs.medOop.value = data.medOop;
        
        APP_STATE.bills = [];
        UI.billList.innerHTML = '';
        if (data.bills) data.bills.forEach(b => addBill(b, true)); // Pass true to disable intro mode logic on load
        
        return true;
    } catch (e) { return false; }
}

// --- BENCHMARKING & UPDATE ---
function benchmarkRow(rowEl, geoKey, val) {
    rowEl.classList.remove('row-good', 'row-warn');
    if (!geoKey) return; 
    const loc = UI.inputs.state.value;
    const stats = loc === 'US' ? APP_STATE.geoData.national : (APP_STATE.geoData.states[loc] || APP_STATE.geoData.national);
    const avg = stats[geoKey];
    if (avg) {
        if (val < avg * 0.9) rowEl.classList.add('row-good');
        else if (val > avg * 1.1) rowEl.classList.add('row-warn');
    }
}

function benchmarkInput(inputEl, geoKey, val) {
    const loc = UI.inputs.state.value;
    const stats = loc === 'US' ? APP_STATE.geoData.national : (APP_STATE.geoData.states[loc] || APP_STATE.geoData.national);
    const avg = stats[geoKey];
    inputEl.classList.remove('input-good', 'input-warn');
    if (avg && val > 0) {
        if (val < avg * 0.9) inputEl.classList.add('input-good');
        else if (val > avg * 1.1) inputEl.classList.add('input-warn');
    }
}

function triggerGlobalBenchmark() {
    const housingKey = UI.inputs.housingType.value === 'own' ? 'housing_mortgage' : 'housing_rent';
    benchmarkInput(UI.inputs.housingCost, housingKey, parseFloat(UI.inputs.housingCost.value));
    benchmarkInput(UI.inputs.medPrem, 'health_insurance', parseFloat(UI.inputs.medPrem.value));
    APP_STATE.bills.forEach(b => {
        const row = document.getElementById(`row-${b.id}`);
        const match = KNOWN_BILLS.find(k => k.label === b.name);
        const key = b.key || (match ? match.key : null);
        if (row && key) benchmarkRow(row, key, b.amount);
    });
}

function updateDashboard() {
    if (!APP_STATE.taxData) return;
    const user = gatherUserInputs();
    const res = calculateBudget(user, APP_STATE.taxData, APP_STATE.geoData);

    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    UI.outputs.discretionary.textContent = fmt.format(res.spending.discretionary);
    UI.outputs.totalFixed.textContent = fmt.format(res.spending.total_fixed); 
    UI.outputs.grossTxt.textContent = fmt.format(res.income.gross_monthly);

    UI.outputs.insights.innerHTML = '';
    if (APP_STATE.introMode) {
        const introMsg = document.createElement('div');
        introMsg.className = 'insight-tag';
        introMsg.style.background = '#333';
        introMsg.style.borderLeft = '3px solid #fff';
        introMsg.textContent = `ℹ️ Loaded ${APP_STATE.introStateName} averages vs National benchmarks. Change values to clear.`;
        UI.outputs.insights.appendChild(introMsg);
    }
    res.insights.forEach(i => {
        const div = document.createElement('div');
        div.className = `insight-tag tag-${i.type}`;
        div.textContent = i.msg;
        UI.outputs.insights.appendChild(div);
    });

    renderViz(UI.outputs.vizContainer, res, res.income.gross_monthly);
    
    // Save (if toggle checked)
    saveState();
}

function attachEventListeners() {
    const handleInput = () => { disableIntro(); updateDashboard(); };

    ['gross', 'medOop'].forEach(id => { UI.inputs[id].addEventListener('input', handleInput); });

    UI.inputs.housingCost.addEventListener('input', () => {
        disableIntro();
        updateDashboard();
        const housingKey = UI.inputs.housingType.value === 'own' ? 'housing_mortgage' : 'housing_rent';
        benchmarkInput(UI.inputs.housingCost, housingKey, parseFloat(UI.inputs.housingCost.value));
    });

    UI.inputs.medPrem.addEventListener('input', () => {
        disableIntro();
        updateDashboard();
        benchmarkInput(UI.inputs.medPrem, 'health_insurance', parseFloat(UI.inputs.medPrem.value));
    });

    UI.inputs.housingType.addEventListener('change', () => { disableIntro(); updateDashboard(); triggerGlobalBenchmark(); });
    UI.inputs.state.addEventListener('change', () => { disableIntro(); updateDashboard(); triggerGlobalBenchmark(); });
    
    UI.inputs.incomeFreq.addEventListener('change', handleInput);
    UI.inputs.housingFreq.addEventListener('change', handleInput);
    UI.inputs.medPremFreq.addEventListener('change', handleInput);
    UI.inputs.filing.addEventListener('change', handleInput);

    UI.btnAddBill.addEventListener('click', () => { disableIntro(); addBill(); });
    UI.btnExport.addEventListener('click', exportCSV);

    // NEW: TOGGLE LISTENER
    UI.inputs.remember.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        localStorage.setItem(PREF_KEY, isChecked); // Persist Preference
        
        if (isChecked) {
            saveState(); // Save current immediately
        } else {
            localStorage.removeItem(STORAGE_KEY); // Wipe data
        }
    });
}

init();