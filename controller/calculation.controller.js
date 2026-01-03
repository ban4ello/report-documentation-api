const db = require('../db');
const camelize = (s) => s.replace(/_./g, (x) => x[1].toUpperCase());

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
      dateOfCreation,
      lastEditDate,
      parentCalculationId,
      calculationType,
      consumablesData,
      hardwareData,
      metalData,
      specificationData,
			workersData,
			itrData,
      workersTaxData,
      itrTaxData,
      totalMetalPerItem,
      totalProcessingPerItem,
      totalProfitabilityPerItem,
      total,
      isMetalEnabled,
      isHardwareEnabled
    } = req.body;
    let resSpecificationDataTable = [];
    let resWorkersTaxDataTable = [];
    let resItrTaxDataTable = [];
    let resWorkersDataTable = [];
    let resItrDataTable = [];

    let newParentCalculationId = parentCalculationId;
    if (calculationType === 'plan') {
      const parent = await req.userDb.query(
        `INSERT INTO parent_calculation (title, date_of_creation) values ($1, $2) RETURNING *`,
        [title, dateOfCreation || new Date()]
      );
      newParentCalculationId = parent.rows[0].id;
    }

    const newCalculation = await req.userDb.query(
      `INSERT INTO calculation (
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
			date_of_creation,
			last_edit_date,
			parent_calculation_id,
			calculation_type,
			consumables_data,
			hardware_data,
			metal_data,
			total_metal_per_item,
			total_processing_per_item,
			total_profitability_per_item,
      total,
			is_metal_enabled,
			is_hardware_enabled
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *`,
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
        dateOfCreation || new Date(),
        lastEditDate,
        newParentCalculationId,
        calculationType,
        consumablesData,
        hardwareData,
        metalData,
        totalMetalPerItem,
        totalProcessingPerItem,
        totalProfitabilityPerItem,
        total,
        isMetalEnabled || false,
        isHardwareEnabled || false
      ]
    );

		const newCalculationId = newCalculation.rows[0].id;

    if (itrTaxData) {
      resItrTaxDataTable = await Promise.all(
        itrTaxData.map((item) => {
          return new Promise((res) =>
            res(
              req.userDb.query(
								`INSERT INTO itr_tax_data (
                  order_id,
									name,
                  coefficient,
                  coefficient_a,
                  coefficient_b,
                  key,
                  subtotal,
                  total,
                  calculation_id
                ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [
                item.orderId,
                item.name,
                item.coefficient,
                item.coefficientA,
                item.coefficientB,
                item.key,
                item.subtotal,
                item.total,
                newCalculationId
              ])
            )
          );
        })
      );
    }

    if (workersTaxData) {
      resWorkersTaxDataTable = await Promise.all(
        workersTaxData.map((item) => {
          return new Promise((res) =>
            res(
              req.userDb.query(
								`INSERT INTO workers_tax_data (
                  order_id,
									name,
                  coefficient,
                  coefficient_a,
                  coefficient_b,
                  key,
                  subtotal,
                  total,
                  calculation_id
                ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [
                item.orderId,
                item.name,
                item.coefficient,
                item.coefficientA,
                item.coefficientB,
                item.key,
                item.subtotal,
                item.total,
                newCalculationId
              ])
            )
          );
        })
      );
    }

    if (specificationData) {
      const newSpecificationDataRes = await req.userDb.query(`INSERT INTO specification_data (notes, calculation_id) values ($1, $2) RETURNING *`, [
        specificationData.notes,
        newCalculationId
      ]);
			const newSpecificationDataId = newSpecificationDataRes.rows[0].id;

      resSpecificationDataTable = await Promise.all(
        specificationData.table.map((item) => {
          return new Promise((res) =>
            res(
              req.userDb.query(
								`INSERT INTO specification_data_table (
									name,
									quantity,
									value_per_unit,
									unit_of_measurement,
									total_weight,
									specification_data_id
								) values ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [item.name, item.quantity, item.valuePerUnit, item.unitOfMeasurement, item.totalWeight, newSpecificationDataId]
              )
            )
          );
        })
      );
    }

    if (workersData) {
      const newWorkersDataRes = await req.userDb.query(`INSERT INTO workers_data (notes, calculation_id) values ($1, $2) RETURNING *`, [
        workersData.notes,
        newCalculationId
      ]);
			const newWorkersDataId = newWorkersDataRes.rows[0].id;

      resWorkersDataTable = await Promise.all(
        workersData.table.map((item) => {
          return new Promise((res) =>
            res(
              req.userDb.query(
								`INSERT INTO workers_data_table (
									name,
									number_of_hours_worked,
									salary_per_day,
									salary_per_hour,
									total,
									workers_data_id
								) values ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [item.name, item.numberOfHoursWorked, item.salaryPerDay, item.salaryPerHour, item.total, newWorkersDataId]
              )
            )
          );
        })
      );
    }

    if (itrData) {
      const newItrDataRes = await req.userDb.query(`INSERT INTO itr_data (notes, calculation_id) values ($1, $2) RETURNING *`, [
        itrData.notes,
        newCalculationId
      ]);
			const newItrDataId = newItrDataRes.rows[0].id;

      resItrDataTable = await Promise.all(
        itrData.table.map((item) => {
          return new Promise((res) =>
            res(
              req.userDb.query(
								`INSERT INTO itr_data_table (
									name,
									salary_per_month,
									itr_data_id
								) values ($1, $2, $3) RETURNING *`,
                [item.name, item.salaryPerMonth, newItrDataId]
              )
            )
          );
        })
      );
    }

    res.json({
      ...newCalculation.rows[0],
      specification_data: resSpecificationDataTable.map((item) => item.rows[0]),
      workers_data: resWorkersDataTable.map((item) => item.rows[0]),
      itr_data: resItrDataTable.map((item) => item.rows[0]),
      workers_tax_data: resWorkersTaxDataTable.map((item) => item.rows[0]),
      itr_tax_data: resItrTaxDataTable.map((item) => item.rows[0]),
    });
  }

  async updCalculation(req, res) {
    const id = req.params.id;
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
      dateOfCreation,
      lastEditDate,
      consumablesData,
      hardwareData,
      metalData,
			specificationData,
			workersData,
			itrData,
      workersTaxData,
      itrTaxData,
      totalMetalPerItem,
      totalProcessingPerItem,
      totalProfitabilityPerItem,
      total,
      isMetalEnabled,
      isHardwareEnabled
    } = req.body;

    const calculation = await req.userDb.query(
      `UPDATE calculation set 
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
				date_of_creation = $11,
				last_edit_date = $12,
				consumables_data = $13,
				hardware_data = $14,
				metal_data = $15,
				total = $16,
				total_metal_per_item = $17,
				total_processing_per_item = $18,
				total_profitability_per_item = $19,
				is_metal_enabled = $20,
				is_hardware_enabled = $21
				where id = $22 RETURNING *`,
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
        dateOfCreation,
        lastEditDate,
        consumablesData,
        hardwareData,
        metalData,
        total,
        totalMetalPerItem,
        totalProcessingPerItem,
        totalProfitabilityPerItem,
        isMetalEnabled || false,
        isHardwareEnabled || false,
        id
      ]
    );

		if (specificationData) {
			const specificationDataRes = await req.userDb.query(
				`UPDATE specification_data set 
					notes = $1
					where calculation_id = $2 RETURNING *`,
				[
					specificationData.notes,
					id
				]
			);

			await Promise.all(
        specificationData.table.map(async (item) => {
					const isSpecificationItemExists = await req.userDb.query(
            `SELECT * FROM specification_data_table WHERE id = $1`,
            [item.id]
          );

          return new Promise((res) => {
						if (isSpecificationItemExists.rows.length) {
            res(
              req.userDb.query(
									`UPDATE specification_data_table set
										name = $1,
										quantity = $2,
										value_per_unit = $3,
										unit_of_measurement = $4,
										total_weight = $5
										where id = $6 RETURNING *`,
									[item.name, item.quantity, item.valuePerUnit, item.unitOfMeasurement, item.totalWeight, item.id]
								)
							)
						} else {
            res(
              req.userDb.query(
									`INSERT INTO specification_data_table (
										name,
										quantity,
										value_per_unit,
										unit_of_measurement,
										total_weight,
										specification_data_id
									) values ($1, $2, $3, $4, $5, $6) RETURNING *`,
									[item.name, item.quantity, item.valuePerUnit, item.unitOfMeasurement, item.totalWeight, specificationDataRes.rows[0].id]
								)
							)
						}
					});
        })
      );
		}

		if (workersData) {
			const workersDataRes = await req.userDb.query(
				`UPDATE workers_data set 
					notes = $1
					where calculation_id = $2 RETURNING *`,
				[
					workersData.notes,
					id
				]
			);

			await Promise.all(
        workersData.table.map(async (item) => {
					const isWorkerItemExists = await req.userDb.query(
            `SELECT * FROM workers_data_table WHERE id = $1`,
            [item.id]
          );

					return new Promise((res) => {
						if (isWorkerItemExists.rows.length) {
            res(
              req.userDb.query(
									`UPDATE workers_data_table set
										name = $1,
										number_of_hours_worked = $2,
										salary_per_day = $3,
										salary_per_hour = $4,
										total = $5
										where id = $6 RETURNING *`,
									[item.name, item.numberOfHoursWorked, item.salaryPerDay, item.salaryPerHour, item.total, item.id]
								)
							)
						} else {
            res(
              req.userDb.query(
									`INSERT INTO workers_data_table (
										name,
										number_of_hours_worked,
										salary_per_day,
										salary_per_hour,
										total,
										workers_data_id
									) values ($1, $2, $3, $4, $5, $6) RETURNING *`,
									[item.name, item.numberOfHoursWorked, item.salaryPerDay, item.salaryPerHour, item.total, workersDataRes.rows[0].id]
								)
							)
						}
					});
        })
      );
		}

		if (itrData) {
			const itrDataRes = await req.userDb.query(
				`UPDATE itr_data set 
					notes = $1
					where calculation_id = $2 RETURNING *`,
				[
					itrData.notes,
					id
				]
			);

			await Promise.all(
        itrData.table.map(async (item) => {
					const isItrItemExists = await req.userDb.query(
            `SELECT * FROM itr_data_table WHERE id = $1`,
            [item.id]
          );

					return new Promise((res) => {
						if (isItrItemExists.rows.length) {
            res(
              req.userDb.query(
									`UPDATE itr_data_table set
										name = $1,
										salary_per_month = $2
										where id = $3 RETURNING *`,
									[item.name, item.salaryPerMonth, item.id]
								)
							)
						} else {
            res(
              req.userDb.query(
									`INSERT INTO itr_data_table (
										name,
										salary_per_month,
										itr_data_id
									) values ($1, $2, $3) RETURNING *`,
									[item.name, item.salaryPerMonth, itrDataRes.rows[0].id]
								)
							)
						}
					});
        })
      );
		}

		if (workersTaxData) {
			await Promise.all(
        workersTaxData.map(async (item) => {
					const isWorkersTaxDataExists = await req.userDb.query(
            `SELECT * FROM workers_tax_data WHERE id = $1`,
            [item.id]
          );

					return new Promise((res) => {
						if (isWorkersTaxDataExists.rows.length) {
            res(
              req.userDb.query(
									`UPDATE workers_tax_data set
                    name = $1,
                    coefficient = $2,
                    coefficient_a = $3,
                    coefficient_b = $4,
                    key = $5,
                    subtotal = $6,
                    total = $7,
                    order_id = $8
										where id = $9 RETURNING *`,
									[
                    item.name,
                    item.coefficient,
                    item.coefficientA,
                    item.coefficientB,
                    item.key,
                    item.subtotal,
                    item.total,
                    item.orderId,
                    item.id,
                  ]
								)
							)
						} else {
							res(
                req.userDb.query(
                  `INSERT INTO workers_tax_data (
                    order_id,
                    name,
                    coefficient,
                    coefficient_a,
                    coefficient_b,
                    key,
                    subtotal,
                    total,
                    calculation_id
                  ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                  [
                    item.orderId,
                    item.name,
                    item.coefficient,
                    item.coefficientA,
                    item.coefficientB,
                    item.key,
                    item.subtotal,
                    item.total,
                    id
                  ]
                )
							)
						}
					});
        })
      );
		}

		if (itrTaxData) {
			await Promise.all(
        itrTaxData.map(async (item) => {
					const isItrTaxDataExists = await req.userDb.query(
            `SELECT * FROM itr_tax_data WHERE id = $1`,
            [item.id]
          );

					return new Promise((res) => {
						if (isItrTaxDataExists.rows.length) {
            res(
              req.userDb.query(
									`UPDATE itr_tax_data set
                    name = $1,
                    coefficient = $2,
                    coefficient_a = $3,
                    coefficient_b = $4,
                    key = $5,
                    subtotal = $6,
                    total = $7,
                    order_id = $8
										where id = $9 RETURNING *`,
									[
                    item.name,
                    item.coefficient,
                    item.coefficientA,
                    item.coefficientB,
                    item.key,
                    item.subtotal,
                    item.total,
                    item.orderId,
                    item.id,
                  ]
								)
							)
						} else {
							res(
                req.userDb.query(
                  `INSERT INTO itr_tax_data (
                    order_id,
                    name,
                    coefficient,
                    coefficient_a,
                    coefficient_b,
                    key,
                    subtotal,
                    total,
                    calculation_id
                  ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                  [
                    item.orderId,
                    item.name,
                    item.coefficient,
                    item.coefficientA,
                    item.coefficientB,
                    item.key,
                    item.subtotal,
                    item.total,
                    id
                  ]
                )
							)
						}
					});
        })
      );
		}

    res.json(calculation.rows[0]);
  }

  async getCalculation(req, res) {
    const id = req.params.id;
    const calculation = await req.userDb.query('SELECT * FROM calculation where id = $1', [id]);
    const newSpecificationData = await req.userDb.query('SELECT * FROM specification_data where calculation_id = $1', [id]);
    const newSpecificationDataNotes = newSpecificationData.rows[0].notes;
    const newSpecificationDataId = newSpecificationData.rows[0].id;
    const resSpecificationDataTable = await req.userDb.query('SELECT * FROM specification_data_table where specification_data_id = $1', [newSpecificationDataId]);
    const resWorkersTaxData = await req.userDb.query('SELECT * FROM workers_tax_data where calculation_id = $1', [id]);
    const resItrTaxData = await req.userDb.query('SELECT * FROM itr_tax_data where calculation_id = $1', [id]);

		const camelizeSpecificationData = resSpecificationDataTable.rows.map((row) => { // TODO: refactor this
			return Object.keys(row).reduce((acc, key) => {
				acc[camelize(key)] = row[key];
	
				return acc;
			}, {});
		});

    const newWorkersData = await req.userDb.query('SELECT * FROM workers_data where calculation_id = $1', [id]);
    const newWorkersDataNotes = newWorkersData.rows[0].notes;
    const newWorkersDataId = newWorkersData.rows[0].id;
    const resWorkersDataTable = await req.userDb.query('SELECT * FROM workers_data_table where workers_data_id = $1', [newWorkersDataId]);

		const camelizeWorkersData = resWorkersDataTable.rows.map((row) => { // TODO: refactor this
			return Object.keys(row).reduce((acc, key) => {
				acc[camelize(key)] = row[key];
	
				return acc;
			}, {});
		});

    const newItrDataRes = await req.userDb.query('SELECT * FROM itr_data where calculation_id = $1', [id]);
		const newItrData = newItrDataRes.rows.length ? newItrDataRes.rows[0] : {};
    const newItrDataId = newItrData.id;
    const newItrDataNotes = newItrData.notes || ('note-' + newItrDataId);
    // const newItrDataNotes = newItrData.notes;
    const resItrDataTable = await req.userDb.query('SELECT * FROM itr_data_table where itr_data_id = $1', [newItrDataId]);

		const camelizeItrData = resItrDataTable.rows.map((row) => { // TODO: refactor this
			return Object.keys(row).reduce((acc, key) => {
				acc[camelize(key)] = row[key];
	
				return acc;
			}, {});
		});

		const camelizeWorkersTaxData = resWorkersTaxData.rows.map((row) => { // TODO: refactor this
			return Object.keys(row).reduce((acc, key) => {
        switch (camelize(key)) {
          case 'calculationId':
          case 'coefficient':
          case 'coefficientA':
          case 'coefficientB':
          case 'subtotal':
          case 'total':
            acc[camelize(key)] = row[key] !== null ? Number(row[key]) : null;
            // acc[camelize(key)] = row[key];
            break;
            
          default:
            acc[camelize(key)] = row[key];
            break;
        }
	
				return acc;
			}, {});
		});

		const camelizeItrTaxData = resItrTaxData.rows.map((row) => { // TODO: refactor this
			return Object.keys(row).reduce((acc, key) => {
				acc[camelize(key)] = row[key];
	
				return acc;
			}, {});
		});

    res.json({
      ...calculation.rows[0],
      coeficient_of_nds: Number(calculation.rows[0].coeficient_of_nds),
      profitability_coeficient: Number(calculation.rows[0].profitability_coeficient),
      workers_tax_data: camelizeWorkersTaxData.sort((a,b) => a.orderId - b.orderId), // TODO: refactor: не должно быть зависимости от порядка расположения записей в массиве camelizeWorkersTaxData, так как в методе "computedWorkerTaxData" есть зависимость от порядка вычисления каждого поля
      itr_tax_data: camelizeItrTaxData.sort((a,b) => a.orderId - b.orderId), // TODO: refactor: не должно быть зависимости от порядка расположения записей в массиве camelizeWorkersTaxData, так как в методе "computedWorkerTaxData" есть зависимость от порядка вычисления каждого поля,
      specification_data: {
				id: newSpecificationDataId,
        table: camelizeSpecificationData,
        notes: newSpecificationDataNotes
      },
      workers_data: {
				id: newWorkersDataId,
        table: camelizeWorkersData,
        notes: newWorkersDataNotes
      },
      itr_data: {
				id: newItrDataId,
        table: camelizeItrData,
        notes: newItrDataNotes
      }
    });
  }

  async getCalculationByParentId(req, res) {
    const id = req.query.id;
    const calculation = await req.userDb.query('SELECT * FROM calculation where parent_calculation_id = $1', [id]);
    res.json(calculation.rows);
  }

  async getCalculations(req, res) {
    const filter = req.query;
    let calculations = {};
    const whereClauses = [];
    const values = [];

    for (const key in filter) {
      if (filter.hasOwnProperty(key)) {
        values.push(filter[key]);
        whereClauses.push(`${key} = $${values.length}`);
      }
    }

    const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    calculations = await req.userDb.query(`SELECT * FROM calculation ${whereClause}`, values);

    res.json(calculations.rows);
  }

  async deleteCalculation(req, res) {
    const id = req.params.id;
    const calculation = await req.userDb.query('DELETE FROM calculation where id = $1', [id]);
    res.json(calculation.rows[0]);
  }

  async deleteItemFromWorkersData(req, res) {
    const id = req.params.id;

		const isWorkerExists = await req.userDb.query(`SELECT * FROM workers_data_table WHERE id = $1`, [id]);

		if (isWorkerExists.rows.length) {
			await req.userDb.query('DELETE FROM workers_data_table where id = $1', [id]);

			res.json([]);
		}
  }

  async deleteItemFromItrData(req, res) {
    const id = req.params.id;

		const isItrExists = await req.userDb.query(`SELECT * FROM itr_data_table WHERE id = $1`, [id]);

		if (isItrExists.rows.length) {
			await req.userDb.query('DELETE FROM itr_data_table where id = $1', [id]);

			res.json([]);
		}
  }

  async deleteItemFromSpecificationData(req, res) {
    const id = req.params.id;

		const isItemExists = await req.userDb.query(`SELECT * FROM specification_data_table WHERE id = $1`, [id]);

		if (isItemExists.rows.length) {
			await req.userDb.query('DELETE FROM specification_data_table where id = $1', [id]);

			res.json([]);
		}
  }

  async uploadMediaFiles(req, res) {
    const calculationId = req.params.id;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Файлы не были загружены' });
    }

    try {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      const maxFileSize = 10 * 1024 * 1024; // 10MB

      const uploadedFiles = [];

      for (const file of files) {
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({ 
            message: `Файл ${file.originalname} имеет недопустимый тип. Разрешены только PDF, JPG, PNG` 
          });
        }

        if (file.size > maxFileSize) {
          return res.status(400).json({ 
            message: `Файл ${file.originalname} превышает максимальный размер 10MB` 
          });
        }

        // Имя файла уже должно быть исправлено в middleware fixFileNameEncoding
        // Но на всякий случай делаем дополнительную проверку
        let fileName = file.originalname
        try {
          // Если имя содержит типичные символы неправильной кодировки (Ñ, Ð и т.д.)
          if (/[ÑÐ]/.test(fileName)) {
            const decodedName = Buffer.from(fileName, 'latin1').toString('utf8')
            if (!/[ÑÐ]/.test(decodedName)) {
              fileName = decodedName
            }
          }
        } catch (error) {
          console.warn('Could not decode filename, using original:', fileName)
        }

        const result = await req.userDb.query(
          `INSERT INTO calculation_media_files (
            calculation_id,
            file_name,
            file_type,
            file_size,
            file_data
          ) VALUES ($1, $2, $3, $4, $5) RETURNING id, file_name, file_type, file_size, date_of_creation`,
          [calculationId, fileName, file.mimetype, file.size, file.buffer]
        );

        uploadedFiles.push({
          id: result.rows[0].id,
          fileName: result.rows[0].file_name,
          fileType: result.rows[0].file_type,
          fileSize: result.rows[0].file_size,
          dateOfCreation: result.rows[0].date_of_creation
        });
      }

      res.json({ files: uploadedFiles });
    } catch (error) {
      console.error('Error uploading media files:', error);
      res.status(500).json({ message: 'Ошибка при загрузке файлов' });
    }
  }

  async getMediaFiles(req, res) {
    const calculationId = req.params.id;

    try {
      const result = await req.userDb.query(
        `SELECT id, file_name, file_type, file_size, date_of_creation 
         FROM calculation_media_files 
         WHERE calculation_id = $1 
         ORDER BY date_of_creation DESC`,
        [calculationId]
      );

      const camelize = (s) => s.replace(/_./g, (x) => x[1].toUpperCase());
      const files = result.rows.map((row) => {
        return Object.keys(row).reduce((acc, key) => {
          acc[camelize(key)] = row[key];
          return acc;
        }, {});
      });

      res.json(files);
    } catch (error) {
      console.error('Error getting media files:', error);
      res.status(500).json({ message: 'Ошибка при получении файлов' });
    }
  }

  async downloadMediaFile(req, res) {
    const fileId = req.params.id;

    try {
      const result = await req.userDb.query(
        `SELECT file_name, file_type, file_data 
         FROM calculation_media_files 
         WHERE id = $1`,
        [fileId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Файл не найден' });
      }

      const file = result.rows[0];
      res.setHeader('Content-Type', file.file_type);
      res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
      res.send(file.file_data);
    } catch (error) {
      console.error('Error downloading media file:', error);
      res.status(500).json({ message: 'Ошибка при скачивании файла' });
    }
  }

  async deleteMediaFile(req, res) {
    const fileId = req.params.id;

    try {
      const isFileExists = await req.userDb.query(
        `SELECT * FROM calculation_media_files WHERE id = $1`,
        [fileId]
      );

      if (isFileExists.rows.length) {
        await req.userDb.query('DELETE FROM calculation_media_files WHERE id = $1', [fileId]);
        res.json({ message: 'Файл удален' });
      } else {
        res.status(404).json({ message: 'Файл не найден' });
      }
    } catch (error) {
      console.error('Error deleting media file:', error);
      res.status(500).json({ message: 'Ошибка при удалении файла' });
    }
  }
}

module.exports = new CalculationController();
