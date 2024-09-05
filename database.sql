create TABLE parent_calculation (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

create TABLE calculation (
    id SERIAL PRIMARY KEY,
    itr_worked_days INTEGER,
    coeficient_of_nds DECIMAL,
    cost_of_electricity_per_day INTEGER,
    galvanized_value INTEGER,
    number_of_days_per_shift INTEGER,
    number_of_hours_per_shift INTEGER,
    rental_cost_per_day INTEGER,
    profitability_coeficient DECIMAL,
    title VARCHAR(255),
    transport_value INTEGER,
    date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_edit_date TIMESTAMP,
    parent_calculation_id INTEGER,
    FOREIGN KEY (parent_calculation_id) REFERENCES parent_calculation(id),
    calculation_type VARCHAR(255),
    consumables_data JSON,
    hardware_data JSON,
    metal_data JSON,
);