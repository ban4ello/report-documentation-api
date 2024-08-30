create TABLE person (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    surname VARCHAR(255)
);

create TABLE post (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    content VARCHAR(255),
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES person(id)
);

-- id: 1
-- ITRWorkedDays: 13
-- coeficientOfNDS: 1.2
-- costOfElectricityPerDay: 550
-- galvanizedValue: 1000
-- numberOfDaysPerShift: 21
-- numberOfHoursPerShift: 8
-- rentalCostPerDay: 170
-- profitabilityCoeficient: 0.1
-- title: "Калькуляция-30.7.2024"
-- transportValue: 2000
-- dateOfCreation: "30.7.2024"
-- lastEditDate: "30.7.2024 6:24:33"

-- ITRData: {table: Array(6)}
-- consumablesData: (18) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
-- hardwareData: (5) [{…}, {…}, {…}, {…}, {…}]
-- metalData: (3) [{…}, {…}, {…}]
-- specificationData: {table: Array(1), notes: 'specificationData notes'}
-- workersData: {table: Array(3), notes: 'workersData notes'}

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
    date_of_creation TIMESTAMP,
    last_edit_date TIMESTAMP
);