import pandas as pd
import json
import re
import os

# --- CONFIG ---
INPUT_FILE = 'raw_data/tax_foundation_2025.xlsx'
OUTPUT_FILE = 'data/tax_tables.json'

# MAPPING: Tax Foundation Abbr -> ISO Code
STATE_MAP = {
    'Ala.': 'AL', 'Alaska': 'AK', 'Ariz.': 'AZ', 'Ark.': 'AR', 'Calif.': 'CA',
    'Colo.': 'CO', 'Conn.': 'CT', 'Del.': 'DE', 'Fla.': 'FL', 'Ga.': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Ill.': 'IL', 'Ind.': 'IN', 'Iowa': 'IA',
    'Kans.': 'KS', 'Ky.': 'KY', 'La.': 'LA', 'Maine': 'ME', 'Md.': 'MD',
    'Mass.': 'MA', 'Mich.': 'MI', 'Minn.': 'MN', 'Miss.': 'MS', 'Mo.': 'MO',
    'Mont.': 'MT', 'Nebr.': 'NE', 'Nev.': 'NV', 'N.H.': 'NH', 'N.J.': 'NJ',
    'N.M.': 'NM', 'N.Y.': 'NY', 'N.C.': 'NC', 'N.D.': 'ND', 'Ohio': 'OH',
    'Okla.': 'OK', 'Ore.': 'OR', 'Pa.': 'PA', 'R.I.': 'RI', 'S.C.': 'SC',
    'S.D.': 'SD', 'Tenn.': 'TN', 'Tex.': 'TX', 'Utah': 'UT', 'Vt.': 'VT',
    'Va.': 'VA', 'Wash.': 'WA', 'W.Va.': 'WV', 'Wis.': 'WI', 'Wyo.': 'WY',
    'D.C.': 'DC'
}

def clean_money(val):
    """Converts '$3,000' or '$100 credit' to float."""
    if pd.isna(val) or str(val).strip().lower() in ['n.a.', 'none', '-']:
        return 0.0
    # If it mentions "credit", we ignore it for deduction purposes (conservative)
    if 'credit' in str(val).lower():
        return 0.0
    
    clean = re.sub(r'[^\d.]', '', str(val))
    try:
        return float(clean)
    except:
        return 0.0

def clean_rate(val):
    """Converts '2.00%' to 0.02."""
    if pd.isna(val) or str(val).strip().lower() in ['none', 'n.a.']:
        return 0.0
    
    clean = re.sub(r'[^\d.]', '', str(val))
    try:
        return float(clean) / 100.0
    except:
        return 0.0

def process_brackets(rows, type_key):
    """
    Converts 'Floor' style data to 'Cap' style logic.
    Input rows: List of {'rate': 0.02, 'threshold': 0}
    """
    brackets = []
    # Sort by threshold just in case
    rows.sort(key=lambda x: x['threshold'])
    
    for i in range(len(rows)):
        rate = rows[i]['rate']
        
        # The Cap is the Threshold of the NEXT bracket.
        # If last bracket, Cap is Infinity.
        if i < len(rows) - 1:
            cap = rows[i+1]['threshold']
        else:
            cap = 99999999999 # Infinity
            
        brackets.append({
            "rate": rate,
            "cap": cap
        })
    return brackets

def run_ingest():
    print("--- 1. LOADING EXCEL ---")
    if not os.path.exists(INPUT_FILE):
        print(f"❌ File not found: {INPUT_FILE}")
        return

    # Load file (assuming headers are in row 0 after your cleanup)
    df = pd.read_excel(INPUT_FILE)
    
    # Structure to hold raw rows per state
    state_buffer = {} 
    current_state = None
    
    # 1. Iterate Rows
    for _, row in df.iterrows():
        raw_state = str(row['State']).strip()
        
        # Detect New State (Column A has text)
        if raw_state and raw_state.lower() != 'nan':
            # Clean State Name (Remove footnotes like '(a)')
            clean_name = re.sub(r'\s*\(.*\)', '', raw_state).strip()
            
            # Map to Code
            if clean_name in STATE_MAP:
                current_state = STATE_MAP[clean_name]
                state_buffer[current_state] = {
                    "std_ded_s": clean_money(row['Std_Ded_Single']),
                    "std_ded_m": clean_money(row['Std_Ded_Married']),
                    "single_rows": [],
                    "married_rows": []
                }
            else:
                # Handle cases not in map or footnotes
                pass
        
        # 2. Add Bracket Data to Current State
        if current_state:
            # Single
            s_rate = clean_rate(row['Single_Rate'])
            s_thresh = clean_money(row['Single_Bracket'])
            # Only add if it looks like real data
            if s_rate > 0 or s_thresh >= 0:
                state_buffer[current_state]['single_rows'].append({'rate': s_rate, 'threshold': s_thresh})

            # Married
            m_rate = clean_rate(row['Married_Rate'])
            m_thresh = clean_money(row['Married_Bracket'])
            if m_rate > 0 or m_thresh >= 0:
                state_buffer[current_state]['married_rows'].append({'rate': m_rate, 'threshold': m_thresh})

    # 3. Transform to Final JSON Structure
    print("--- 2. TRANSFORMING DATA ---")
    
    final_json = {
        "federal": {
            # We keep Federal hardcoded or load it separately, 
            # but for this script we just output the state part to merge or overwrite.
            # Let's read the OLD file to preserve Federal if possible.
            "standard_deduction": {"single": 15000, "married": 30000},
            "brackets": {
                "single": [{"cap": 11925, "rate": 0.10}, {"cap": 48475, "rate": 0.12}, {"cap": 103350, "rate": 0.22}, {"cap": 197300, "rate": 0.24}, {"cap": 250525, "rate": 0.32}, {"cap": 626350, "rate": 0.35}, {"cap": 999999999, "rate": 0.37}],
                "married": [{"cap": 23850, "rate": 0.10}, {"cap": 96950, "rate": 0.12}, {"cap": 206700, "rate": 0.22}, {"cap": 394600, "rate": 0.24}, {"cap": 501050, "rate": 0.32}, {"cap": 751600, "rate": 0.35}, {"cap": 999999999, "rate": 0.37}]
            },
            "fica_rate": 0.0765
        },
        "states": {}
    }
    
    # Try to load existing to preserve Federal data
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r') as f:
                existing = json.load(f)
                if 'federal' in existing:
                    final_json['federal'] = existing['federal']
        except:
            pass

    for code, data in state_buffer.items():
        # Process floors into caps
        single_brackets = process_brackets(data['single_rows'], 'single')
        married_brackets = process_brackets(data['married_rows'], 'married')
        
        # If no brackets (e.g. TX, FL), check if they have a flat rate?
        # The sheet usually lists "none" or just empty. 
        # If lists are empty, it's 0 tax.
        
        final_json['states'][code] = {
            "deductions": {
                "single": data['std_ded_s'],
                "married": data['std_ded_m']
            },
            "brackets": {
                "single": single_brackets,
                "married": married_brackets
            }
        }

    # 4. Save
    print("--- 3. SAVING ---")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_json, f, indent=2)
    print(f"✅ Created {OUTPUT_FILE} with {len(final_json['states'])} states.")

if __name__ == "__main__":
    run_ingest()