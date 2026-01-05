require('dotenv').config();
const Pool = require('pg').Pool;
const pool = new Pool({
	user: process.env.DB_USER || 'postgres',
	database: process.env.DB_NAME || 'calculations',
	password: process.env.DB_PASSWORD || 'root',
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT) || 5432,
})

module.exports = pool