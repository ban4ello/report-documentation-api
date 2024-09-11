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
	FOREIGN KEY (parent_calculation_id) REFERENCES parent_calculation(id) ON DELETE CASCADE,
	calculation_type VARCHAR(255),
	consumables_data JSON,
	hardware_data JSON,
	metal_data JSON,
	total DECIMAL
);


create TABLE specification_data (
	id SERIAL PRIMARY KEY,
	notes VARCHAR(255),
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	calculation_id INTEGER,
	FOREIGN KEY (calculation_id) REFERENCES calculation(id) ON DELETE CASCADE
);

create TABLE specification_data_table (
	id SERIAL PRIMARY KEY,
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	name VARCHAR(255),
	quantity INTEGER,
	value_per_unit DECIMAL,
	unit_of_measurement VARCHAR(255),
	total_weight INTEGER,
	specification_data_id INTEGER,
	FOREIGN KEY (specification_data_id) REFERENCES specification_data(id) ON DELETE CASCADE
);

create TABLE workers_data (
	id SERIAL PRIMARY KEY,
	notes VARCHAR(255),
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	calculation_id INTEGER,
	FOREIGN KEY (calculation_id) REFERENCES calculation(id) ON DELETE CASCADE
);

create TABLE workers_data_table (
	id SERIAL PRIMARY KEY,
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	name VARCHAR(255),
	number_of_hours_worked INTEGER,
	salary_per_day INTEGER,
	salary_per_hour INTEGER,
	total DECIMAL,
	workers_data_id INTEGER,
	FOREIGN KEY (workers_data_id) REFERENCES workers_data(id) ON DELETE CASCADE
);

create TABLE itr_data (
	id SERIAL PRIMARY KEY,
	notes VARCHAR(255),
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	calculation_id INTEGER,
	FOREIGN KEY (calculation_id) REFERENCES calculation(id) ON DELETE CASCADE
);

create TABLE itr_data_table (
	id SERIAL PRIMARY KEY,
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	name VARCHAR(255),
	salary_per_month INTEGER,
	itr_data_id INTEGER,
	FOREIGN KEY (itr_data_id) REFERENCES itr_data(id) ON DELETE CASCADE
);

create TABLE workers_tax_data (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255),
	coefficient DECIMAL,
	coefficient_a DECIMAL,
	coefficient_b DECIMAL,
	key VARCHAR(255),
	subtotal DECIMAL,
	total DECIMAL,
	calculation_id INTEGER,
	order_id INTEGER,
	FOREIGN KEY (calculation_id) REFERENCES calculation(id) ON DELETE CASCADE
);

create TABLE itr_tax_data (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255),
	coefficient DECIMAL,
	coefficient_a DECIMAL,
	coefficient_b DECIMAL,
	key VARCHAR(255),
	subtotal DECIMAL,
	total DECIMAL,
	calculation_id INTEGER,
	order_id INTEGER,
	FOREIGN KEY (calculation_id) REFERENCES calculation(id) ON DELETE CASCADE
);