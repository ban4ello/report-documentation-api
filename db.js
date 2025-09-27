const Pool = require('pg').Pool;
const pool = new Pool({
	user: 'postgres',
	database: 'calculations',
	password: 'root',
	host: 'localhost',
	port: 5432,
})

module.exports = pool