import { FREQUENCIES, CATEGORY_MAP, KNOWN_BILLS } from './config.js';

export function createFreqSelect(selected = 'monthly') {
    let html = `<select class="input-freq" data-type="freq">`;
    for (const [key, obj] of Object.entries(FREQUENCIES)) {
        const isSel = key === selected ? 'selected' : '';
        html += `<option value="${key}" ${isSel}>${obj.label}</option>`;
    }
    html += `</select>`;
    return html;
}

export function renderBillRow(bill, onDelete, onUpdate) {
    const tr = document.createElement('tr');
    tr.id = `row-${bill.id}`;
    tr.className = 'bill-row'; 
    
    const catKey = bill.category || 'bill';
    const catConfig = CATEGORY_MAP[catKey] || CATEGORY_MAP['bill'];
    const style = `background:${catConfig.color}22; color:${catConfig.color}; border-color:${catConfig.color}`;

    tr.innerHTML = `
        <td>
            <div class="row-badge-container" style="margin-bottom:4px;">
                <select class="cat-select" style="${style}">
                    ${Object.entries(CATEGORY_MAP)
                        .filter(([k, v]) => v.type !== 'calc') 
                        .map(([k, v]) => `<option value="${k}" ${k === catKey ? 'selected' : ''}>${v.label}</option>`)
                        .join('')}
                </select>
            </div>
            <input type="text" class="bill-input name-input" value="${bill.name}" list="known-bills" placeholder="Name">
        </td>
        <td>
            <div class="input-group">
                <span class="currency">$</span>
                <input type="number" class="bill-input amt-input" value="${bill.amount}">
            </div>
        </td>
        <td>${createFreqSelect(bill.frequency)}</td>
        <td><button class="btn-small btn-del">×</button></td>
    `;

    const triggerBenchmark = () => {
        const known = KNOWN_BILLS.find(k => k.label === bill.name || k.key === bill.key);
        onUpdate(tr, known ? known.key : null, parseFloat(bill.amount));
    };

    const catSelect = tr.querySelector('.cat-select');
    const nameInput = tr.querySelector('.name-input');
    const amtInput = tr.querySelector('.amt-input');
    const freqInput = tr.querySelectorAll('select')[1];
    const delBtn = tr.querySelector('.btn-del');

    catSelect.addEventListener('change', (e) => {
        bill.category = e.target.value;
        const newConf = CATEGORY_MAP[bill.category];
        e.target.style.background = `${newConf.color}22`;
        e.target.style.color = newConf.color;
        e.target.style.borderColor = newConf.color;
        onUpdate(null, null, null); 
    });

    // 2. Name Change (Auto-detect Category)
    nameInput.addEventListener('input', (e) => { 
        bill.name = e.target.value; 
        
        // FIX: Case-insensitive lookup
        const lowerName = bill.name.toLowerCase();
        const match = KNOWN_BILLS.find(k => k.label.toLowerCase() === lowerName);
        
        if (match) {
            bill.category = match.cat;
            bill.key = match.key; 
            // Update UI to match
            catSelect.value = match.cat;
            catSelect.dispatchEvent(new Event('change'));
            
            e.target.value = match.label; 
        }
        triggerBenchmark();
    });
    
    amtInput.addEventListener('input', (e) => { 
        bill.amount = parseFloat(e.target.value) || 0; 
        triggerBenchmark();
    });
    
    freqInput.addEventListener('change', (e) => { 
        bill.frequency = e.target.value; 
        onUpdate(null, null, null); 
    });

    delBtn.addEventListener('click', () => onDelete(bill.id));

    return tr;
}

export function renderViz(container, budgetData, grossIncome) {
    container.innerHTML = '';
    if (grossIncome <= 0) return;

    const buckets = {
        tax: { val: budgetData.taxes.monthly_total, ...CATEGORY_MAP.tax },
        housing: { val: budgetData.spending.housing, ...CATEGORY_MAP.housing },
        health: { val: 0, ...CATEGORY_MAP.health },
        pretax: { val: 0, ...CATEGORY_MAP.pretax },
        food: { val: 0, ...CATEGORY_MAP.food },
        util: { val: 0, ...CATEGORY_MAP.util },
        bill: { val: 0, ...CATEGORY_MAP.bill },
        debt: { val: 0, ...CATEGORY_MAP.debt },
        leftover: { val: budgetData.spending.discretionary, ...CATEGORY_MAP.leftover }
    };

    budgetData.spending.breakdown.forEach(b => {
        const cat = b.category || 'bill';
        if (buckets[cat]) buckets[cat].val += b.monthly_cost;
        else buckets.bill.val += b.monthly_cost;
    });

    const totalExpenses = Object.values(buckets).reduce((sum, item) => item.type !== 'calc' ? sum + item.val : sum, 0);
    const isOverBudget = totalExpenses > grossIncome;

    // FAT BAR
    const fatTrack = document.createElement('div');
    fatTrack.className = 'fat-bar-track';
    
    const order = ['tax', 'pretax', 'health', 'housing', 'debt', 'util', 'bill', 'food'];
    
    order.forEach(key => {
        const item = buckets[key];
        if (item.val > 0) {
            const pct = (item.val / grossIncome) * 100;
            const seg = document.createElement('div');
            seg.style.width = `${pct}%`;
            seg.style.backgroundColor = item.color;
            seg.className = 'seg';
            fatTrack.appendChild(seg);
        }
    });
    container.appendChild(fatTrack);

    // SKINNY BARS (Sorted with Leftover Pinned Bottom)
    const grid = document.createElement('div');
    grid.className = 'viz-grid';
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    // 1. Get Expenses only, sort them
    let expenseItems = order.map(k => buckets[k]).filter(i => i.val > 0).sort((a, b) => b.val - a.val);

    // 2. Render Expenses
    expenseItems.forEach(item => {
        let pct = (item.val / grossIncome) * 100;
        if (pct > 100) pct = 100;
        
        const row = document.createElement('div');
        row.className = 'viz-row';
        row.innerHTML = `
            <div class="viz-label" style="color:${item.color}">${item.label}</div>
            <div class="viz-track">
                <div class="viz-fill" style="width:${pct}%; background:${item.color}"></div>
            </div>
            <div class="viz-val">${fmt.format(item.val)}</div>
        `;
        grid.appendChild(row);
    });

    // 3. Render Leftover OR Overage (Pinned to Bottom)
    if (isOverBudget) {
        const deficit = totalExpenses - grossIncome;
        const row = document.createElement('div');
        row.className = 'viz-row';
        row.innerHTML = `
            <div class="viz-label" style="color:#ef4444">OVERAGE</div>
            <div class="viz-track" style="border: 1px solid #ef4444">
                <div class="viz-fill" style="width:100%; background:repeating-linear-gradient(45deg,#ef4444,#ef4444 10px,#330000 10px,#330000 20px);"></div>
            </div>
            <div class="viz-val" style="color:#ef4444">-${fmt.format(deficit)}</div>
        `;
        grid.appendChild(row);
    } else if (buckets.leftover.val > 0) {
        const item = buckets.leftover;
        let pct = (item.val / grossIncome) * 100;
        const row = document.createElement('div');
        row.className = 'viz-row';
        row.innerHTML = `
            <div class="viz-label" style="color:${item.color}">${item.label}</div>
            <div class="viz-track">
                <div class="viz-fill" style="width:${pct}%; background:${item.color}"></div>
            </div>
            <div class="viz-val">${fmt.format(item.val)}</div>
        `;
        grid.appendChild(row);
    }

    container.appendChild(grid);
}