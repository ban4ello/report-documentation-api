const Pool = require('pg').Pool;
const pool = new Pool({
	user: 'calculations', // postgres
	password: 'root',
	host: 'localhost',
	port: 5432,
	database: 'calculations', // postgres
})

module.exports = pool