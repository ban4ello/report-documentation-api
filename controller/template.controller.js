const dbManager = require('../dbManager');

class TemplateController {
  constructor() {
    this.createTemplate = this.createTemplate.bind(this);
    this.getTemplates = this.getTemplates.bind(this);
    this.getTemplate = this.getTemplate.bind(this);
    this.updateTemplate = this.updateTemplate.bind(this);
    this.deleteTemplate = this.deleteTemplate.bind(this);
  }

  // Вспомогательный метод для проверки и создания таблиц шаблонов
  async ensureTemplateTables(userId) {
    try {
      await dbManager.ensureUserTables(userId);
    } catch (error) {
      console.error(`❌ Ошибка при проверке таблиц шаблонов для пользователя ${userId}:`, error);
      // Не бросаем ошибку, чтобы не блокировать работу
    }
  }

  async createTemplate(req, res) {
    try {
      // Убеждаемся, что таблицы шаблонов существуют
      await this.ensureTemplateTables(req.user.userId);
      
      const { title, templateType, workersData, itrData } = req.body;
      // Валидация
      if (!title || !templateType) {
        return res.status(400).json({
          message: 'Название и тип шаблона обязательны',
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      if (templateType !== 'workers' && templateType !== 'itr') {
        return res.status(400).json({
          message: 'Тип шаблона должен быть "workers" или "itr"',
          code: 'INVALID_TEMPLATE_TYPE'
        });
      }

      // Проверка наличия данных в зависимости от типа
      if (templateType === 'workers' && (!workersData || !Array.isArray(workersData))) {
        return res.status(400).json({
          message: 'Данные для шаблона "Зарплата - Цех" обязательны',
          code: 'MISSING_WORKERS_DATA'
        });
      }

      if (templateType === 'itr' && (!itrData || !Array.isArray(itrData))) {
        return res.status(400).json({
          message: 'Данные для шаблона "Зарплата - ИТР" обязательны',
          code: 'MISSING_ITR_DATA'
        });
      }

      // Создаем шаблон
      const templateResult = await req.userDb.query(
        `INSERT INTO templates (title, template_type) VALUES ($1, $2) RETURNING *`,
        [title, templateType]
      );

      const template = templateResult.rows[0];

      // Сохраняем данные в зависимости от типа шаблона
      if (templateType === 'workers') {
        for (const row of workersData) {
          await req.userDb.query(
            `INSERT INTO template_workers_data_table 
             (name, number_of_hours_worked, salary_per_day, salary_per_hour, total, template_id) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              row.name || null,
              row.numberOfHoursWorked || null,
              row.salaryPerDay || null,
              row.salaryPerHour || null,
              row.total || null,
              template.id
            ]
          );
        }
      } else if (templateType === 'itr') {
        for (const row of itrData) {
          await req.userDb.query(
            `INSERT INTO template_itr_data_table (name, salary_per_month, template_id) 
             VALUES ($1, $2, $3)`,
            [
              row.name || null,
              row.salaryPerMonth || null,
              template.id
            ]
          );
        }
      }

      // Получаем полные данные шаблона
      const fullTemplate = await this.getTemplateData(req.userDb, template.id);

      res.status(201).json(fullTemplate);
    } catch (error) {
      console.error('❌ Ошибка при создании шаблона:', error);
      res.status(500).json({
        message: 'Ошибка при создании шаблона',
        code: 'TEMPLATE_CREATE_ERROR',
        error: error.message
      });
    }
  }

  async getTemplates(req, res) {
    try {
      // Убеждаемся, что таблицы шаблонов существуют
      await this.ensureTemplateTables(req.user.userId);
      const templatesResult = await req.userDb.query(
        'SELECT * FROM templates ORDER BY date_of_creation DESC'
      );

      // Получаем данные для каждого шаблона
      const templatesWithData = await Promise.all(
        templatesResult.rows.map(async (template) => {
          return await this.getTemplateData(req.userDb, template.id);
        })
      );

      res.json(templatesWithData);
    } catch (error) {
      console.error('❌ Ошибка при получении шаблонов:', error);
      res.status(500).json({
        message: 'Ошибка при получении шаблонов',
        code: 'TEMPLATES_FETCH_ERROR',
        error: error.message
      });
    }
  }

  async getTemplate(req, res) {
    const id = req.params.id;

    try {
      // Убеждаемся, что таблицы шаблонов существуют
      await this.ensureTemplateTables(req.user.userId);
      const template = await req.userDb.query('SELECT * FROM templates WHERE id = $1', [id]);

      if (!template.rows || template.rows.length === 0) {
        return res.status(404).json({
          message: 'Шаблон не найден',
          code: 'TEMPLATE_NOT_FOUND'
        });
      }

      const fullTemplate = await this.getTemplateData(req.userDb, id);
      res.json(fullTemplate);
    } catch (error) {
      console.error('❌ Ошибка при получении шаблона:', error);
      res.status(500).json({
        message: 'Ошибка при получении шаблона',
        code: 'TEMPLATE_FETCH_ERROR',
        error: error.message
      });
    }
  }

  async updateTemplate(req, res) {
    const id = req.params.id;
    const { title, templateType, workersData, itrData } = req.body;

    try {
      // Убеждаемся, что таблицы шаблонов существуют
      await this.ensureTemplateTables(req.user.userId);
      // Проверяем существование шаблона
      const existingTemplate = await req.userDb.query('SELECT * FROM templates WHERE id = $1', [id]);

      if (!existingTemplate.rows || existingTemplate.rows.length === 0) {
        return res.status(404).json({
          message: 'Шаблон не найден',
          code: 'TEMPLATE_NOT_FOUND'
        });
      }

      const currentTemplate = existingTemplate.rows[0];

      // Обновляем основную информацию шаблона
      if (title !== undefined) {
        await req.userDb.query('UPDATE templates SET title = $1 WHERE id = $2', [title, id]);
      }

      if (templateType !== undefined) {
        if (templateType !== 'workers' && templateType !== 'itr') {
          return res.status(400).json({
            message: 'Тип шаблона должен быть "workers" или "itr"',
            code: 'INVALID_TEMPLATE_TYPE'
          });
        }
        await req.userDb.query('UPDATE templates SET template_type = $1 WHERE id = $2', [templateType, id]);
      }

      // Удаляем старые данные и добавляем новые
      if (workersData !== undefined || itrData !== undefined) {
        const finalTemplateType = templateType || currentTemplate.template_type;

        // Удаляем старые данные
        if (currentTemplate.template_type === 'workers') {
          await req.userDb.query('DELETE FROM template_workers_data_table WHERE template_id = $1', [id]);
        } else {
          await req.userDb.query('DELETE FROM template_itr_data_table WHERE template_id = $1', [id]);
        }

        // Добавляем новые данные
        if (finalTemplateType === 'workers') {
          if (workersData && Array.isArray(workersData)) {
            for (const row of workersData) {
              await req.userDb.query(
                `INSERT INTO template_workers_data_table 
                 (name, number_of_hours_worked, salary_per_day, salary_per_hour, total, template_id) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                  row.name || null,
                  row.numberOfHoursWorked || null,
                  row.salaryPerDay || null,
                  row.salaryPerHour || null,
                  row.total || null,
                  id
                ]
              );
            }
          }
        } else if (finalTemplateType === 'itr') {
          if (itrData && Array.isArray(itrData)) {
            for (const row of itrData) {
              await req.userDb.query(
                `INSERT INTO template_itr_data_table (name, salary_per_month, template_id) 
                 VALUES ($1, $2, $3)`,
                [
                  row.name || null,
                  row.salaryPerMonth || null,
                  id
                ]
              );
            }
          }
        }
      }

      // Возвращаем обновленный шаблон
      const updatedTemplate = await this.getTemplateData(req.userDb, id);
      res.json(updatedTemplate);
    } catch (error) {
      console.error('❌ Ошибка при обновлении шаблона:', error);
      res.status(500).json({
        message: 'Ошибка при обновлении шаблона',
        code: 'TEMPLATE_UPDATE_ERROR',
        error: error.message
      });
    }
  }

