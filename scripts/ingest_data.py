import pandas as pd
import json
import os
import math
import datetime

# --- CONSTANTS & CONFIGURATION ---
PATHS = {
    'map': 'config/sources_map.json',
    'states': 'config/states.json',
    'output': 'data/geo_stats.json',
    'audit': 'data/manual_audit_log.json',
    'raw_dir': 'raw_data'
}

# Load States from Config
if os.path.exists(PATHS['states']):
    with open(PATHS['states'], 'r') as f:
        US_STATES = json.load(f)
else:
    print("⚠️ States config missing, using fallback.")
    US_STATES = {} 

STATE_NAME_TO_CODE = {v.upper(): k for k, v in US_STATES.items()}

# --- HELPER FUNCTIONS ---

def load_json(path):
    """Safely loads a JSON file, returning an empty list/dict if missing."""
    if not os.path.exists(path):
        return [] if 'log' in path else {}
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Error loading {path}: {e}")
        return [] if 'log' in path else {}

def save_json(data, path):
    """Saves data to a JSON file with pretty indentation."""
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def normalize_state(value):
    """
    Normalizes state inputs to 2-letter codes or 'US'.
    Returns None if the value cannot be mapped.
    """
    if not isinstance(value, str): 
        return None
    clean_val = value.strip().upper()
    
    # Handle National Data explicit identifiers
    national_identifiers = ['UNITED STATES', 'USA', 'US', 'NATIONAL', 'U.S.', 'TOTAL US', 'AMERICA']
    if clean_val in national_identifiers:
        return 'US'
        
    if clean_val in US_STATES: 
        return clean_val
    if clean_val in STATE_NAME_TO_CODE: 
        return STATE_NAME_TO_CODE[clean_val]
    return None

def parse_manual_input(user_input):
    """
    Parses input string like '500, Citation'.
    Returns (float_value, citation_string) or (None, None).
    """
    if user_input.lower() == 'skip' or user_input.strip() == "":
        return None, None
    
    parts = user_input.split(',')
    try:
        val_str = parts[0].strip()
        val = float(val_str)
        note = parts[1].strip() if len(parts) > 1 else "Manual Entry (No citation)"
        return val, note
    except ValueError:
        return None, None

def calculate_monthly_value(raw_val, frequency):
    """
    Converts a raw numeric value into a monthly float based on frequency.
    Handles both single chars ('a', 'w') and full words ('annual', 'weekly').
    Returns None if the value is NaN.
    """
    try:
        # Clean string artifacts
        clean_str = str(raw_val).replace('$', '').replace(',', '').replace(' ', '')
        val = float(clean_str)
        
        if math.isnan(val):
            return None

        # Normalize frequency input
        freq_norm = str(frequency).lower().strip() if frequency else 'm'

        # Math Logic
        if freq_norm in ['a', 'annual']:
            val = val / 12.0
        elif freq_norm in ['w', 'weekly']:
            val = (val * 52.0) / 12.0
        # 'm' or 'monthly' passes through unchanged
        
        return val
    except (ValueError, TypeError):
        return None

# --- CORE LOGIC ---

def process_dataframe(df, config, final_data):
    """
    Iterates through a loaded DataFrame and updates final_data 
    based on the configuration map.
    """
    state_col = config['state_col']
    val_col = config['value_col']
    key_name = config['_key_name'] # Passed internally
    
    if state_col not in df.columns or val_col not in df.columns:
        print(f"   ❌ Columns missing. Needed: {state_col}, {val_col}")
        return 0

    count = 0
    for _, row in df.iterrows():
        state_code = normalize_state(str(row[state_col]))
        
        # Apply Normalization
        val = calculate_monthly_value(row[val_col], config.get('frequency'))

        if state_code and val is not None:
            if state_code == 'US':
                final_data["national"][key_name] = val
            elif state_code in final_data["states"]:
                final_data["states"][state_code][key_name] = val
                count += 1
    
    return count

def ingest_sources(source_map, final_data):
    """
    Loads files defined in source_map and populates final_data.
    """
    print("\n--- 2. PROCESSING FILES ---")
    
    for key, config in source_map.items():
        file_path = os.path.join(PATHS['raw_dir'], config['file'])
        config['_key_name'] = key # Inject key for the processor
        
        print(f"Processing '{key}' from {config['file']}...")
        
        if not os.path.exists(file_path):
            print(f"   ⚠️ File not found: {file_path}")
            continue

        try:
            if config.get('file_type') == 'excel':
                df = pd.read_excel(file_path)
            else:
                df = pd.read_csv(file_path)
            
            df.columns = [c.strip() for c in df.columns if c]

            if config.get('filter'):
                f_col = config['filter']['col']
                f_val = str(config['filter']['val'])
                if f_col in df.columns:
                    df = df[df[f_col].astype(str) == f_val]

            final_data["metadata"][key] = {
                "source": config.get("source", "Unknown"),
                "year": config.get("year", "Unknown"),
                "desc": config.get("description", "")
            }

            count = process_dataframe(df, config, final_data)
            print(f"   ✅ Loaded {count} records.")

        except Exception as e:
            print(f"   ❌ Critical Error processing {key}: {e}")

