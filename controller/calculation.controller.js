const db = require('../db');

class CalculationController {
    async createCalculation(req, res) {
        const {
            ITRWorkedDays,
            coeficientOfNDS,
            costOfElectricityPerDay,
            galvanizedValue,
            numberOfDaysPerShift,
            numberOfHoursPerShift,
            rentalCostPerDay,
            profitabilityCoeficient,
            title,
            transportValue,
            dateOfCreation,
            lastEditDate,
        } = req.body
        const newCalculation = await db.query(`INSERT INTO calculation (itr_worked_days, coeficient_of_nds, cost_of_electricity_per_day, galvanized_value, number_of_days_per_shift, number_of_hours_per_shift, rental_cost_per_day, profitability_coeficient, title, transport_value, date_of_creation, last_edit_date) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`, [ITRWorkedDays, coeficientOfNDS, costOfElectricityPerDay, galvanizedValue, numberOfDaysPerShift, numberOfHoursPerShift, rentalCostPerDay, profitabilityCoeficient, title, transportValue, dateOfCreation, lastEditDate])
        
        res.json(newCalculation.rows[0])
    }
    
    async getCalculation(req, res) {
        const id = req.params.id
        const calculation = await db.query('SELECT * FROM calculation where id = $1', [id])
        res.json(calculation.rows[0])
    }

    async getCalculations(req, res) {
        const calculations = await db.query('SELECT * FROM calculation')
        res.json(calculations.rows)
    }
}

module.exports = new CalculationController()