  async deleteTemplate(req, res) {
    const id = req.params.id;

    try {
      // Убеждаемся, что таблицы шаблонов существуют
      await this.ensureTemplateTables(req.user.userId);
      const template = await req.userDb.query('SELECT * FROM templates WHERE id = $1', [id]);

      if (!template.rows || template.rows.length === 0) {
        return res.status(404).json({
          message: 'Шаблон не найден',
          code: 'TEMPLATE_NOT_FOUND'
        });
      }

      // Удаление каскадное благодаря FOREIGN KEY, но удалим явно для ясности
      await req.userDb.query('DELETE FROM templates WHERE id = $1', [id]);

      res.json({
        message: 'Шаблон успешно удален',
        id: parseInt(id)
      });
    } catch (error) {
      console.error('❌ Ошибка при удалении шаблона:', error);
      res.status(500).json({
        message: 'Ошибка при удалении шаблона',
        code: 'TEMPLATE_DELETE_ERROR',
        error: error.message
      });
    }
  }

  // Вспомогательный метод для получения полных данных шаблона
  async getTemplateData(userDb, templateId) {
    const templateResult = await userDb.query('SELECT * FROM templates WHERE id = $1', [templateId]);

    if (!templateResult.rows || templateResult.rows.length === 0) {
      return null;
    }

    const template = templateResult.rows[0];

    if (template.template_type === 'workers') {
      const workersDataResult = await userDb.query(
        'SELECT * FROM template_workers_data_table WHERE template_id = $1 ORDER BY id',
        [templateId]
      );

      return {
        id: template.id,
        title: template.title,
        templateType: template.template_type,
        dateOfCreation: template.date_of_creation,
        workersData: workersDataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          numberOfHoursWorked: row.number_of_hours_worked,
          salaryPerDay: row.salary_per_day,
          salaryPerHour: row.salary_per_hour,
          total: row.total
        }))
      };
    } else if (template.template_type === 'itr') {
      const itrDataResult = await userDb.query(
        'SELECT * FROM template_itr_data_table WHERE template_id = $1 ORDER BY id',
        [templateId]
      );

      return {
        id: template.id,
        title: template.title,
        templateType: template.template_type,
        dateOfCreation: template.date_of_creation,
        itrData: itrDataResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          salaryPerMonth: row.salary_per_month
        }))
      };
    }

    return template;
  }
}

module.exports = new TemplateController();
