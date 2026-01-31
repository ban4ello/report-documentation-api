const swaggerJsdoc = require('swagger-jsdoc');

const devServer = { url: 'http://localhost:8000', description: 'Development' };
const productionUrl = process.env.API_URL ? process.env.API_URL.replace(/\/$/, '') : null;
const prodServer = productionUrl ? { url: productionUrl, description: 'Production (Railway)' } : null;

const servers = productionUrl ? [prodServer, devServer] : [devServer];

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Report Documentation API',
      version: '1.0.0',
      description: 'API для расчётов, отчётности и управления работниками'
    },
    servers,
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'JWT в cookie (устанавливается при /api/login)'
        }
      }
    },
    security: [{ cookieAuth: [] }]
  },
  apis: ['./routes/*.js']
};

module.exports = swaggerJsdoc(options);
