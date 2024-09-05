const db = require('../db');

class CalculationController {
    async createCalculation(req, res) {
        const {
            itrWorkedDays,
            coeficientOfNds,
            costOfElectricityPerDay,
            galvanizedValue,
            numberOfDaysPerShift,
            numberOfHoursPerShift,
            rentalCostPerDay,
            profitabilityCoeficient,
            title,
            transportValue,
            lastEditDate,
            parentCalculationId,
            calculationType,
            consumablesData,
            hardwareData,
            metalData,
        } = req.body

        let newCalculationId = parentCalculationId;
        if (calculationType === 'plan') {
            const parent = await db.query(`INSERT INTO parent_calculation (title) values ($1) RETURNING *`, [title])
            newCalculationId = parent.rows[0].id;
        }

        const newCalculation = await db.query(`INSERT INTO calculation (
            itr_worked_days,
            coeficient_of_nds,
            cost_of_electricity_per_day,
            galvanized_value,
            number_of_days_per_shift,
            number_of_hours_per_shift,
            rental_cost_per_day,
            profitability_coeficient,
            title,
            transport_value,
            last_edit_date,
            parent_calculation_id,
            calculation_type,
            consumables_data,
            hardware_data,
            metal_data
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
         [
            itrWorkedDays,
            coeficientOfNds,
            costOfElectricityPerDay,
            galvanizedValue,
            numberOfDaysPerShift,
            numberOfHoursPerShift,
            rentalCostPerDay,
            profitabilityCoeficient,
            title,
            transportValue,
            lastEditDate,
            newCalculationId,
            calculationType,
            consumablesData,
            hardwareData,
            metalData,
        ])
        
        res.json(newCalculation.rows[0])
    }
    
    async updCalculation(req, res) {
        const id = req.params.id
        const {
            itrWorkedDays,
            coeficientOfNds,
            costOfElectricityPerDay,
            galvanizedValue,
            numberOfDaysPerShift,
            numberOfHoursPerShift,
            rentalCostPerDay,
            profitabilityCoeficient,
            title,
            transportValue,
            lastEditDate,
            consumablesData,
            hardwareData,
            metalData,
        } = req.body

        const calculation = await db.query(`UPDATE calculation set 
            itr_worked_days = $1,
            coeficient_of_nds = $2,
            cost_of_electricity_per_day = $3,
            galvanized_value = $4,
            number_of_days_per_shift = $5,
            number_of_hours_per_shift = $6,
            rental_cost_per_day = $7,
            profitability_coeficient = $8,
            title = $9,
            transport_value = $10,
            last_edit_date = $11,
            consumables_data = $12,
            hardware_data = $13,
            metal_data = $14
            where id = $15 RETURNING *`,
         [
            itrWorkedDays,
            coeficientOfNds,
            costOfElectricityPerDay,
            galvanizedValue,
            numberOfDaysPerShift,
            numberOfHoursPerShift,
            rentalCostPerDay,
            profitabilityCoeficient,
            title,
            transportValue,
            lastEditDate,
            consumablesData,
            hardwareData,
            metalData,
            id
        ])

        res.json(calculation.rows[0])
    }

    async getCalculation(req, res) {
        const id = req.params.id
        const calculation = await db.query('SELECT * FROM calculation where id = $1', [id])
        res.json(calculation.rows[0])
    }

    async getCalculationByParentId(req, res) {
        const id = req.query.id
        const calculation = await db.query('SELECT * FROM calculation where parent_calculation_id = $1', [id])
        res.json(calculation.rows)
    }

    async getCalculations(req, res) {
        const calculations = await db.query('SELECT * FROM calculation')
        res.json(calculations.rows)
    }

    async deleteCalculation(req, res) {
        const id = req.params.id
        const calculation = await db.query('DELETE FROM calculation where id = $1', [id])
        res.json(calculation.rows[0])
    }
}

module.exports = new CalculationController()