def apply_historical_audits(final_data, audit_log, source_map):
    """
    Fills gaps in final_data using the historical manual_audit_log.
    CRITICAL: Applies frequency normalization to the raw log value.
    """
    print("\n--- 3. REHYDRATING FROM AUDIT LOG ---")
    if not audit_log:
        print("   No historical manual entries found.")
        return

    restored_count = 0
    
    for entry in audit_log:
        scope = entry.get('scope')
        key = entry.get('key')
        raw_val = entry.get('value')
        
        # Look up frequency from map to apply correct math
        freq = 'm'
        if key in source_map:
            freq = source_map[key].get('frequency', 'm')

        # Normalize
        norm_val = calculate_monthly_value(raw_val, freq)
        
        if norm_val is not None:
            if scope == 'National':
                if key not in final_data["national"]:
                    final_data["national"][key] = norm_val
                    restored_count += 1
            elif scope in final_data["states"]:
                if key not in final_data["states"][scope]:
                    final_data["states"][scope][key] = norm_val
                    restored_count += 1
                
    print(f"   ✅ Restored {restored_count} manual entries from history (Normalized).")

def interrogate_missing_data(final_data, source_map, new_audit_entries):
    """
    Checks for missing keys. Prompts user for RAW input,
    normalizes it for the app, but logs the RAW value for audits.
    """
    print("\n--- 4. GAPS ANALYSIS ---")
    required_keys = list(source_map.keys())
    
    # 1. Check National
    print(">> Checking National Averages...")
    for key in required_keys:
        if key not in final_data["national"]:
            print(f"⚠️  [United States] is missing '{key}'")
            val_input = input(f"   Enter value for US {key} (e.g. '3000, USDA'): ")
            
            raw_val, note = parse_manual_input(val_input)
            if raw_val is not None:
                # Calculate
                freq = source_map[key].get('frequency', 'm')
                norm_val = calculate_monthly_value(raw_val, freq)
                
                # Store Normalized
                final_data["national"][key] = norm_val
                
                # Log Raw
                new_audit_entries.append({
                    "timestamp": str(datetime.datetime.now()),
                    "scope": "National",
                    "key": key,
                    "value": raw_val,
                    "citation": note
                })

    # 2. Check States
    print("\n>> Checking State Gaps...")
    for state_code in sorted(US_STATES.keys()):
        state_obj = final_data["states"][state_code]
        for key in required_keys:
            if key not in state_obj:
                print(f"⚠️  [{state_code}] is missing '{key}'")
                val_input = input(f"   Enter value for {state_code} {key} (or 'skip'): ")
                
                raw_val, note = parse_manual_input(val_input)
                if raw_val is not None:
                    # Calculate
                    freq = source_map[key].get('frequency', 'm')
                    norm_val = calculate_monthly_value(raw_val, freq)
                    
                    # Store Normalized
                    final_data["states"][state_code][key] = norm_val
                    
                    # Log Raw
                    new_audit_entries.append({
                        "timestamp": str(datetime.datetime.now()),
                        "scope": state_code,
                        "key": key,
                        "value": raw_val,
                        "citation": note
                    })

def run_ingest():
    print("--- 1. INITIALIZATION ---")
    
    if not os.path.exists(PATHS['map']):
        print("❌ Map not found. Run scripts/setup_wizard.py first.")
        return
    
    source_map = load_json(PATHS['map'])
    audit_log = load_json(PATHS['audit'])
    
    final_data = {
        "metadata": {},
        "national": {},
        "states": {code: {"name": name} for code, name in US_STATES.items()}
    }
    
    # Execution Pipeline
    ingest_sources(source_map, final_data)
    
    # Pass source_map to these so they know the Frequency
    apply_historical_audits(final_data, audit_log, source_map)
    
    new_audit_entries = []
    interrogate_missing_data(final_data, source_map, new_audit_entries)
    
    # Save Results
    print("\n--- 5. SAVING ---")
    save_json(final_data, PATHS['output'])
    print(f"✅ Data compiled to {PATHS['output']}")
    
    if new_audit_entries:
        full_log = audit_log + new_audit_entries
        save_json(full_log, PATHS['audit'])
        print(f"📝 Audit log updated with {len(new_audit_entries)} new entries.")
    else:
        print("📝 No new manual entries to log.")

if __name__ == "__main__":
    run_ingest()