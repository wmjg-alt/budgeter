import json
import os

# --- THE WISHLIST ---
# Refined schema based on our new plan
WISHLIST = {
    "housing_rent": {
        "desc": "Average Monthly Rent (Household)",
        "query": "Census median gross rent by state 2023 csv"
    },
    "housing_mortgage": {
        "desc": "Average Monthly Mortgage Payment",
        "query": "American Community Survey mortgage status by state csv"
    },
    "food_at_home": {
        "desc": "Food At Home (Groceries) - Single Person",
        "query": "USDA food expenditure by state csv"
    },
    "food_away_from_home": {
        "desc": "Food Away From Home (Dining Out) - Single Person",
        "query": "USDA food expenditure by state csv"
    },
    "food_total": {
        "desc": "Total Food Expenditure - Single Person",
        "query": "USDA food expenditure by state csv"
    },
    "electricity": {
        "desc": "Average Monthly Electricity Bill",
        "query": "EIA average monthly electricity bill by state 2024 csv"
    },
    "water": {
        "desc": "Average Monthly Water/Sewer Cost",
        "query": "Average water bill by state world population review csv"
    },
    "garbage": {
        "desc": "Average Monthly Trash/Recycling Cost",
        "query": "Average Trash utilities cost by state csv"
    },
    "car_insurance": {
        "desc": "Average Monthly Car Insurance Premium",
        "query": "NAIC auto insurance average expenditure by state csv"
    },
    "health_insurance": {
        "desc": "Average Monthly Health Insurance Premium Bill",
        "query": "KFF average marketplace premiums by state 2024 csv"
    },
    "life_insurance": {
        "desc": "Average Monthly Life Insurance Expenditure",
        "query": "life insurance premiums average expense by state 2024 csv"
    },
    "internet": {
        "desc": "Average Monthly Internet Bill",
        "query": "BroadbandNow average internet cost by state csv"
    },
    "cell_phone": {
        "desc": "Average Monthly Cell Phone Bill",
        "query": "median cell phone bill cost by state csv"
    },
    "natural_gas": {
        "desc": "Average Monthly Natural Gas Bill (Residential)",
        "query": "EIA average residential natural gas bill by state csv"
    },
    "childcare": {
        "desc": "Average Annual Childcare Cost (Infant/Center-based)",
        "query": "DOL childcare prices by state 2024 csv"
    },
    "car_payment": {
        "desc": "Average Monthly Car Payment Cost",
        "query": "median car payment by state 2024 csv"
    },
    "home_security": {
        "desc": "Average Monthly Home Security Cost",
        "query": "home security bill by state 2024 csv"
    }
}

CONFIG_PATH = 'config/sources_map.json'

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    return {}

def save_config(data):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(data, f, indent=4)
    print(f"✅ Saved to {CONFIG_PATH}")

def run_wizard():
    print("--- 🧙 DATA SOURCE WIZARD (v3) ---")
    current_map = load_config()
    
    for key, info in WISHLIST.items():
        if key in current_map:
            print(f"✅ {key} is already mapped. Skipping.")
            continue

        print(f"\n------------------------------------------------")
        print(f"MISSING: {key.upper()}")
        print(f"Description: {info['desc']}")
        print(f"Recommended Search: {info['query']}")
        print(f"------------------------------------------------")
        
        choice = input("Did you find a file? (y/n/skip): ").lower().strip()
        
        if choice == 'y':
            filename = input("Filename (in raw_data/): ").strip()
            file_path = os.path.join('raw_data', filename)
            
            if not os.path.exists(file_path):
                print(f"❌ Error: {filename} not found. Skipping.")
                continue

            # Detect file type
            ftype = 'csv'
            if filename.endswith('.xlsx') or filename.endswith('.xls'):
                ftype = 'excel'

            # 1. Basic Columns
            state_col = input(f"Column header for STATE: ").strip()
            val_col = input(f"Column header for VALUE: ").strip()
            
            # 2. Filter Logic
            filters = {}
            needs_filter = input("Do we need to filter rows? (e.g. limit to Year=2024) (y/n): ").lower().strip()
            if needs_filter == 'y':
                filter_col = input("Filter Column Name (e.g. 'Year'): ").strip()
                filter_val = input("Filter Value to Keep (e.g. '2024'): ").strip()
                filters = {"col": filter_col, "val": filter_val}

            # 3. Frequency Check
            freq_input = input("Is this data Annual or Monthly or Weekly? (a/m/w): ").lower().strip()
            frequency = freq_input if freq_input in ('a','w','m') else 'm'

            # 4. Metadata
            year = input(f"Data Year (e.g. 2024): ").strip()
            source_name = input(f"Source Name (e.g. USDA): ").strip()

            # Save to map
            entry = {
                "file": filename,
                "file_type": ftype,
                "state_col": state_col,
                "value_col": val_col,
                "filter": filters if filters else None,
                "frequency": frequency,
                "year": year,
                "source": source_name,
                "description": info['desc']
            }
            
            current_map[key] = entry
            save_config(current_map)
            
        elif choice == 'skip':
            print("Skipping.")

    print("\n✨ Wizard Complete. Run 'python scripts/ingest_data.py'")

if __name__ == "__main__":
    run_wizard()