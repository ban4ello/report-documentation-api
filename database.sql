create TABLE users (
	id SERIAL PRIMARY KEY,
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	role VARCHAR(10) DEFAULT 'guest',
    username VARCHAR(255),
    email VARCHAR(50) NOT NULL UNIQUE,
    isActivated BOOLEAN DEFAULT FALSE,
    activationLink VARCHAR(255),
    password VARCHAR(255) NOT NULL
);

create TABLE login_attempts (
	id SERIAL PRIMARY KEY,
	email VARCHAR(50) NOT NULL,
	success BOOLEAN DEFAULT FALSE,
	ip_address VARCHAR(45),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

create TABLE tokenSchema (
	id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    refreshToken VARCHAR(50) NOT NULL UNIQUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

create TABLE workers (
	id SERIAL PRIMARY KEY,
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	name VARCHAR(255),
	lastname VARCHAR(255),
	position VARCHAR(255)
);

create TABLE parent_calculation (
	id SERIAL PRIMARY KEY,
	title VARCHAR(255),
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

create TABLE calculation (
	id SERIAL PRIMARY KEY,
	itr_worked_days DECIMAL,
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
	total_metal_per_item DECIMAL,
	total_processing_per_item DECIMAL,
	total_profitability_per_item DECIMAL,
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

create TABLE calculation_media_files (
	id SERIAL PRIMARY KEY,
	calculation_id INTEGER NOT NULL,
	file_name VARCHAR(255) NOT NULL,
	file_type VARCHAR(50) NOT NULL,
	file_size INTEGER NOT NULL,
	file_data BYTEA NOT NULL,
	date_of_creation TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (calculation_id) REFERENCES calculation(id) ON DELETE CASCADE
);