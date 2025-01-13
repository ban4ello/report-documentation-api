const Pool = require('pg').Pool;
const pool = new Pool({
	// user: 'postgres',
	// database: 'postgres',
	user: 'calculations',
	database: 'calculations',
	password: 'root',
	host: 'localhost',
	port: 5432,
})

module.exports = pool